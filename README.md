# EdgeWatch 🚨

### AI-Powered Fleet Telemetry & Anomaly Prediction

> **See issues before they become failures.**

EdgeWatch is an AI-powered monitoring pipeline for IoT and edge-device
fleets. It simulates a fleet of ESP32 devices, continuously collects
telemetry, maintains recent device history, and uses an LLM to analyze
the fleet for abnormal behavior and potential failures.

Instead of waiting for a machine to fail, EdgeWatch turns raw telemetry
into an early, explainable signal that helps an operator decide what
needs attention.

------------------------------------------------------------------------

## 🚀 Why EdgeWatch?

Modern IoT and edge fleets generate telemetry continuously: temperature,
voltage, vibration, signal strength, uptime, and more.

The challenge is not simply collecting this data. The challenge is
identifying the **subtle patterns that appear before a failure**.

A device may still be online while:

-   its voltage gradually falls,
-   its temperature steadily rises,
-   its readings drift away from the fleet's normal behavior,
-   or several telemetry signals begin changing together.

Traditional monitoring can tell an operator that something is already
wrong. EdgeWatch explores a different approach:

``` text
             RAW TELEMETRY
                   │
                   ▼
        ┌────────────────────┐
        │  INGESTION LAYER   │
        │ Python + Storage   │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  ROLLING HISTORY   │
        │ Recent 12 readings │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │    AI ANALYSIS     │
        │ Fleet-wide LLM     │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │ STRUCTURED INSIGHT │
        │ Health + anomalies │
        └─────────┬──────────┘
                  │
                  ▼
              OPERATOR
```

------------------------------------------------------------------------

## 🎯 Project Goals

EdgeWatch is designed to demonstrate an end-to-end AI infrastructure
workflow:

1.  **Simulate** a fleet of edge devices.
2.  **Stream** continuous telemetry from those devices.
3.  **Collect and organize** readings by device.
4.  **Maintain rolling telemetry windows** for recent behavior.
5.  **Analyze the fleet with an LLM** instead of querying devices
    independently.
6.  **Detect anomalous trends** and potential failure conditions.
7.  **Generate structured results** that can be consumed by a dashboard.
8.  **Give humans an explainable signal** for further investigation.

------------------------------------------------------------------------

## 🧩 Current Prototype

The current prototype uses **six simulated ESP32 devices** running in
**Wokwi**.

Each device periodically sends telemetry such as:

  Telemetry            Purpose
  -------------------- ----------------------------------------------
  🌡️ Temperature       Detect overheating or unusual thermal trends
  ⚡ Voltage           Detect power degradation
  📳 Vibration         Identify abnormal mechanical behavior
  📶 Signal Strength   Monitor connectivity quality
  ⏱️ Uptime            Track device availability/history

To demonstrate anomaly detection, two devices are intentionally given
abnormal behavior:

-   **Node 05** --- gradual voltage degradation
-   **Node 06** --- increasing temperature / overheating behavior

This creates controlled failure scenarios that allow the AI analysis
pipeline to be tested.

> **Note:** These are simulated devices and controlled demo scenarios,
> not production hardware measurements.

------------------------------------------------------------------------

# 🏗️ Architecture

``` text
┌───────────────────────────────────────────────────────────────┐
│                    EDGEWATCH ARCHITECTURE                    │
└───────────────────────────────────────────────────────────────┘

     SIMULATED EDGE FLEET
     ┌──────┐ ┌──────┐ ┌──────┐
     │ESP32 │ │ESP32 │ │ESP32 │
     │Node 1│ │Node 2│ │Node 3│
     └──┬───┘ └──┬───┘ └──┬───┘
        │        │        │
        ├────────┼────────┤
        │        │        │
     ┌──▼────────▼────────▼──┐
     │    TELEMETRY STREAM   │
     └────────────┬──────────┘
                  │
                  ▼
        ┌───────────────────┐
        │ PYTHON INGESTION  │
        │                   │
        │ • Receive data    │
        │ • Validate data   │
        │ • Group by node   │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │ ROLLING WINDOWS   │
        │ Last 12 readings  │
        │ per device        │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │     STORAGE       │
        │ Telemetry +       │
        │ analysis snapshots│
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │    LLM ANALYSIS   │
        │                   │
        │ Fleet telemetry   │
        │      ↓            │
        │ Anomaly reasoning │
        │      ↓            │
        │ Health / alerts   │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │ STRUCTURED OUTPUT │
        │                   │
        │ • Device status   │
        │ • Anomaly         │
        │ • Explanation     │
        │ • Prediction      │
        └─────────┬─────────┘
                  │
                  ▼
             DASHBOARD
          (Next development)
```

