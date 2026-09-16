import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ArrowLeft, Power, User, Radio } from "lucide-react";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const noise = () => Math.random() - 0.5;

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getStatus(voltage, temperature) {
  if (voltage < 4.0) return "critical-voltage";
  if (voltage < 4.25) return "watch-voltage";
  if (temperature > 44) return "critical-temp";
  if (temperature > 37) return "watch-temp";
  return "normal";
}

const STATUS_META = {
  normal: { label: "Normal", tone: "normal" },
  "watch-voltage": { label: "Voltage watch", tone: "watch" },
  "critical-voltage": { label: "Voltage drop", tone: "critical" },
  "watch-temp": { label: "Temp watch", tone: "watch" },
  "critical-temp": { label: "Temperature rise", tone: "critical" },
  offline: { label: "Offline", tone: "offline" },
};

function getReasoning(n) {
  if (!n.on) {
    return "Node is powered off. Bring it online to resume monitoring and analysis.";
  }
  switch (n.status) {
    case "critical-voltage":
      return `Voltage has fallen to ${n.voltage.toFixed(2)}V, a sustained decline over the last several batches that's consistent with power-supply degradation rather than sensor noise. Recommend physical inspection of the regulator within the next few hours.`;
    case "watch-voltage":
      return "Voltage is trending down toward the safe threshold. Not critical yet, but it's being tracked closely over the next few batches.";
    case "critical-temp":
      return `Temperature has climbed to ${n.temperature.toFixed(1)}°C, well above the fleet baseline. The pattern matches restricted airflow or a failing fan rather than a load spike. Recommend checking enclosure ventilation.`;
    case "watch-temp":
      return "Temperature is rising gradually. Still within tolerance, flagged early so it can be tracked before it becomes an issue.";
    default:
      return "All readings are within normal range and stable across the last several batches. No action needed.";
  }
}

function makeInitialNodes() {
  return [1, 2, 3, 4, 5, 6].map((id) => ({
    id,
    name: `Node ${id}`,
    on: true,
    voltage: 4.58 + Math.random() * 0.06,
    temperature: 27 + Math.random() * 3,
    vibration: 2.25 + Math.random() * 0.15,
    rssi: -50 - Math.random() * 10,
    cpu: 19 + Math.random() * 7,
    uptime: 2000 + Math.random() * 30000,
    status: "normal",
    healthScore: 92,
    history: [],
  }));
}

function updateNode(n) {
  if (!n.on) return n;

  let voltage = n.voltage;
  let temperature = n.temperature;

  if (n.id === 3) {
    voltage = Math.max(3.55, voltage - (0.015 + Math.random() * 0.012));
  } else {
    voltage = clamp(voltage + noise() * 0.02, 4.4, 4.7);
  }

  if (n.id === 5) {
    temperature = Math.min(53, temperature + (0.4 + Math.random() * 0.35));
  } else {
    temperature = clamp(temperature + noise() * 0.6, 25, 33);
  }

  const vibration = clamp(n.vibration + noise() * 0.05, 2.1, 2.6);
  const rssi = clamp(n.rssi + noise() * 2, -70, -46);
  const cpu = clamp(n.cpu + noise() * 1.6, 16, 36);
  const uptime = n.uptime + 2.2;

  const healthScore = clamp(
    100 - Math.abs(voltage - 4.6) * 95 - Math.max(0, temperature - 31) * 3.4 - Math.max(0, vibration - 2.3) * 12,
    4,
    99
  );

  const status = getStatus(voltage, temperature);
  const history = [...n.history, { t: n.history.length, health: Math.round(healthScore) }].slice(-26);

  return { ...n, voltage, temperature, vibration, rssi, cpu, uptime, status, healthScore, history };
}

