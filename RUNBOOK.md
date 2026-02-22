# Twin City UI Runbook (Local Demo)

This is a Next.js MVP that overlays Zones (polygons) and Events (points) on a floorplan.

## Prerequisites
- Node.js 20+
- npm

## Setup
```bash
npm ci
```

Optional:
- Copy `.env.local.example` -> `.env.local` and set live data sources.

## Run
```bash
npm run dev
```
Open `http://127.0.0.1:3000`.

## Demo Script (3 minutes)
1. Start the UI and open the app.
2. Switch the data source to Demo/Practice mode.
3. Inject sample events and verify:
   - List <-> map selection sync
   - Filters + timeline + detail panel
   - Live/History navigation behavior

## Troubleshooting
- No events shown:
  - Use Demo mode and inject sample events.
- Live connection fails:
  - Confirm `NEXT_PUBLIC_EVENT_*` env vars and CORS on the source.