------------------------------------------------------------------------

# 🧠 The AI Layer

A key design decision in EdgeWatch is **fleet-level analysis**.

A naive implementation might send six independent requests:

``` text
Node 1 → LLM
Node 2 → LLM
Node 3 → LLM
Node 4 → LLM
Node 5 → LLM
Node 6 → LLM
```

EdgeWatch instead collects the recent history of the fleet and sends it
as a **single batch**:

``` text
Node 1 ─┐
Node 2 ─┤
Node 3 ─┤
Node 4 ─┼──► Fleet Telemetry Batch ──► LLM
Node 5 ─┤
Node 6 ─┘
```

This gives the model context about the broader fleet while reducing
unnecessary per-device AI requests.

The AI analysis can be instructed to:

-   classify device health,
-   identify suspicious telemetry trends,
-   explain why a device is abnormal,
-   compare recent behavior,
-   identify potential failure conditions,
-   estimate a failure horizon when the observed trend supports such an
    estimate,
-   and return machine-readable structured output.

### Example conceptual output

``` json
{
  "device_id": "NODE_05",
  "status": "critical",
  "anomaly": "voltage_degradation",
  "explanation": "Voltage has shown a sustained downward trend.",
  "recommended_action": "Investigate the device power system."
}
```

The exact output schema should match the implementation in the
repository.

------------------------------------------------------------------------

# 🔄 End-to-End Data Flow

### 1. Device simulation

Wokwi runs the simulated ESP32 fleet.

Each device periodically generates telemetry.

``` text
ESP32 → Temperature
      → Voltage
      → Vibration
      → Signal
      → Uptime
```

### 2. Telemetry ingestion

The Python service receives the incoming readings and associates them
with their device IDs.

### 3. Rolling history

EdgeWatch maintains the most recent **12 readings per device**.

This provides temporal context rather than asking the AI to reason from
a single point.

``` text
NODE_05

Reading 1  ─┐
Reading 2   │
Reading 3   │
...         ├──► Rolling Window
Reading 10  │
Reading 11  │
Reading 12 ─┘
```

### 4. Fleet-level AI analysis

The current window for all devices is packaged into a single analysis
request.

### 5. Structured results

The AI response is saved as a structured analysis snapshot.

### 6. Visualization

The snapshots are intended to feed a dashboard where a human operator
can see:

-   fleet health,
-   device status,
-   telemetry trends,
-   anomalies,
-   AI explanations,
-   and potential failure warnings.

------------------------------------------------------------------------

# 📊 Example Demo Scenario

EdgeWatch intentionally creates two abnormal devices.

## Node 05 --- Voltage Degradation

``` text
Voltage

3.8V ┤ █████████
3.7V ┤ ████████
3.6V ┤ ███████
3.5V ┤ ██████
3.4V ┤ █████
3.3V ┤ ████
     └──────────────────► Time
```

The important signal is not a single low reading. It is the **sustained
downward trend**.

EdgeWatch can surface this as an anomaly requiring investigation.

------------------------------------------------------------------------

## Node 06 --- Temperature Increase

``` text
Temperature

 35°C ┤ ███
 40°C ┤ ████
 45°C ┤ █████
 50°C ┤ ██████
 55°C ┤ ███████
 60°C ┤ ████████
      └──────────────────► Time
```

Again, the goal is to detect the developing pattern before the device
reaches an obvious failure state.

------------------------------------------------------------------------

# 🛠️ Technology Stack

  Layer                 Technology
  --------------------- ----------------------------------------
  Edge simulation       ESP32
  Device simulator      Wokwi
  Backend / ingestion   Python
  Telemetry transport   Project-configured telemetry source
  Storage               Lightweight database / project storage
  AI analysis           LLM API
  Output                Structured JSON / analysis snapshots
  Dashboard             Planned / next development stage

> Update this table if the repository uses specific technologies such as
> ThingSpeak, MQTT, SQLite, FastAPI, React, or another dashboard
> framework.

------------------------------------------------------------------------