export default function EdgeWatchDashboard() {
  const [nodes, setNodes] = useState(makeInitialNodes);
  const [selectedId, setSelectedId] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [feed, setFeed] = useState([]);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Poll the real EdgeWatch backend (api_server.py) instead of simulating data.
  // Requires uvicorn api_server:app --reload --port 8000 running locally.
  const API_BASE = "http://localhost:8000";

  useEffect(() => {
    const pollLatest = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/latest`);
        const data = await res.json();
        const analysisNodes = data.nodes || [];

        setNodes((prev) =>
          prev.map((n) => {
            const nodeId = `node-0${n.id}`;
            const match = analysisNodes.find((a) => a.node_id === nodeId);
            const anomaly = match?.anomaly ?? false;
            const trend = match?.trend;
            const status = !n.on
              ? n.status
              : anomaly
              ? n.id === 3
                ? "critical-voltage"
                : n.id === 5
                ? "critical-temp"
                : "watch-voltage"
              : "normal";
            const healthScore = anomaly ? clamp(n.healthScore - 4, 4, 99) : clamp(n.healthScore + 1, 4, 99);
            const history = [...n.history, { t: n.history.length, health: Math.round(healthScore) }].slice(-26);
            return { ...n, status, healthScore, history, reasoning: match?.reasoning, trend };
          })
        );
      } catch (err) {
        console.error("Failed to fetch /api/latest — is api_server.py running on :8000?", err);
      }
    };
    pollLatest();
    const id = setInterval(pollLatest, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const pollBatchLog = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/batch-log`);
        const log = await res.json();
        setFeed(
          log.map((entry) => ({
            time: entry.time,
            text:
              entry.flagged.length === 0
                ? "Batch analyzed — all nominal."
                : `Batch analyzed — flagged: ${entry.flagged.join(", ")}.`,
            tone: entry.flagged.length === 0 ? "normal" : "alert",
          }))
        );
      } catch (err) {
        console.error("Failed to fetch /api/batch-log — is api_server.py running on :8000?", err);
      }
    };
    pollBatchLog();
    const id = setInterval(pollBatchLog, 5000);
    return () => clearInterval(id);
  }, []);

  const toggleNode = (id, e) => {
    e.stopPropagation();
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, on: !n.on } : n)));
  };

  const setAll = (on) => {
    setNodes((prev) => prev.map((n) => ({ ...n, on })));
  };

  const onlineCount = nodes.filter((n) => n.on).length;
  const selected = nodes.find((n) => n.id === selectedId);

  return (
    <div className="ew-root">
      <style>{`
        .ew-root {
          --bg: #10151b;
          --panel: #171f28;
          --panel-elevated: #1d2731;
          --border: #29333d;
          --text: #e8edf3;
          --text-dim: #8b98a5;
          --text-faint: #576270;
          --teal: #43c6b0;
          --amber: #e3a13c;
          --coral: #e2585b;
          --violet: #9c8fea;
          --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-ui);
          border-radius: 12px;
          padding: 20px;
          min-height: 100%;
          box-sizing: border-box;
        }
        .ew-root * { box-sizing: border-box; }
        .ew-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        .ew-title { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
        .ew-subtitle { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
        .ew-header-right { display: flex; align-items: center; gap: 10px; position: relative; }
        .ew-online-pill {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--teal);
          background: rgba(67,198,176,0.1);
          border: 1px solid rgba(67,198,176,0.35);
          border-radius: 20px;
          padding: 5px 12px;
        }
        .ew-btn {
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--text);
          background: var(--panel-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 12px;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .ew-btn:hover { border-color: var(--text-faint); }
        .ew-btn.danger:hover { border-color: var(--coral); color: var(--coral); }
        .ew-avatar-btn {
          width: 34px; height: 34px; border-radius: 50%;
          background: var(--violet);
          color: #14101f;
          font-weight: 600;
          font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
        }
        .ew-profile-panel {
          position: absolute;
          top: 44px; right: 0;
          width: 240px;
          background: var(--panel-elevated);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          display: flex; gap: 10px;
          z-index: 20;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        .ew-profile-name { font-weight: 600; font-size: 14px; }
        .ew-profile-role { color: var(--text-dim); font-size: 12px; margin-top: 2px; line-height: 1.4; }
        .ew-profile-project { color: var(--violet); font-size: 11px; margin-top: 8px; font-family: var(--font-mono); }
        .ew-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        .ew-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-left: 3px solid var(--text-faint);
          border-radius: 10px;
          padding: 14px;
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }
        .ew-card:hover { transform: translateY(-1px); border-color: var(--text-faint); }
        .ew-card[data-tone="normal"] { border-left-color: var(--teal); }
        .ew-card[data-tone="watch"] { border-left-color: var(--amber); }
        .ew-card[data-tone="critical"] { border-left-color: var(--coral); }
        .ew-card[data-tone="offline"] { border-left-color: var(--text-faint); opacity: 0.55; }
        .ew-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .ew-card-name { font-weight: 600; font-size: 14px; }
        .ew-power {
          width: 26px; height: 26px; border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--panel-elevated);
          color: var(--text-dim);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .ew-power.on { color: var(--teal); border-color: rgba(67,198,176,0.4); }
        .ew-readouts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 10px; }
        .ew-readout-label { color: var(--text-faint); font-size: 10.5px; }
        .ew-readout-value { font-family: var(--font-mono); font-size: 12.5px; color: var(--text); }
        .ew-badge {
          display: inline-block;
          font-size: 11.5px;
          padding: 4px 10px;
          border-radius: 20px;
        }
        .ew-badge[data-tone="normal"] { background: rgba(67,198,176,0.12); color: var(--teal); }
        .ew-badge[data-tone="watch"] { background: rgba(227,161,60,0.14); color: var(--amber); }
        .ew-badge[data-tone="critical"] { background: rgba(226,88,91,0.16); color: var(--coral); }
        .ew-badge[data-tone="offline"] { background: rgba(87,98,112,0.18); color: var(--text-faint); }
        .ew-feed {
          margin-top: 20px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 16px;
        }
        .ew-panel-title { font-size: 12.5px; color: var(--text-dim); margin-bottom: 10px; }
        .ew-feed-empty { color: var(--text-faint); font-size: 13px; }
        .ew-feed-item {
          display: flex; gap: 10px;
          font-size: 12.5px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border);
          color: var(--text-dim);
        }
        .ew-feed-item:last-child { border-bottom: none; }
        .ew-feed-item[data-tone="alert"] { color: var(--text); }
        .ew-feed-time { font-family: var(--font-mono); color: var(--text-faint); flex-shrink: 0; }
        .ew-back {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; color: var(--text-dim);
          font-size: 13px; cursor: pointer; padding: 0; margin-bottom: 16px;
        }
        .ew-back:hover { color: var(--text); }
        .ew-detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .ew-detail-title { font-size: 20px; font-weight: 600; }
        .ew-detail-badge { margin-bottom: 18px; }
        .ew-detail-grid { display: grid; grid-template-columns: 1fr 1.3fr; gap: 14px; margin-bottom: 14px; }
        @media (max-width: 640px) { .ew-detail-grid { grid-template-columns: 1fr; } }
        .ew-readouts-panel, .ew-chart-panel, .ew-reasoning-panel {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
        }
        .ew-readouts-panel .ew-readouts { grid-template-columns: 1fr 1fr; gap: 14px 12px; }
        .ew-readouts-panel .ew-readout-value { font-size: 15px; }
        .ew-reasoning-panel p { font-size: 13.5px; line-height: 1.6; color: var(--text); margin: 0; }
        .ew-reasoning-tag { color: var(--violet); font-family: var(--font-mono); font-size: 11px; margin-bottom: 8px; display: block; }
      `}</style>

      {selected ? (
        <DetailView node={selected} onBack={() => setSelectedId(null)} onToggle={toggleNode} />
      ) : (
        <>
          <div className="ew-header">
            <div>
              <h1 className="ew-title">EdgeWatch</h1>
              <div className="ew-subtitle">Fleet monitoring · batched AI analysis</div>
            </div>
            <div className="ew-header-right">
              <span className="ew-online-pill">{onlineCount}/{nodes.length} online</span>
              <button className="ew-btn" onClick={() => setAll(true)}>All nodes on</button>
              <button className="ew-btn danger" onClick={() => setAll(false)}>All nodes off</button>
              <button className="ew-avatar-btn" onClick={() => setShowProfile((s) => !s)}>F</button>
              {showProfile && (
                <div className="ew-profile-panel">
                  <User size={30} color="#9c8fea" />
                  <div>
                    <div className="ew-profile-name">Felix</div>
                    <div className="ew-profile-role">B.E. Electronics &amp; Communication · Jerusalem College of Engineering</div>
                    <div className="ew-profile-project">EdgeWatch · AI Infra Summit Hackathon</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="ew-grid">
            {nodes.map((n) => {
              const tone = n.on ? STATUS_META[n.status].tone : "offline";
              const label = n.on ? STATUS_META[n.status].label : "Offline";
              return (
                <div key={n.id} className="ew-card" data-tone={tone} onClick={() => setSelectedId(n.id)}>
                  <div className="ew-card-top">
                    <span className="ew-card-name">{n.name}</span>
                    <button className={`ew-power ${n.on ? "on" : ""}`} onClick={(e) => toggleNode(n.id, e)} aria-label={n.on ? "Turn off" : "Turn on"}>
                      <Power size={13} />
                    </button>
                  </div>
                  <div className="ew-readouts">
                    <div><div className="ew-readout-label">Voltage</div><div className="ew-readout-value">{n.voltage.toFixed(2)}V</div></div>
                    <div><div className="ew-readout-label">Temperature</div><div className="ew-readout-value">{n.temperature.toFixed(1)}°C</div></div>
                    <div><div className="ew-readout-label">Vibration</div><div className="ew-readout-value">{n.vibration.toFixed(2)}g</div></div>
                    <div><div className="ew-readout-label">RSSI</div><div className="ew-readout-value">{n.rssi.toFixed(0)}dBm</div></div>
                  </div>
                  <span className="ew-badge" data-tone={tone}>{label}</span>
                </div>
              );
            })}
          </div>

          <div className="ew-feed">
            <div className="ew-panel-title">AI batch insight feed</div>
            {feed.length === 0 ? (
              <div className="ew-feed-empty">Waiting for the first batch analysis…</div>
            ) : (
              feed.map((e, i) => (
                <div key={i} className="ew-feed-item" data-tone={e.tone}>
                  <span className="ew-feed-time">{e.time}</span>
                  <span>{e.text}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DetailView({ node, onBack, onToggle }) {
  const tone = node.on ? STATUS_META[node.status].tone : "offline";
  const label = node.on ? STATUS_META[node.status].label : "Offline";
  const chartColor = tone === "critical" ? "#e2585b" : tone === "watch" ? "#e3a13c" : "#43c6b0";

  return (
    <div>
      <button className="ew-back" onClick={onBack}><ArrowLeft size={15} /> Back to fleet</button>
      <div className="ew-detail-header">
        <div className="ew-detail-title">{node.name}</div>
        <button className="ew-btn" onClick={(e) => onToggle(node.id, e)}>{node.on ? "Turn off" : "Turn on"}</button>
      </div>
      <div className="ew-detail-badge"><span className="ew-badge" data-tone={tone}>{label}</span></div>

      <div className="ew-detail-grid">
        <div className="ew-readouts-panel">
          <div className="ew-panel-title">Readings</div>
          <div className="ew-readouts">
            <div><div className="ew-readout-label">Voltage</div><div className="ew-readout-value">{node.voltage.toFixed(2)}V</div></div>
            <div><div className="ew-readout-label">Temperature</div><div className="ew-readout-value">{node.temperature.toFixed(1)}°C</div></div>
            <div><div className="ew-readout-label">Vibration</div><div className="ew-readout-value">{node.vibration.toFixed(2)}g</div></div>
            <div><div className="ew-readout-label">RSSI</div><div className="ew-readout-value">{node.rssi.toFixed(0)}dBm</div></div>
            <div><div className="ew-readout-label">CPU load</div><div className="ew-readout-value">{node.cpu.toFixed(1)}%</div></div>
            <div><div className="ew-readout-label">Uptime</div><div className="ew-readout-value">{formatUptime(node.uptime)}</div></div>
          </div>
        </div>
        <div className="ew-chart-panel">
          <div className="ew-panel-title">Performance</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={node.history}>
              <CartesianGrid stroke="#29333d" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 100]} width={28} tick={{ fill: "#576270", fontSize: 10 }} stroke="#29333d" />
              <Tooltip
                contentStyle={{ background: "#1d2731", border: "1px solid #29333d", borderRadius: 8, fontSize: 12 }}
                labelFormatter={() => ""}
                formatter={(v) => [`${v}`, "Health"]}
              />
              <Line type="monotone" dataKey="health" stroke={chartColor} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="ew-reasoning-panel">
        <span className="ew-reasoning-tag">AI analysis</span>
        <p>{node.reasoning || getReasoning(node)}</p>
      </div>
    </div>
  );
}