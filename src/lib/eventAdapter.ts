import zoneMap from "@/data/zone_map_s001.json";
import { MODEL_REF_DEPTH_M, MODEL_REF_WIDTH_M, worldToMapNorm } from "./coordinateTransform";
import { pointInPolygon } from "./geo";
import type { EventItem, EventSource, EventType, IncidentStatus, Point, ZoneMap } from "./types";

const EVENT_TYPES = new Set<EventType>(["crowd", "fall", "fight", "loitering", "unknown"]);
const INCIDENT_STATUSES = new Set<IncidentStatus>(["new", "ack", "resolved"]);
const EVENT_SOURCES = new Set<EventSource>(["demo", "camera", "api", "unknown"]);

const zm = zoneMap as ZoneMap;
const WORLD_OFFSET_X_M = Number.isFinite(Number(zm.map.world?.offset_x_m))
  ? Number(zm.map.world?.offset_x_m)
  : 0;
const WORLD_OFFSET_Z_M = Number.isFinite(Number(zm.map.world?.offset_z_m))
  ? Number(zm.map.world?.offset_z_m)
  : 0;

type RawRecord = Record<string, unknown>;
type NormalizeOptions = {
  maxEvents: number;
  fallbackStoreId?: string;
  defaultSource?: EventSource;
};
type NormalizedCoordinates = {
  x: number;
  y: number;
  worldX: number;
  worldY?: number;
  worldZ: number;
};

const MIN_VALID_EPOCH_MS = Date.UTC(2000, 0, 1, 0, 0, 0, 0);
const MAX_FUTURE_DRIFT_MS = 1000 * 60 * 60 * 24 * 365;

const ZONE_IDS = new Set(zm.zones.map((zone) => zone.zone_id));
const GENERIC_ZONE_IDS = new Set(["store", "site", "shop", "global", "all"]);
const ZONE_POLYGONS = zm.zones.map((zone) => {
  const polygon: Point[] = (zone.polygon ?? [])
    .filter((pair): pair is number[] => Array.isArray(pair) && pair.length >= 2)
    .map(([xPx, yPx]) => [
      clampRange(Number(xPx) / Math.max(1, zm.map.width), 0, 1),
      clampRange(Number(yPx) / Math.max(1, zm.map.height), 0, 1),
    ]);
  return { zoneId: zone.zone_id, polygon };
});
const ZONE_CENTROIDS = new Map(
  zm.zones.map((zone) => {
    const cx = Number(zone.centroid?.[0]);
    const cy = Number(zone.centroid?.[1]);
    return [
      zone.zone_id,
      {
        x: Number.isFinite(cx) ? clampRange(cx / Math.max(1, zm.map.width), 0, 1) : 0.5,
        y: Number.isFinite(cy) ? clampRange(cy / Math.max(1, zm.map.height), 0, 1) : 0.5,
      },
    ] as const;
  })
);

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as RawRecord;
}

function readPath(record: RawRecord, path: string): unknown {
  const chunks = path.split(".");
  let cursor: unknown = record;
  for (const chunk of chunks) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as RawRecord)[chunk];
  }
  return cursor;
}

function pickValue(record: RawRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(record, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function parseId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEpochMs(value: unknown): number | null {
  const normalizeEpoch = (epochMs: number): number | null => {
    if (!Number.isFinite(epochMs)) return null;
    const rounded = Math.round(epochMs);
    const now = Date.now();
    if (rounded < MIN_VALID_EPOCH_MS) return null;
    if (rounded > now + MAX_FUTURE_DRIFT_MS) return null;
    return rounded;
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1e12) return normalizeEpoch(value);
    if (value >= 1e9 && value <= 1e11) return normalizeEpoch(value * 1000);
    return normalizeEpoch(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) {
      if (asNum >= 1e12) return normalizeEpoch(asNum);
      if (asNum >= 1e9 && asNum <= 1e11) return normalizeEpoch(asNum * 1000);
      return normalizeEpoch(asNum);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return normalizeEpoch(parsed);
  }

  return null;
}

function normalizeCoordinate(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  if (parsed >= 0 && parsed <= 1) return parsed;
  if (parsed >= 0 && parsed <= 100) return clampRange(parsed / 100, 0, 1);
  return null;
}

function normalizeType(value: unknown): EventType {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (EVENT_TYPES.has(normalized as EventType)) return normalized as EventType;
  if (["fall_down", "slip", "slipfall", "trip"].includes(normalized)) return "fall";
  if (["violence", "assault", "aggressive", "fight"].includes(normalized)) return "fight";
  if (["queue", "congestion", "crowding", "crowd"].includes(normalized)) return "crowd";
  if (["loiter", "idle", "linger", "loitering"].includes(normalized)) return "loitering";
  return "unknown";
}

function normalizeSeverity(value: unknown, type: EventType): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["p1", "l3", "high", "critical", "severe", "urgent"].includes(normalized)) return 3;
    if (["p2", "l2", "medium", "med", "moderate"].includes(normalized)) return 2;
    if (["p3", "l1", "low", "minor"].includes(normalized)) return 1;

    const asNum = Number(normalized.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(asNum) && asNum >= 1 && asNum <= 3) {
      return Math.round(asNum) as 1 | 2 | 3;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 3) return 3;
    if (value >= 2) return 2;
    return 1;
  }

  if (type === "fall" || type === "fight") return 3;
  if (type === "crowd") return 2;
  return 1;
}

