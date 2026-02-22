import zoneMap from "@/data/zone_map_s001.json";
import { worldToMapNorm } from "@/lib/coordinateTransform";
import { adaptRawEvent } from "@/lib/eventAdapter";
import type { EventItem, EventSource, ZoneMap } from "@/lib/types";

export type SignalTone = "idle" | "ok" | "watch" | "critical";

type SignalBase = {
  updatedAt: number | null;
  deviceId: string;
  zoneId: string;
  count: number;
  tone: SignalTone;
};

export type CrowdSignalState = SignalBase & {
  congestionLevel: string;
};

export type SafetySignalState = SignalBase & {
  severity: string;
  fallCount: number;
  summary: string;
  action: string;
};

export type TrashSignalState = SignalBase & {
  severity: string;
  trashCount: number;
};

export type SignalChecksState = {
  crowd: CrowdSignalState;
  safety: SafetySignalState;
  trash: TrashSignalState;
};

export type SignalChecksPatch = Partial<SignalChecksState>;

export type ParseSignalResult = {
  generatedEvents: EventItem[];
  patch: SignalChecksPatch;
  labels: string[];
};

type ParseSignalOptions = {
  fallbackStoreId?: string;
  defaultSource?: EventSource;
};

const zm = zoneMap as ZoneMap;
const WORLD_OFFSET_X_M = Number.isFinite(Number(zm.map.world?.offset_x_m))
  ? Number(zm.map.world?.offset_x_m)
  : 0;
const WORLD_OFFSET_Z_M = Number.isFinite(Number(zm.map.world?.offset_z_m))
  ? Number(zm.map.world?.offset_z_m)
  : 0;

export const INITIAL_SIGNAL_CHECKS: SignalChecksState = {
  crowd: {
    updatedAt: null,
    deviceId: "-",
    zoneId: "-",
    count: 0,
    tone: "idle",
    congestionLevel: "-",
  },
  safety: {
    updatedAt: null,
    deviceId: "-",
    zoneId: "-",
    count: 0,
    tone: "idle",
    severity: "-",
    fallCount: 0,
    summary: "-",
    action: "-",
  },
  trash: {
    updatedAt: null,
    deviceId: "-",
    zoneId: "-",
    count: 0,
    tone: "idle",
    severity: "-",
    trashCount: 0,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function parseText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseEpochMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1e12) return Math.round(value);
    if (value >= 1e9) return Math.round(value * 1000);
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    if (asNumber >= 1e12) return Math.round(asNumber);
    if (asNumber >= 1e9) return Math.round(asNumber * 1000);
    return null;
  }
  const asDate = Date.parse(trimmed);
  return Number.isNaN(asDate) ? null : asDate;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function severityToTone(severity: string | null): SignalTone {
  const normalized = severity?.toLowerCase() ?? "";
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("warn")) return "watch";
  if (normalized.includes("info")) return "ok";
  return "idle";
}

function severityToLevel(severity: string | null): 1 | 2 | 3 {
  const normalized = severity?.toLowerCase() ?? "";
  if (normalized.includes("critical")) return 3;
  if (normalized.includes("warn")) return 2;
  return 1;
}

function congestionToTone(level: string | null): SignalTone {
  const normalized = level?.toLowerCase() ?? "";
  if (normalized.includes("high")) return "critical";
  if (normalized.includes("medium")) return "watch";
  if (normalized.includes("low")) return "ok";
  return "idle";
}

function shouldReplaceByTime(currentAt: number | null, nextAt: number | null) {
  if (nextAt === null) return currentAt === null;
  if (currentAt === null) return true;
  return nextAt >= currentAt;
}

function mergePatchItem<T extends { updatedAt: number | null }>(prev: T, next?: T) {
  if (!next) return prev;
  return shouldReplaceByTime(prev.updatedAt, next.updatedAt) ? next : prev;
}

