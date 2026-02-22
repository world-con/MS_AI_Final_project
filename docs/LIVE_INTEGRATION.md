# Live Integration Scenario (API Contract + Payload Examples + Fallbacks)

This one-page guide explains how to wire **real operational event feeds** into TwinCity UI.

TwinCity UI is intentionally **offline-first**: if no live source is configured, it runs end-to-end in Demo mode using `/api/mock/events`.
When you do have a live feed, the UI can ingest it via **WebSocket, SSE, or HTTP polling**.

---

## 1) Transport Configuration (WS -> SSE -> HTTP Polling)

Create `.env.local` (start from `.env.local.example`) and set **one or more**:

```bash
# 1) WebSocket (highest priority)
NEXT_PUBLIC_EVENT_WS_URL=wss://example.com/events

# 2) Server-Sent Events (fallback)
NEXT_PUBLIC_EVENT_STREAM_URL=https://example.com/events/stream

# 3) HTTP polling (fallback)
NEXT_PUBLIC_EVENT_API_URL=https://example.com/events
NEXT_PUBLIC_EVENT_POLL_MS=5000
```

Selection logic:
- If `NEXT_PUBLIC_EVENT_WS_URL` is set, the UI uses **WebSocket**.
- Else if `NEXT_PUBLIC_EVENT_STREAM_URL` is set, the UI uses **SSE**.
- Else the UI uses **HTTP polling** (`NEXT_PUBLIC_EVENT_API_URL`).

Operational behavior:
- WS/SSE: auto-reconnect with exponential backoff (bounded).
- Polling: continues on a fixed interval; errors are shown in UI, next interval retries automatically.

---

## 2) What The UI Accepts (Payload Shapes)

TwinCity UI normalizes inconsistent provider payloads into a single internal schema (`EventItem`) using:
- `src/components/site/OpsExperience.tsx` (wrapper extraction + edge object merging)
- `src/lib/eventAdapter.ts` (field normalization + coordinate mapping)

### Accepted shapes (examples)

1) **Array of event records**
```json
[
  { "id": "evt_123", "timestamp": 1739168718, "category": "crowd", "position": { "x": 63.2, "y": 21.4, "unit": "percent" } }
]
```

2) **Wrapper with an array inside** (the UI extracts common paths)
```json
{ "type": "alert.batch", "payload": { "items": [ { "alarm_id": "alm-8f91", "timestamp": 1739168718 } ] } }
```
Supported array paths include (non-exhaustive): `events`, `records`, `items`, `payload.events`, `payload.records`, `payload.items`, etc.

3) **Edge device object stream** (objects array)
```json
{
  "deviceId": "camera-edge-01",
  "timestamp": "2026-02-12T12:05:00Z",
  "severity": "Critical",
  "data": {
    "frame": { "width": 1280, "height": 720 },
    "objects": [
      {
        "track_id": 101,
        "status": "fall_down",
        "confidence": 0.95,
        "location": { "bbox": [655, 307, 819, 472], "frame": { "width": 1280, "height": 720 } },
        "vlm_analysis": { "summary": "A person collapsed suddenly in the aisle.", "cause": "Faint", "action": "Call_119" }
      }
    ]
  }
}
```
The UI merges `{ parent + object }` into a single record before adapting it.

4) **Realtime sync command payloads** (upsert + remove + replace)
```json
{
  "type": "event.sync",
  "sync_mode": "replace",
  "events": [
    { "eventId": "evt_100", "timestamp": 1739168718, "category": "crowd", "position": { "x": 0.52, "y": 0.43 } }
  ],
  "deleted_ids": ["evt_044", "evt_051"]
}
```

Per-record delete is also supported:
```json
{ "op": "delete", "eventId": "evt_100" }
```
or
```json
{ "type": "event.deleted", "payload": { "eventId": "evt_100" } }
```