function normalizeIncidentStatus(value: unknown): IncidentStatus {
  if (typeof value !== "string") return "new";
  const normalized = value.trim().toLowerCase();
  if (INCIDENT_STATUSES.has(normalized as IncidentStatus)) return normalized as IncidentStatus;
  if (["open", "opened", "detected", "created", "new_alert"].includes(normalized)) return "new";
  if (["acknowledged", "acknowledge", "in_progress", "processing", "dispatched"].includes(normalized)) {
    return "ack";
  }
  if (["closed", "done", "resolved_done", "complete", "completed"].includes(normalized)) {
    return "resolved";
  }
  return "new";
}

function normalizeSource(value: unknown, fallback: EventSource): EventSource {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (EVENT_SOURCES.has(normalized as EventSource)) return normalized as EventSource;
  if (normalized.includes("camera")) return "camera";
  if (normalized.includes("demo")) return "demo";
  if (normalized.length > 0) return "api";
  return fallback;
}

function normalizeConfidence(value: unknown, severity: 1 | 2 | 3): number {
  const parsed = parseNumber(value);
  if (parsed !== null) {
    if (parsed > 1 && parsed <= 100) return clampRange(parsed / 100, 0, 1);
    return clampRange(parsed, 0, 1);
  }
  if (severity === 3) return 0.92;
  if (severity === 2) return 0.84;
  return 0.78;
}

function normToWorld(x: number, y: number) {
  const nx = clampRange(x, 0, 1);
  const ny = clampRange(y, 0, 1);
  return {
    worldX: WORLD_OFFSET_X_M + (nx - 0.5) * MODEL_REF_WIDTH_M,
    worldZ: WORLD_OFFSET_Z_M - (ny - 0.5) * MODEL_REF_DEPTH_M,
  };
}

function extractWorldCoordinates(record: RawRecord) {
  const worldX = parseNumber(
    pickValue(record, [
      "world.x",
      "worldX",
      "world_x",
      "position.world.x",
      "position_world.x",
      "location.world.x",
      "location.world_x",
      "location.x_m",
      "x_m",
    ])
  );
  const worldY = parseNumber(
    pickValue(record, [
      "world.y",
      "worldY",
      "world_y",
      "position.world.y",
      "position_world.y",
      "location.world.y",
      "location.world_y",
      "location.y_m",
      "y_m",
    ])
  );
  const worldZ = parseNumber(
    pickValue(record, [
      "world.z",
      "worldZ",
      "world_z",
      "position.world.z",
      "position_world.z",
      "location.world.z",
      "location.world_z",
      "location.z_m",
      "z_m",
    ])
  );
  if (worldX === null || worldZ === null) return null;
  const norm = worldToMapNorm(worldX - WORLD_OFFSET_X_M, worldZ - WORLD_OFFSET_Z_M);
  return {
    x: norm.x,
    y: norm.y,
    worldX,
    worldY: worldY ?? undefined,
    worldZ,
  } satisfies NormalizedCoordinates;
}