export function mergeSignalChecks(prev: SignalChecksState, patch: SignalChecksPatch): SignalChecksState {
  return {
    crowd: mergePatchItem(prev.crowd, patch.crowd),
    safety: mergePatchItem(prev.safety, patch.safety),
    trash: mergePatchItem(prev.trash, patch.trash),
  };
}

type BuildObjectEventInput = {
  envelopeType: "safety" | "cleaning";
  deviceId: string;
  severityText: string | null;
  timestampMs: number;
  defaultZoneId: string;
  storeId: string;
  source: EventSource;
  object: Record<string, unknown>;
  index: number;
  frameWidth: number;
  frameHeight: number;
};

function buildObjectEvent(input: BuildObjectEventInput): EventItem | null {
  const trackIdRaw = parseNumber(input.object.track_id);
  const trackId = trackIdRaw !== null ? String(Math.trunc(trackIdRaw)) : `${input.index}`;
  const status = parseText(input.object.status) ?? "unknown";
  const statusKey = status.toLowerCase();
  const parsedLabel = parseText(input.object.label);
  const label = input.envelopeType === "cleaning" ? null : (parsedLabel ?? "unknown");
  const confidence = parseNumber(input.object.confidence) ?? 0.75;

  const location = asRecord(input.object.location) ?? {};
  const world = asRecord(location.world);
  const worldX = parseNumber(world?.x);
  const worldZ = parseNumber(world?.z);
  const zoneId = parseText(location.zone_id) ?? input.defaultZoneId;

  const bbox = Array.isArray(location.bbox) ? location.bbox : [];
  const x1 = parseNumber(bbox[0]);
  const y1 = parseNumber(bbox[1]);
  const x2 = parseNumber(bbox[2]);
  const y2 = parseNumber(bbox[3]);
  const hasBbox = x1 !== null && y1 !== null && x2 !== null && y2 !== null;

  const eventType =
    input.envelopeType === "safety"
      ? statusKey.includes("fall")
        ? "fall"
        : statusKey.includes("fight") || statusKey.includes("aggressive")
          ? "fight"
          : "unknown"
      : "unknown";

  const base: Record<string, unknown> = {
    eventId: `${input.deviceId}:${input.envelopeType}:${trackId}:${input.timestampMs}`,
    timestamp: input.timestampMs,
    camera_id: input.deviceId,
    track_id: trackId,
    status,
    eventType,
    severity: input.envelopeType === "cleaning" ? 2 : severityToLevel(input.severityText),
    confidence,
    zone_id: zoneId,
  };
  if (label) {
    base.label = label;
  }

  if (worldX !== null && worldZ !== null) {
    const mapped = worldToMapNorm(worldX - WORLD_OFFSET_X_M, worldZ - WORLD_OFFSET_Z_M);
    base.x_norm = mapped.x;
    base.y_norm = mapped.y;
    base.world = { x: worldX, z: worldZ };
  } else if (hasBbox && input.frameWidth > 0 && input.frameHeight > 0) {
    base.x_norm = clamp01(((x1 + x2) / 2) / input.frameWidth);
    base.y_norm = clamp01(((y1 + y2) / 2) / input.frameHeight);
  } else {
    return null;
  }

  const vlm = asRecord(input.object.vlm_analysis);
  const summary = parseText(vlm?.summary);
  const cause = parseText(vlm?.cause);
  const action = parseText(vlm?.action);
  const noteParts = [summary, cause ? `cause:${cause}` : null, action ? `action:${action}` : null].filter(
    (item): item is string => Boolean(item)
  );
  if (noteParts.length > 0) base.note = noteParts.join(" | ");

  const normalized = adaptRawEvent(base, {
    fallbackStoreId: input.storeId,
    defaultSource: input.source,
  });
  if (!normalized) return null;

  return {
    ...normalized,
    id: `${input.deviceId}:${input.envelopeType}:${trackId}:${input.timestampMs}`,
    source: input.source,
    object_label: label ?? undefined,
    raw_status: status,
    world_x_m: worldX !== null ? worldX : normalized.world_x_m,
    world_z_m: worldZ !== null ? worldZ : normalized.world_z_m,
  };
}

