# TwinCity UI — Store Digital Twin Ops Console (WIP)

TwinCity UI is a Next.js (React/TypeScript) operations dashboard that overlays **Zones (polygons)** and **Events (points)** on a floorplan. The primary goal is to help an operator quickly **search, filter, and resolve** real-time alerts by combining:

- Spatial context (where it happened)
- Event context (what happened, severity, status)
- Operational workflow (acknowledge, dispatch, resolve + timeline)

This project is **in progress**. To keep it reviewable without depending on external infrastructure, it includes **demo tools and local mock endpoints** so the UI runs end-to-end with no live data sources.

## Key UX Features
- Live / Demo mode toggle (data transport priority: **WS -> SSE -> HTTP polling**)
- Live window + filtering by type/severity/status (open-only)
- List <-> map selection synchronization
- Detail panel actions (ACK / dispatch / resolve) and an incident timeline
- Local state persistence (localStorage) to restore operator context after refresh
- Keyboard navigation shortcuts (`/`, `Esc`)
- 2D/3D view toggle and Zone/Hole debug overlays

## Data Ingestion
### Live sources (optional)
Set one or more env vars in `.env.local` (start from `.env.local.example`):
```bash
NEXT_PUBLIC_EVENT_WS_URL=wss://example.com/events
NEXT_PUBLIC_EVENT_STREAM_URL=https://example.com/events/stream
NEXT_PUBLIC_EVENT_API_URL=https://example.com/events
NEXT_PUBLIC_EVENT_POLL_MS=5000
```
Priority is `WS -> SSE -> HTTP polling`. If nothing is configured, the UI stays in Demo mode.

## Architecture (High-level)
```mermaid
flowchart LR
  Live[Live Feed<br/>(WS / SSE / HTTP)] --> Adapter[eventAdapter.ts<br/>normalize + coordinate mapping]
  Mock[/api/mock/events/] --> Adapter
  Adapter --> State[Ops state<br/>(filters + timeline + actions)]
  State --> Map[Floorplan overlay<br/>(Zones + Events)]
  State --> List[Event list]
  State --> Detail[Detail panel]
```

### Payload normalization ("Ontology adapter")
Live feeds often differ by provider. `src/lib/eventAdapter.ts` normalizes multiple payload shapes into a single `EventItem` schema:

- Accepts: arrays, `{ events: [...] }`, `{ data: [...] }`, `{ event: {...} }`, or a single `{...event}`
- Extracts/normalizes: `id`, timestamps, type, severity, confidence, zone, coordinates, source/provider metadata
- Coordinates:
  - Prefers explicit `x/y` (0..1 or percent)
  - Falls back to `world` coordinates if provided (and maps them into 0..1)
  - Falls back to `bbox` bottom-center (optionally with camera homography calibration)
  - Snaps points back onto walkable floor space (zone polygons + holes)

## Local Mock Endpoints
These endpoints generate realistic samples (including different payload shapes) so the UI can be tested without a backend:

- `GET /api/mock/events?shape=a&count=4`
- `GET /api/mock/events?shape=b&count=4`
- `GET /api/mock/events?shape=single`
- `GET /api/mock/events?shape=edge&count=4`

Example `.env.local` for polling the local mock feed:
```bash
NEXT_PUBLIC_EVENT_API_URL=http://localhost:3000/api/mock/events?shape=b&count=6
NEXT_PUBLIC_EVENT_POLL_MS=4000
```

## Floorplan & Zone Data
- `src/data/zone_map_s001.json`: zone polygons for a reference floorplan resolution
- `src/data/camera_calibration_s001.json`: optional camera calibration (4-point homography)
- Dummy event generator: `src/lib/dummy.ts`

## Run Locally
### Prerequisites
- Node.js 20+
- npm

### Install & run
```bash
npm ci
npm run dev
```
Open `http://127.0.0.1:3000/events`.

## Deployment Note
For MVP, the UI can be deployed as a static site (or using standard Next.js hosting). Live data sources are configured by environment variables, so the same build can point to different feeds per environment.

## Ops Artifacts (Portfolio)
- `RUNBOOK.md` (local demo runbook)
- `POSTMORTEM_TEMPLATE.md` (incident postmortem template)
- `.github/workflows/ci.yml` (CI: lint + build)