Sync behavior:
- default is **merge** (upsert by `id`)
- `sync_mode=replace` (or `snapshot=true`) clears previous remote events and applies the new list
- local photo seeds + manual map points are preserved unless their ids are explicitly deleted

---

## 3) Recommended Event Contract (Minimal Fields)

You do not have to match this exact schema, but this is the **recommended contract** for best UX.

### Identity (required)
- `id` (or `event_id`, `eventId`, `alarm_id`, `uuid`)
  - Must be stable so the UI can merge updates by `id`.

### Realtime sync fields (optional, recommended)
- `op` / `operation`
  - `delete|remove` removes the event by id
  - `create|update|upsert` treats the row as an upsert
- `deleted_ids` / `removed_ids`
  - bulk deletion list
- `sync_mode`
  - `merge` (default) or `replace` (snapshot/full sync)

### Time (required)
- `detected_at` (or `detectedAt`, `timestamp`, `ts`, `created_at`)
  - Accepts epoch seconds, epoch ms, or ISO string (the adapter converts it).
- `ingested_at` (optional; used to derive latency if present)

### Type / severity / status (recommended)
- type: `type` or `category` or `eventType` (e.g., `fall`, `crowd`, `fight`, `loitering`)
  - Common aliases are normalized (e.g., `fall_down`, `slip` -> `fall`).
- severity: `priority` / `level` / `severity` (e.g., `P1`, `high`, `critical` -> severity 3)
- status: `status` / `state`
  - Normalized into `new`, `ack`, `resolved`.

### Location (required: one of the following)
1) Normalized coordinates:
   - `x`, `y` in **0..1**
2) Percent coordinates:
   - `position.x`, `position.y` with `unit=percent` (0..100)
3) Bounding box:
   - `location.bbox: [x1, y1, x2, y2]` + `frame.width/height`
4) World coordinates:
   - `location.world: { x, z }` (meters)

### Zone/camera (recommended)
- `zone_id` / `zoneId` / `zone.id`
- `camera_id` / `cameraId` / `deviceId`

If zone is missing, the UI assigns a zone using point-in-polygon or nearest centroid.

---

## 4) Coordinate Mapping + Fallbacks

The adapter resolves the point using this preference:
1. Explicit x/y (0..1) or percent (0..100)
2. World coordinates (meters) mapped into floorplan normalized space
3. Bounding box bottom-center mapped into normalized space
4. If camera calibration is available, bbox is mapped using homography

Then it snaps the point onto walkable floor space:
- zones are polygons, and holes represent non-walkable areas (shelves/islands).

Calibration inputs (optional):
- `src/data/camera_calibration_s001.json`

Zone map inputs:
- `src/data/zone_map_s001.json`

---

## 5) Failure Handling (What Happens When Things Go Wrong)

If a payload is malformed:
- If it cannot be parsed as JSON (WS/SSE strings), it is ignored.
- If required fields are missing (id/time/location), the record is dropped.

If the feed is unstable:
- WS/SSE: reconnect attempts are shown in the UI status line.
- Polling: the UI keeps retrying on every interval; error is surfaced to the operator.

If coordinates land outside expected areas:
- The adapter clamps to 0..1 and snaps to the closest valid walkable point.

---

## 6) CORS / Security Notes (Practical)

Because this UI runs in a browser:
- HTTP polling and SSE require proper CORS headers (`Access-Control-Allow-Origin`).
- For private deployments, the simplest approach is to serve the feed under the same origin (reverse proxy), or use a short-lived signed URL.
- Avoid embedding PII in event payloads; treat it as an operational signal stream.

---

## 7) Local Testing Without A Backend

Use the built-in mock endpoint:
- `/api/mock/events?shape=a&count=6`
- `/api/mock/events?shape=b&count=6`
- `/api/mock/events?shape=edge&count=4`

Example:
```bash
NEXT_PUBLIC_EVENT_API_URL=http://localhost:3000/api/mock/events?shape=b&count=6
NEXT_PUBLIC_EVENT_POLL_MS=4000
```