export function parseSignalPayload(payload: unknown, options: ParseSignalOptions = {}): ParseSignalResult {
  const storeId = options.fallbackStoreId ?? "s001";
  const source = options.defaultSource ?? "api";
  const result: ParseSignalResult = {
    generatedEvents: [],
    patch: {},
    labels: [],
  };

  const applyLabel = (label: string) => {
    if (!result.labels.includes(label)) result.labels.push(label);
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((row) => visit(row));
      return;
    }
    const row = asRecord(value);
    if (!row) return;

    const eventTypeRaw = parseText(row.eventType ?? row.event_type ?? row.type);
    if (!eventTypeRaw) {
      visit(row.event);
      visit(row.alert);
      visit(row.events);
      visit(row.items);
      visit(row.records);
      visit(row.results);
      visit(row.alerts);
      visit(row.data);
      visit(row.payload);
      visit(row.message);
      visit(row.sync);
      return;
    }
    const eventType = eventTypeRaw.toLowerCase();
    if (!["crowd", "safety", "cleaning"].includes(eventType)) return;

    const data = asRecord(row.data) ?? {};
    const timestampMs = parseEpochMs(row.timestamp) ?? Date.now();
    const deviceId = parseText(row.deviceId ?? row.device_id ?? row.camera_id) ?? "camera-edge-01";
    const severityText = parseText(row.severity);
    const zoneId = parseText(data.zone_id ?? row.zone_id) ?? "Store_Main";
    const count = Math.max(0, Math.round(parseNumber(data.count) ?? 0));

    if (eventType === "crowd") {
      const congestionLevel = parseText(data.congestion_level) ?? "Unknown";
      result.patch.crowd = {
        updatedAt: timestampMs,
        deviceId,
        zoneId,
        count,
        tone: congestionToTone(congestionLevel),
        congestionLevel,
      };
      applyLabel("혼잡도");
      return;
    }

    const objects = Array.isArray(data.objects)
      ? data.objects
          .map((item) => asRecord(item))
          .filter((item): item is Record<string, unknown> => item !== null)
      : [];

    const frame = asRecord(data.frame) ?? asRecord(row.frame) ?? {};
    const frameWidth = Math.max(1, parseNumber(frame.width) ?? 1280);
    const frameHeight = Math.max(1, parseNumber(frame.height) ?? 720);

    objects.forEach((object, index) => {
      const built = buildObjectEvent({
        envelopeType: eventType === "safety" ? "safety" : "cleaning",
        deviceId,
        severityText,
        timestampMs,
        defaultZoneId: zoneId,
        storeId,
        source,
        object,
        index,
        frameWidth,
        frameHeight,
      });
      if (built) result.generatedEvents.push(built);
    });

    if (eventType === "safety") {
      const fallCount = objects.filter((object) => (parseText(object.status) ?? "").toLowerCase().includes("fall")).length;
      const firstVlm = asRecord(objects[0]?.vlm_analysis);
      result.patch.safety = {
        updatedAt: timestampMs,
        deviceId,
        zoneId,
        count: count > 0 ? count : objects.length,
        tone: severityToTone(severityText),
        severity: severityText ?? "-",
        fallCount,
        summary: parseText(firstVlm?.summary) ?? "-",
        action: parseText(firstVlm?.action) ?? "-",
      };
      applyLabel("이상행동");
      return;
    }

    const trashCount = objects.filter((object) => {
      const status = (parseText(object.status) ?? "").toLowerCase();
      return status.includes("trash");
    }).length;
    result.patch.trash = {
      updatedAt: timestampMs,
      deviceId,
      zoneId,
      count: count > 0 ? count : objects.length,
      tone: severityToTone(severityText ?? "warning"),
      severity: severityText ?? "Warning",
      trashCount: trashCount > 0 ? trashCount : objects.length,
    };
    applyLabel("쓰레기");
  };

  visit(payload);
  return result;
}