function extractNormXYFromRecord(record: RawRecord) {
  const x = normalizeCoordinate(
    pickValue(record, [
      "x",
      "x_norm",
      "xNorm",
      "position.x",
      "position.x_norm",
      "position.xNorm",
      "location.x",
      "location.x_norm",
      "location.xNorm",
      "coord.x",
      "coordinates.x",
      "point.x",
      "geo.x",
    ])
  );
  const y = normalizeCoordinate(
    pickValue(record, [
      "y",
      "y_norm",
      "yNorm",
      "position.y",
      "position.y_norm",
      "position.yNorm",
      "location.y",
      "location.y_norm",
      "location.yNorm",
      "coord.y",
      "coordinates.y",
      "point.y",
      "geo.y",
    ])
  );
  if (x !== null && y !== null) return { x, y };
  return null;
}

function extractNormPair(record: RawRecord) {
  const pairCandidate = pickValue(record, ["position", "location", "coord", "coordinates", "point"]);
  if (Array.isArray(pairCandidate) && pairCandidate.length >= 2) {
    const px = normalizeCoordinate(pairCandidate[0]);
    const py = normalizeCoordinate(pairCandidate[1]);
    if (px !== null && py !== null) return { x: px, y: py };
  }
  return null;
}

function extractCoordinates(record: RawRecord): NormalizedCoordinates | null {
  const explicit = extractNormXYFromRecord(record) ?? extractNormPair(record);
  if (explicit) {
    const world = normToWorld(explicit.x, explicit.y);
    return {
      x: explicit.x,
      y: explicit.y,
      worldX: world.worldX,
      worldZ: world.worldZ,
    };
  }
  const world = extractWorldCoordinates(record);
  if (world) return world;
  return null;
}

function resolveZoneId(record: RawRecord, coordinates: NormalizedCoordinates): string {
  const explicitZoneId = parseId(
    pickValue(record, [
      "zone_id",
      "zoneId",
      "zone.id",
      "zone.zone_id",
      "location.zone_id",
      "location.zoneId",
      "area_id",
      "areaId",
    ])
  );
  if (explicitZoneId) {
    if (ZONE_IDS.has(explicitZoneId)) return explicitZoneId;
    if (!GENERIC_ZONE_IDS.has(explicitZoneId.toLowerCase())) return explicitZoneId;
  }

  const containing = ZONE_POLYGONS.find((zone) => pointInPolygon(coordinates.x, coordinates.y, zone.polygon));
  if (containing) return containing.zoneId;

  let nearestZoneId = zm.zones[0]?.zone_id ?? "zone-s001-center";
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const [zoneId, centroid] of ZONE_CENTROIDS.entries()) {
    const dx = coordinates.x - centroid.x;
    const dy = coordinates.y - centroid.y;
    const dist = dx * dx + dy * dy;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestZoneId = zoneId;
    }
  }
  return nearestZoneId;
}

function resolveEventType(record: RawRecord) {
  const primary = normalizeType(
    pickValue(record, ["type", "event_type", "eventType", "category", "event_name", "label"])
  );
  if (primary !== "unknown") return primary;
  return normalizeType(pickValue(record, ["status", "state", "event_status", "eventState"]));
}

function extractNote(record: RawRecord) {
  const direct = parseText(
    pickValue(record, ["note", "message", "description", "reason", "summary", "vlm_analysis.summary"])
  );
  const cause = parseText(pickValue(record, ["vlm_analysis.cause", "analysis.cause"]));
  const action = parseText(
    pickValue(record, ["vlm_analysis.action", "analysis.action", "action", "recommended_action"])
  );
  const chunks = [direct, cause ? `cause:${cause}` : undefined, action ? `action:${action}` : undefined].filter(
    (row): row is string => Boolean(row)
  );
  return chunks.length > 0 ? chunks.join(" | ") : undefined;
}

