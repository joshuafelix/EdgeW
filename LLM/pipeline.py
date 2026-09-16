"""
EdgeWatch ingestion + LLM analysis pipeline.

Reads the JSON telemetry stream (from a real ESP32 over serial, a replayed
log file, or the built-in mock generator), buffers a sliding window per
node, and periodically sends the ENTIRE fleet's windowed data to Claude in
one batched call for anomaly detection + failure prediction.

Usage:
    python pipeline.py --source mock --analysis-interval 15 --duration 60
    python pipeline.py --source serial --port COM5 --baud 115200
    python pipeline.py --source file --path capture.log --replay-delay 0.2

Env:
    ANTHROPIC_API_KEY   required if --provider claude (default) and not --dry-run
    GEMINI_API_KEY      required if --provider gemini and not --dry-run
    CLAUDE_MODEL        optional override, defaults to claude-sonnet-5
    GEMINI_MODEL        optional override, defaults to gemini-2.5-flash

    Loaded automatically from a .env file in this directory, if present.
"""

import argparse
import json
import logging
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

from buffer import TelemetryBuffer
from schema import TelemetryReading
from serial_reader import get_source
from storage import Storage

load_dotenv()  # reads .env in the current directory into os.environ, if it exists

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("edgewatch")

LATEST_SNAPSHOT_PATH = "latest_snapshot.json"


def parse_args():
    p = argparse.ArgumentParser(description="EdgeWatch ingestion + LLM analysis pipeline")
    p.add_argument("--source", choices=["serial", "wokwi", "file", "mock"], default="mock")
    p.add_argument("--port", help="serial port, e.g. COM5 or /dev/ttyUSB0")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--rfc2217-host", default="localhost", help="wokwi source: host running the VS Code simulator")
    p.add_argument("--rfc2217-port", type=int, default=8000, help="wokwi source: must match rfc2217ServerPort in wokwi.toml")
    p.add_argument("--path", help="log file path for --source file")
    p.add_argument("--replay-delay", type=float, default=0.0, help="seconds between replayed lines")
    p.add_argument("--interval", type=float, default=5.0, help="mock source: seconds between readings")
    p.add_argument("--window-size", type=int, default=12, help="readings kept per node (12 * 5s ~= 60s)")
    p.add_argument("--analysis-interval", type=float, default=30.0, help="seconds between LLM analysis runs")
    p.add_argument("--db", default="edgewatch.db")
    p.add_argument("--duration", type=float, default=None, help="stop after N seconds (omit to run forever)")
    p.add_argument("--dry-run", action="store_true", help="skip LLM calls; just print buffered snapshots")
    p.add_argument("--provider", choices=["claude", "gemini", "openrouter", "freellm"], default="gemini", help="which LLM to use for analysis")
    return p.parse_args()


def print_alerts(analysis: dict) -> None:
    for node in analysis.get("nodes", []):
        if node.get("anomaly"):
            log.warning(
                "ALERT  %-10s  risk=%-3s  trend=%-10s  eta=%-10s  %s",
                node.get("node_id"),
                node.get("risk_score"),
                node.get("trend"),
                node.get("predicted_failure_window") or "-",
                node.get("reasoning"),
            )
    summary = analysis.get("fleet_summary")
    if summary:
        log.info("Fleet summary: %s", summary)


def write_latest_snapshot(analysis: dict) -> None:
    """Small JSON file a future dashboard can poll without touching SQLite."""
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), **analysis}
    with open(LATEST_SNAPSHOT_PATH, "w") as f:
        json.dump(payload, f, indent=2)


def main():
    args = parse_args()

    if args.source == "serial" and not args.port:
        raise SystemExit("--port is required for --source serial")
    if args.source == "file" and not args.path:
        raise SystemExit("--path is required for --source file")

    source_kwargs = {
        "serial": {"port": args.port, "baud": args.baud},
        "wokwi": {"host": args.rfc2217_host, "rfc2217_port": args.rfc2217_port, "baud": args.baud},
        "file": {"path": args.path, "replay_delay": args.replay_delay},
        "mock": {"interval": args.interval},
    }[args.source]

    lines = get_source(args.source, **source_kwargs)
    buf = TelemetryBuffer(window_size=args.window_size)
    store = Storage(args.db)

    analyzer = None
    if not args.dry_run:
        from llm_analyzer import LLMAnalyzer  # lazy import: no provider SDK needed in dry-run
        analyzer = LLMAnalyzer(provider=args.provider)

    log.info("EdgeWatch pipeline started (source=%s, provider=%s, dry_run=%s)", args.source, args.provider, args.dry_run)

    start = time.monotonic()
    last_analysis = start  # bug fix: was 0.0, which caused an immediate false trigger
                            # since time.monotonic() doesn't start counting from zero

    try:
        for raw_line in lines:
            if args.duration is not None and (time.monotonic() - start) > args.duration:
                log.info("Duration limit reached, stopping.")
                break

            try:
                reading = TelemetryReading.from_raw_line(raw_line)
            except (ValueError, Exception) as e:  # tolerate boot noise / malformed lines
                if raw_line.strip():
                    log.debug("Skipping non-telemetry line: %r (%s)", raw_line, e)
                continue

            buf.add(reading)
            store.save_reading(reading)
            log.info(
                "%-10s  V=%.3fV  T=%.1fC  vib=%s  rssi=%sdBm  cpu=%.1f%%  behavior=%s",
                reading.node_id, reading.voltage_v, reading.temperature_c,
                reading.vibration_g, reading.rssi_dbm, reading.cpu_load_pct, reading.behavior,
            )

            now = time.monotonic()
            if now - last_analysis >= args.analysis_interval:
                last_analysis = now
                snapshot = buf.snapshot()
                if args.dry_run:
                    log.info("[dry-run] buffered nodes=%s readings=%s", buf.node_ids(), buf.reading_count())
                    continue
                log.info("Running LLM analysis over %d nodes...", len(snapshot))
                assert analyzer is not None  # guaranteed set above since dry_run is False here
                try:
                    analysis = analyzer.analyze(snapshot)
                except Exception as e:
                    # Transient API errors (503 overload, rate limits, network blips)
                    # shouldn't kill the whole pipeline — skip this cycle and keep ingesting.
                    log.warning("LLM analysis call failed (%s), will retry next cycle.", e)
                    continue
                print_alerts(analysis)
                store.save_analysis(analysis)
                write_latest_snapshot(analysis)

    except KeyboardInterrupt:
        log.info("Interrupted, shutting down.")
    finally:
        store.close()


if __name__ == "__main__":
    main()