# 📁 Suggested Repository Structure

``` text
edgewatch/
│
├── firmware/
│   ├── node01/
│   ├── node02/
│   ├── node03/
│   ├── node04/
│   ├── node05/
│   └── node06/
│
├── ingestion/
│   ├── collector.py
│   ├── processor.py
│   └── storage.py
│
├── ai/
│   ├── analyzer.py
│   ├── prompts.py
│   └── schemas.py
│
├── data/
│   └── snapshots/
│
├── dashboard/
│   └── ...
│
├── config/
│   └── ...
│
├── requirements.txt
├── .env.example
└── README.md
```

Adapt the structure to match the actual repository rather than creating
placeholder directories that do not exist.

------------------------------------------------------------------------

# ⚙️ Getting Started

## Prerequisites

Install:

-   Python 3.10+
-   A Wokwi account / Wokwi-compatible development setup
-   An API key for the selected LLM provider
-   Any telemetry/storage service required by the implementation

------------------------------------------------------------------------

## 1. Clone the repository

``` bash
git clone https://github.com/YOUR_USERNAME/edgewatch.git
cd edgewatch
```

Replace `YOUR_USERNAME/edgewatch` with the actual repository URL.

------------------------------------------------------------------------

## 2. Create a virtual environment

### macOS / Linux

``` bash
python3 -m venv .venv
source .venv/bin/activate
```

### Windows

``` powershell
python -m venv .venv
.venv\Scripts\activate
```

------------------------------------------------------------------------

## 3. Install dependencies

``` bash
pip install -r requirements.txt
```

------------------------------------------------------------------------

## 4. Configure environment variables

Create a `.env` file based on `.env.example`.

Example:

``` env
LLM_API_KEY=your_api_key_here

# Add project-specific telemetry configuration here
# TELEMETRY_URL=
# CHANNEL_ID=
# DATABASE_PATH=
```

**Never commit API keys or other secrets to GitHub.**

------------------------------------------------------------------------

## 5. Start the simulated devices

Open the appropriate Wokwi project(s) and start the ESP32 simulations.

The devices should begin generating telemetry at the configured
interval.

------------------------------------------------------------------------

## 6. Start the ingestion service

Use the command defined by the repository, for example:

``` bash
python ingestion/collector.py
```

The service should begin receiving and storing device telemetry.

------------------------------------------------------------------------

## 7. Run AI analysis

Run the project's analysis service, for example:

``` bash
python ai/analyzer.py
```

The analyzer collects the latest rolling telemetry windows and sends the
fleet data to the configured LLM API.

The resulting analysis is stored as a structured snapshot.

> Replace these commands with the exact commands used by the repository
> before publishing the README.

------------------------------------------------------------------------

# 🔐 Security

EdgeWatch uses an external AI API, so credentials must be handled
securely.

### Do

-   Store API keys in environment variables.
-   Use `.env` locally.
-   Commit `.env.example`, not `.env`.
-   Add `.env` to `.gitignore`.
-   Rotate keys if they are accidentally exposed.

### Do not

``` text
❌ Hard-code API keys
❌ Commit secrets to GitHub
❌ Put credentials inside ESP32 firmware
❌ Share private API responses containing sensitive data
```

------------------------------------------------------------------------

# 🧪 Failure Simulation

The project deliberately introduces abnormal behavior into selected
devices.

This allows the pipeline to be tested under controlled conditions.

  Device    Simulated Behavior      Purpose
  --------- ----------------------- ----------------------------
  Node 01   Normal                  Baseline
  Node 02   Normal                  Baseline
  Node 03   Normal                  Baseline
  Node 04   Normal / configurable   Additional fleet context
  Node 05   Voltage degradation     Failure detection scenario
  Node 06   Temperature increase    Overheating scenario

The exact device behavior should be kept synchronized with the firmware
implementation.

------------------------------------------------------------------------

# 📈 What Makes EdgeWatch Different?

### 1. It starts at the edge

The system begins with simulated devices rather than artificial data
generated directly inside an AI application.

### 2. It uses temporal context

A rolling history of readings gives the AI a view of how a device is
changing over time.

### 3. It analyzes the fleet

Recent telemetry is analyzed as a batch, allowing fleet-wide context
rather than isolated single-reading decisions.

### 4. It produces structured output

The AI response is designed to become data that another application can
consume, rather than just a conversational answer.

