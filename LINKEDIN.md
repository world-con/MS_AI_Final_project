[Team Project, WIP] TwinCity UI — Digital Twin Ops Console (Next.js)

TwinCity UI is a Next.js (React/TypeScript) operator console that overlays Zones (polygons) and Events (points) on a store floorplan so an operator can triage alerts faster by combining spatial context (where), event context (what/severity/status), and workflow context (next action + timeline) in one screen.

What I owned (end-to-end UX + reliability)
- Frontend: Live/History views, filters (type/severity/status), detail panel, incident timeline, and settings
- Map overlay: zone + label + event rendering, plus list ↔ map ↔ detail selection sync
- Operator actions: ACK / dispatch / resolve with timeline entries and SLA reminders (time-to-ack / time-to-resolve)
- Demo-first workflow: runs end-to-end without external infrastructure using local mock feeds + replay tools
- Live feed wiring: WS → SSE → HTTP polling fallback with connection state + auto-retry behavior (dev/prod env separation)
- “Ontology adapter”: normalize inconsistent provider payload shapes into a single `EventItem` schema (id/time/type/severity/status/zone/coords)
- Coordinate mapping: percent/world/bbox → normalized 0..1, optional camera homography calibration, and snap-to-walkable zones (holes supported)

Why this mattered
In ops products, the hard part isn’t just rendering a map. It’s handling messy payloads, unstable transports, and inconsistent coordinates while keeping operator context stable. I treated this UI as an ops-grade surface: resilient ingestion + deterministic state + fast triage.

Engineering rigor
- Unit tests for adapter/normalization (Vitest)
- CI runs lint + test + build
- One-page live integration doc (API contract, payload examples, and failure/fallback behavior): `docs/LIVE_INTEGRATION.md`

GitHub:
https://github.com/KIM3310/twincity-ui