export function adaptRawEvent(value: unknown, options: Omit<NormalizeOptions, "maxEvents"> = {}): EventItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const cameraId = parseId(
    pickValue(record, ["camera_id", "cameraId", "camera.id", "device_id", "deviceId", "device.id"])
  );
  const trackId = parseId(
    pickValue(record, ["track_id", "trackId", "tracking_id", "trackingId", "object_id", "objectId"])
  );
  const explicitId = parseId(
    pickValue(record, ["id", "event_id", "eventId", "uuid", "alarm_id", "alarmId", "alert_id", "alertId"])
  );
  const id = explicitId ?? (trackId ? `${cameraId ?? "cam-unknown"}:track-${trackId}` : null);
  if (!id) return null;

  const detectedAt = parseEpochMs(
    pickValue(record, ["detected_at", "detectedAt", "ts", "timestamp", "created_at", "createdAt", "time"])
  );
  if (detectedAt === null) return null;

  const ingestedAtRaw = parseEpochMs(
    pickValue(record, ["ingested_at", "ingestedAt", "received_at", "receivedAt", "updated_at", "updatedAt"])
  );
  const ingestedAt = ingestedAtRaw ?? detectedAt;

  const latencyRaw = parseNumber(pickValue(record, ["latency_ms", "latencyMs", "latency", "delay_ms"]));
  const latencyMs =
    latencyRaw !== null ? Math.max(0, Math.round(latencyRaw)) : Math.max(0, Math.round(ingestedAt - detectedAt));

  const type = resolveEventType(record);
  const severity = normalizeSeverity(
    pickValue(record, ["severity", "priority", "level", "risk", "risk_level", "riskLevel", "status", "state"]),
    type
  );
  const confidence = normalizeConfidence(
    pickValue(record, ["confidence", "score", "probability", "confidence_score", "confidenceScore"]),
    severity
  );
  const incidentStatus = normalizeIncidentStatus(
    pickValue(record, ["incident_status", "incidentStatus", "status", "state", "resolution", "result.status"])
  );

  const coordinates = extractCoordinates(record);
  if (!coordinates) return null;
  const zoneId = resolveZoneId(record, coordinates);

  const storeIdRaw = parseId(
    pickValue(record, ["store_id", "storeId", "store.id", "site_id", "siteId", "shop_id", "shopId"])
  );
  const storeId = storeIdRaw ?? options.fallbackStoreId ?? "s001";
  const source = normalizeSource(
    pickValue(record, ["source", "provider", "channel", "origin", "ingest_source"]),
    options.defaultSource ?? "unknown"
  );

  const objectLabelRaw = pickValue(record, [
    "label",
    "object.label",
    "class",
    "class_name",
    "object.class",
    "event_label",
  ]);
  const statusRaw = pickValue(record, ["status", "state", "event_status", "result.status", "payload.status"]);
  const modelVersion = parseId(pickValue(record, ["model_version", "modelVersion", "model.version"]));

  return {
    id,
    store_id: storeId,
    detected_at: detectedAt,
    ingested_at: ingestedAt,
    latency_ms: latencyMs,
    type,
    severity,
    confidence,
    zone_id: zoneId,
    camera_id: cameraId ?? undefined,
    track_id: trackId ?? undefined,
    object_label: typeof objectLabelRaw === "string" ? objectLabelRaw : undefined,
    raw_status: typeof statusRaw === "string" ? statusRaw : undefined,
    source,
    model_version: modelVersion ?? undefined,
    incident_status: incidentStatus,
    x: clampRange(coordinates.x, 0, 1),
    y: clampRange(coordinates.y, 0, 1),
    world_x_m: coordinates.worldX,
    world_z_m: coordinates.worldZ,
    note: extractNote(record),
  };
}

export function normalizeEventFeed(raw: unknown, options: NormalizeOptions): EventItem[] {
  if (!Array.isArray(raw)) return [];
  const safeMaxEvents = Math.max(1, Math.min(1000, Number(options.maxEvents) || 1));

  const normalized = raw
    .map((item) => adaptRawEvent(item, options))
    .filter((item): item is EventItem => item !== null);

  const dedupedById = new Map<string, EventItem>();
  for (const event of normalized) {
    const existing = dedupedById.get(event.id);
    if (!existing) {
      dedupedById.set(event.id, event);
      continue;
    }
    if (event.detected_at > existing.detected_at) {
      dedupedById.set(event.id, event);
      continue;
    }
    if (event.detected_at === existing.detected_at && event.ingested_at > existing.ingested_at) {
      dedupedById.set(event.id, event);
    }
  }

  return Array.from(dedupedById.values())
    .sort((a, b) => {
      if (b.detected_at !== a.detected_at) return b.detected_at - a.detected_at;
      if (b.ingested_at !== a.ingested_at) return b.ingested_at - a.ingested_at;
      return a.id.localeCompare(b.id);
    })
    .slice(0, safeMaxEvents);
}