### 5. It connects AI to an operational problem

The goal is not simply "ask an AI a question."

The goal is:

``` text
Machine Data
     ↓
Detection
     ↓
Reasoning
     ↓
Early Warning
     ↓
Human Investigation
```

------------------------------------------------------------------------

# 🏆 Hackathon Value Proposition

EdgeWatch demonstrates how AI infrastructure can extend beyond
conventional chat applications.

It connects:

``` text
EDGE DEVICES
     ↓
CONTINUOUS TELEMETRY
     ↓
DATA INGESTION
     ↓
TEMPORAL PROCESSING
     ↓
FLEET-LEVEL AI
     ↓
STRUCTURED INSIGHTS
     ↓
OPERATOR ACTION
```

The project combines **IoT + edge computing + data infrastructure + LLM
reasoning** into one end-to-end workflow.

------------------------------------------------------------------------

# 🔮 Roadmap

## Phase 1 --- Prototype

-   [x] Simulated ESP32 fleet
-   [x] Continuous telemetry generation
-   [x] Controlled failure scenarios
-   [x] Python telemetry ingestion
-   [x] Rolling device history
-   [x] Fleet-level LLM analysis
-   [x] Structured analysis snapshots

## Phase 2 --- Visualization

-   [ ] Live fleet dashboard
-   [ ] Device health cards
-   [ ] Real-time telemetry charts
-   [ ] AI alert feed
-   [ ] Historical trend visualization

## Phase 3 --- Production-oriented Architecture

-   [ ] MQTT-based ingestion
-   [ ] Real ESP32 hardware
-   [ ] Scalable message processing
-   [ ] Time-series storage
-   [ ] Alert notifications
-   [ ] Authentication and access control

## Phase 4 --- Advanced Intelligence

-   [ ] Statistical anomaly detection
-   [ ] Hybrid ML + LLM analysis
-   [ ] Historical failure modeling
-   [ ] Device-specific baselines
-   [ ] Automated maintenance workflows

------------------------------------------------------------------------

# ⚠️ Current Limitations

EdgeWatch is currently a **prototype / hackathon demonstration**.

Important limitations include:

-   Devices are simulated rather than deployed physical assets.
-   Failure scenarios are intentionally scripted.
-   LLM predictions are probabilistic and should not be treated as
    guaranteed failure forecasts.
-   The dashboard is planned rather than fully implemented in the
    current prototype.
-   Production-scale reliability, security, observability, and cost
    controls require further engineering.
-   AI-generated recommendations should be reviewed by a human before
    operational action.

------------------------------------------------------------------------

# 🌍 Potential Applications

The same architecture could be adapted to monitor:

-   🚚 Connected vehicle fleets
-   🏭 Factory equipment
-   ⚡ Industrial sensors
-   🌡️ Environmental monitoring systems
-   🖥️ Edge servers
-   🏢 Smart buildings
-   🚜 Agricultural equipment
-   🔋 Battery-powered IoT deployments

The core idea remains the same:

> **Monitor continuously. Understand trends. Detect problems early.**

------------------------------------------------------------------------

# 🤝 Contributing

Contributions are welcome.

A typical workflow:

``` bash
git checkout -b feature/my-feature
```

Make your changes, test them, then:

``` bash
git add .
git commit -m "Add my feature"
git push origin feature/my-feature
```

Open a pull request describing:

-   What changed
-   Why it changed
-   How it was tested
-   Any limitations or follow-up work

------------------------------------------------------------------------

# 📜 License

Add the license selected for this project, for example:

``` text
MIT License
```

If a license has not yet been selected, do not claim that the project is
MIT-licensed.

------------------------------------------------------------------------

# 👨‍💻 Project

**EdgeWatch --- AI Fleet Telemetry & Anomaly Prediction**

### Built with

**ESP32 • Wokwi • Python • LLMs • IoT • Edge Computing**

### Core concept

``` text
SIMULATE
    ↓
STREAM
    ↓
STORE
    ↓
ANALYZE
    ↓
PREDICT
    ↓
PREVENT
```

> **EdgeWatch turns continuous edge telemetry into actionable early
> warnings.**

------------------------------------------------------------------------

## ⭐ If you find this project interesting

Star the repository and follow the project as EdgeWatch evolves from a
simulated fleet prototype toward real-time intelligent fleet monitoring.
