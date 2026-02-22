"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/site/theme";
import EventDetail from "@/components/EventDetail";
import IncidentTimeline from "@/components/IncidentTimeline";
import MapView from "@/components/MapView";
import SlaAlertPanel, { type ZoneSlaAlert } from "@/components/SlaAlertPanel";
import zoneMap from "@/data/zone_map_s001.json";
import cameraCalibration from "@/data/camera_calibration_s001.json";
import { PHOTO_REFERENCE_POINTS as photoReferencePointsRaw } from "@/data/photo_reference_points.js";
import {
  DEFAULT_LIVE_WINDOW_MS,
  EVENT_TYPES,
  generateDummyEvent,
  generateDummyEvents,
} from "@/lib/dummy";
import { worldToMapNorm } from "@/lib/coordinateTransform";
import { adaptRawEvent, normalizeEventFeed } from "@/lib/eventAdapter";
import { applyHomography, computeHomography } from "@/lib/homography";
import { getEventIdLabel, getEventTypeLabel, getZoneLabel } from "@/lib/labels";
import {
  INITIAL_SIGNAL_CHECKS,
  mergeSignalChecks,
  parseSignalPayload,
  type SignalChecksPatch,
  type SignalChecksState,
  type SignalTone,
} from "@/lib/signalChecks";
import type {
  EventItem,
  EventTypeFilter,
  IncidentAction,
  IncidentStatus,
  IncidentTimelineEntry,
  ZoneMap,
} from "@/lib/types";

import * as signalR from "@microsoft/signalr";
const SIGNALR_NEGOTIATE_FRONT_URL =
  "https://function-node-realjuhyun-beb6b5eughagdjaz.koreacentral-01.azurewebsites.net/api/negotiate_front";

const FRONT_SIGNALR_TARGETS = [
  "crowdEvent",
  "cleaningEvent",
  "safetyEvent",
  "robotCall",
  "trashDeleted",
  "trashActivated",
  "safetyAlert",
  "new_alert",
] as const;

const STORAGE_KEY = "twincity-ops-experience-v3";
const TIMELINE_MAX = 240;
const MAX_VISIBLE = 140;
const OPERATOR_ID = "ops-01";
const EVENT_TYPE_FILTERS = new Set<EventTypeFilter>(["all", ...EVENT_TYPES]);

const zm = zoneMap as ZoneMap;
const WORLD_OFFSET_X_M = Number.isFinite(Number(zm.map.world?.offset_x_m))
  ? Number(zm.map.world?.offset_x_m)
  : 0;
const WORLD_OFFSET_Z_M = Number.isFinite(Number(zm.map.world?.offset_z_m))
  ? Number(zm.map.world?.offset_z_m)
  : 0;

const LIVE_WS_URL = process.env.NEXT_PUBLIC_EVENT_WS_URL?.trim() ?? "";
const LIVE_SSE_URL = process.env.NEXT_PUBLIC_EVENT_STREAM_URL?.trim() ?? "";
const LIVE_API_URL = process.env.NEXT_PUBLIC_EVENT_API_URL?.trim() ?? "";
const LIVE_POLL_MS_RAW = Number(
  process.env.NEXT_PUBLIC_EVENT_POLL_MS ?? "5000",
);
const LIVE_POLL_MS = Number.isFinite(LIVE_POLL_MS_RAW)
  ? Math.max(1200, Math.min(30000, Math.round(LIVE_POLL_MS_RAW)))
  : 5000;
const HAS_LIVE_SOURCE = Boolean(
  SIGNALR_NEGOTIATE_FRONT_URL || LIVE_WS_URL || LIVE_SSE_URL || LIVE_API_URL,
);

const DEFAULT_MAX_EVENTS = 520;
const LOW_SIGNAL_CONFIDENCE_CUTOFF = 0.2;
const TIMELINE_DEDUPE_WINDOW_MS = 30_000;
const ACK_SLA_MS = 2 * 60 * 1000;
const RESOLVE_SLA_MS = 10 * 60 * 1000;
const MANUAL_MAP_EVENT_PREFIX = "manual-map";
const DEFAULT_MANUAL_CAMERA_ID = "camera-edge-01";
const DEFAULT_MANUAL_FRAME_WIDTH = 1280;
const DEFAULT_MANUAL_FRAME_HEIGHT = 720;
const PHOTO_SEED_EVENT_PREFIX = "photo-log";
const PHOTO_SEED_LOG_TRACK_IDS: readonly number[] = [0, 1, 2, 3, 5, 6];
const PHOTO_WORLD_ANCHOR_TRACK_IDS: readonly number[] = [2, 6, 5, 1];
type Fixed3DWorldLog = {
  id: string;
  x: number;
  z: number;
  note: string;
};
const FIXED_3D_WORLD_LOGS: readonly Fixed3DWorldLog[] = [];

type Speed = 1 | 2 | 4;
type FeedMode = "live" | "demo";
type FeedTransport = "ws" | "sse" | "poll" | "signalr" | "demo" | "none";
type FeedConnection = "idle" | "connecting" | "live" | "error";
type ManualCoordinateMode = "world" | "pixel";

type PhotoSeedPoint = {
  trackId: number;
  predX: number;
  predY: number;
  worldX: number;
  worldZ: number;
  status: string;
  note: string;
};

type UserRole = "viewer" | "operator" | "admin";
const ROLE_LABEL: Record<UserRole, string> = {
  viewer: "보기",
  operator: "운영",
  admin: "관리",
};

type PersistedState = {
  events?: unknown;
  timeline?: unknown;
  playing?: boolean;
  speed?: Speed;
  liveWindowMin?: number;
  typeFilter?: EventTypeFilter;
  zoneFilter?: string;
  minSeverity?: 1 | 2 | 3;
  openOnly?: boolean;
  debugOverlay?: boolean;
  showDiagnostics?: boolean;
  maxEvents?: number;
  feedMode?: FeedMode;
  role?: UserRole;
};

function uid() {
  return (
    Math.random().toString(16).slice(2, 10) + "-" + Date.now().toString(16)
  );
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortByDetectedAtDesc(a: EventItem, b: EventItem) {
  return b.detected_at - a.detected_at;
}

function isManualMapEventId(eventId: string | undefined) {
  return (
    typeof eventId === "string" &&
    eventId.startsWith(`${MANUAL_MAP_EVENT_PREFIX}-`)
  );
}

function isPhotoSeedEventId(eventId: string | undefined) {
  return (
    typeof eventId === "string" &&
    eventId.startsWith(`${PHOTO_SEED_EVENT_PREFIX}-`)
  );
}

function parseMaybeJson(payload: unknown) {
  if (typeof payload !== "string") return payload;
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return payload;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  const chunks = path.split(".");
  let cursor: unknown = record;
  for (const chunk of chunks) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[chunk];
  }
  return cursor;
}

function pickValue(record: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(record, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseInputNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPair(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

const PHOTO_SEED_POINTS: readonly PhotoSeedPoint[] = (
  Array.isArray(photoReferencePointsRaw) ? photoReferencePointsRaw : []
)
  .map((row) => {
    const record = asRecord(row);
    if (!record) return null;

    const pred = toPair(record.pred);
    const world = toPair(record.world);
    const trackId = Number(record.trackId);
    if (!pred || !world || !Number.isFinite(trackId)) return null;

    const status =
      typeof record.status === "string" ? record.status : "walking";
    const note =
      typeof record.note === "string" ? record.note : `photo seed ${trackId}`;

    return {
      trackId: Math.trunc(trackId),
      predX: pred[0],
      predY: pred[1],
      worldX: world[0],
      worldZ: world[1],
      status,
      note,
    } satisfies PhotoSeedPoint;
  })
  .filter((row): row is PhotoSeedPoint => row !== null);

type CameraCalibrationRow = {
  camera_id?: string;
  enabled?: boolean;
  image_points?: unknown;
  map_norm_points?: unknown;
};

const CALIBRATION_ROWS = (() => {
  const payload = cameraCalibration as { cameras?: unknown };
  if (!Array.isArray(payload.cameras)) return [] as CameraCalibrationRow[];
  return payload.cameras as CameraCalibrationRow[];
})();

function getCalibrationRow(cameraId: string) {
  const key = cameraId.trim().toLowerCase();
  return (
    CALIBRATION_ROWS.find(
      (row) =>
        row.enabled !== false &&
        typeof row.camera_id === "string" &&
        row.camera_id.trim().toLowerCase() === key,
    ) ??
    CALIBRATION_ROWS.find((row) => row.enabled !== false) ??
    null
  );
}

const PIXEL_TO_NORM_H = (() => {
  const row = getCalibrationRow(DEFAULT_MANUAL_CAMERA_ID);
  if (!row) return null;
  if (!Array.isArray(row.image_points) || !Array.isArray(row.map_norm_points))
    return null;

  const src = row.image_points
    .map((point) => toPair(point))
    .filter((point): point is readonly [number, number] => point !== null);
  const dst = row.map_norm_points
    .map((point) => toPair(point))
    .filter((point): point is readonly [number, number] => point !== null);
  if (src.length < 4 || dst.length < 4) return null;
  return computeHomography(src.slice(0, 4), dst.slice(0, 4));
})();

function mapPredPixelToNorm(predX: number, predY: number) {
  if (!PIXEL_TO_NORM_H) return null;
  const mapped = applyHomography(PIXEL_TO_NORM_H, predX, predY);
  if (!mapped) return null;
  return {
    x: clampRange(mapped.x, 0, 1),
    y: clampRange(mapped.y, 0, 1),
  };
}

const PHOTO_WORLD_TO_NORM_H = (() => {
  if (PHOTO_SEED_POINTS.length < 4) return null;

  const pointByTrackId = new Map(
    PHOTO_SEED_POINTS.map((point) => [point.trackId, point] as const),
  );
  const anchorPoints = PHOTO_WORLD_ANCHOR_TRACK_IDS.map((trackId) =>
    pointByTrackId.get(trackId),
  ).filter((point): point is PhotoSeedPoint => point !== undefined);
  const calibrationPoints =
    anchorPoints.length >= 4 ? anchorPoints : PHOTO_SEED_POINTS;

  const srcWorld: (readonly [number, number])[] = [];
  const dstNorm: (readonly [number, number])[] = [];
  for (const point of calibrationPoints) {
    const mappedNorm = mapPredPixelToNorm(point.predX, point.predY);
    if (!mappedNorm) continue;
    srcWorld.push([point.worldX, point.worldZ]);
    dstNorm.push([mappedNorm.x, mappedNorm.y]);
  }
  if (srcWorld.length < 4 || dstNorm.length < 4) return null;

  return computeHomography(srcWorld.slice(0, 4), dstNorm.slice(0, 4));
})();

function mapPhotoWorldToNorm(worldX: number, worldZ: number) {
  if (!PHOTO_WORLD_TO_NORM_H) return null;
  const mapped = applyHomography(PHOTO_WORLD_TO_NORM_H, worldX, worldZ);
  if (!mapped) return null;
  return {
    x: clampRange(mapped.x, 0, 1),
    y: clampRange(mapped.y, 0, 1),
  };
}

function buildPhotoSeedEvents(now: number) {
  const events: EventItem[] = [];
  const enabledTrackIds = new Set<number>(PHOTO_SEED_LOG_TRACK_IDS);

  PHOTO_SEED_POINTS.forEach((point, idx) => {
    if (!enabledTrackIds.has(point.trackId)) return;
    const norm = worldToMapNorm(
      point.worldX - WORLD_OFFSET_X_M,
      point.worldZ - WORLD_OFFSET_Z_M,
    );
    const record = {
      eventId: `${PHOTO_SEED_EVENT_PREFIX}-${point.trackId}`,
      timestamp: now - idx * 120,
      camera_id: DEFAULT_MANUAL_CAMERA_ID,
      track_id: String(point.trackId),
      label: "person",
      status: "walking",
      eventType: "crowd",
      severity: 2,
      confidence: 0.97,
      x_norm: norm.x,
      y_norm: norm.y,
      world: {
        x: point.worldX,
        z: point.worldZ,
      },
      note: `${point.note} pred(${point.predX},${point.predY}) -> w(${point.worldX.toFixed(2)},${point.worldZ.toFixed(2)})`,
    };

    const normalized = adaptRawEvent(record, {
      fallbackStoreId: "s001",
      defaultSource: "camera",
    });
    if (!normalized) return;

    events.push({
      ...normalized,
      id: `${PHOTO_SEED_EVENT_PREFIX}-${point.trackId}`,
      source: "camera",
      object_label: "photo-ref",
      raw_status: "photo_ref",
      x: norm.x,
      y: norm.y,
      incident_status: "new",
      world_x_m: point.worldX,
      world_z_m: point.worldZ,
      severity: 2,
      note: [
        normalized.note,
        `model-norm(${norm.x.toFixed(3)},${norm.y.toFixed(3)})`,
      ]
        .filter(Boolean)
        .join(" | "),
    });
  });

  FIXED_3D_WORLD_LOGS.forEach((fixed, idx) => {
    const fixed3dNorm = mapPhotoWorldToNorm(fixed.x, fixed.z);
    const fixed3dPayload: Record<string, unknown> = {
      eventId: `${PHOTO_SEED_EVENT_PREFIX}-${fixed.id}`,
      timestamp: now + 300 + idx * 80,
      camera_id: DEFAULT_MANUAL_CAMERA_ID,
      track_id: fixed.id,
      label: "person",
      status: "walking",
      eventType: "crowd",
      severity: 2,
      confidence: 0.97,
      note: `${fixed.note} xz(${fixed.x}, ${fixed.z})`,
    };
    if (fixed3dNorm) {
      fixed3dPayload.x_norm = fixed3dNorm.x;
      fixed3dPayload.y_norm = fixed3dNorm.y;
    } else {
      // Fallback when homography cannot be computed.
      fixed3dPayload.world = {
        x: fixed.x,
        z: fixed.z,
      };
    }

    const fixed3dEvent = adaptRawEvent(fixed3dPayload, {
      fallbackStoreId: "s001",
      defaultSource: "camera",
    });
    if (!fixed3dEvent) return;

    events.push({
      ...fixed3dEvent,
      id: String(fixed3dPayload.eventId),
      source: "camera",
      incident_status: "new",
      severity: 2,
      world_x_m: fixed.x,
      world_z_m: fixed.z,
    });
  });

  return events;
}

function composeVlmNote(record: Record<string, unknown>) {
  const vlm = asRecord(record.vlm_analysis);
  if (!vlm) return undefined;

  const summary = asText(vlm.summary);
  const cause = asText(vlm.cause);
  const action = asText(vlm.action);

  const chunks = [
    summary,
    cause ? `cause:${cause}` : undefined,
    action ? `action:${action}` : undefined,
  ].filter((chunk): chunk is string => Boolean(chunk));

  return chunks.length > 0 ? chunks.join(" | ") : undefined;
}

function normalizeEdgeObjectPayload(
  parent: Record<string, unknown>,
  value: unknown,
) {
  const objectRecord = asRecord(value);
  if (!objectRecord) return null;

  const merged: Record<string, unknown> = {
    ...objectRecord,
    timestamp:
      pickValue(objectRecord, [
        "timestamp",
        "detected_at",
        "detectedAt",
        "ts",
        "time",
      ]) ??
      pickValue(parent, [
        "timestamp",
        "detected_at",
        "detectedAt",
        "ts",
        "time",
      ]),
    deviceId:
      pickValue(objectRecord, [
        "deviceId",
        "device_id",
        "cameraId",
        "camera_id",
        "camera.id",
      ]) ??
      pickValue(parent, [
        "deviceId",
        "device_id",
        "cameraId",
        "camera_id",
        "camera.id",
      ]),
    eventType:
      pickValue(objectRecord, [
        "eventType",
        "event_type",
        "type",
        "category",
        "event_name",
      ]) ??
      pickValue(parent, [
        "eventType",
        "event_type",
        "type",
        "category",
        "event_name",
      ]),
    severity:
      pickValue(objectRecord, [
        "severity",
        "priority",
        "level",
        "risk",
        "risk_level",
      ]) ??
      pickValue(parent, [
        "severity",
        "priority",
        "level",
        "risk",
        "risk_level",
      ]),
    source:
      pickValue(objectRecord, ["source", "provider", "channel", "origin"]) ??
      pickValue(parent, ["source", "provider", "channel", "origin"]),
    frame:
      pickValue(objectRecord, ["frame", "location.frame"]) ??
      pickValue(parent, ["frame", "data.frame", "meta.frame"]),
  };

  const storeId =
    pickValue(objectRecord, [
      "store_id",
      "storeId",
      "store.id",
      "site_id",
      "siteId",
      "shop_id",
      "shopId",
    ]) ??
    pickValue(parent, [
      "store_id",
      "storeId",
      "store.id",
      "site_id",
      "siteId",
      "shop_id",
      "shopId",
    ]);
  if (storeId !== undefined) {
    merged.store_id = storeId;
  }

  const existingNote = asText(
    pickValue(objectRecord, [
      "note",
      "message",
      "description",
      "reason",
      "summary",
    ]),
  );
  const vlmNote = composeVlmNote(objectRecord);
  if (existingNote) {
    merged.note = existingNote;
  } else if (vlmNote) {
    merged.note = vlmNote;
  }

  return merged;
}

function dropLowSignalEvents(events: EventItem[]) {
  return events.filter(
    (event) =>
      !(
        event.type === "unknown" &&
        event.severity === 1 &&
        event.confidence < LOW_SIGNAL_CONFIDENCE_CUTOFF
      ),
  );
}

function parseTimeline(raw: unknown): IncidentTimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  const rows: IncidentTimelineEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const action = row.action;
    if (
      action !== "detected" &&
      action !== "ack" &&
      action !== "dispatch" &&
      action !== "resolved"
    ) {
      continue;
    }

    const id = typeof row.id === "string" ? row.id : null;
    const eventId = typeof row.event_id === "string" ? row.event_id : null;
    const zoneId = typeof row.zone_id === "string" ? row.zone_id : null;
    const actor = typeof row.actor === "string" ? row.actor : null;
    const at =
      typeof row.at === "number" && Number.isFinite(row.at) ? row.at : null;
    if (!id || !eventId || !zoneId || !actor || at === null) continue;

    const fromStatus = row.from_status;
    const toStatus = row.to_status;

    const safeFromStatus =
      fromStatus === "new" || fromStatus === "ack" || fromStatus === "resolved"
        ? fromStatus
        : undefined;
    const safeToStatus =
      toStatus === "new" || toStatus === "ack" || toStatus === "resolved"
        ? toStatus
        : undefined;

    rows.push({
      id,
      event_id: eventId,
      zone_id: zoneId,
      action,
      actor,
      at,
      from_status: safeFromStatus,
      to_status: safeToStatus,
      note: typeof row.note === "string" ? row.note : undefined,
    });
  }

  return rows.sort((a, b) => b.at - a.at).slice(0, TIMELINE_MAX);
}

type IncomingSyncMode = "merge" | "replace";

type IncomingSyncBatch = {
  mode: IncomingSyncMode;
  upsert: EventItem[];
  removeIds: string[];
  signalPatch: SignalChecksPatch;
  signalLabels: string[];
};

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function toIdString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseEventIdFromRecord(record: Record<string, unknown>) {
  return toIdString(
    pickValue(record, [
      "id",
      "event_id",
      "eventId",
      "uuid",
      "alarm_id",
      "alarmId",
      "alert_id",
      "alertId",
      "payload.id",
      "payload.event_id",
      "payload.eventId",
    ]),
  );
}

function parseSyncModeValue(value: unknown): IncomingSyncMode | null {
  if (typeof value === "boolean") {
    return value ? "replace" : "merge";
  }
  const text = asText(value)?.toLowerCase();
  if (!text) return null;
  if (
    text.includes("replace") ||
    text.includes("snapshot") ||
    text.includes("full_sync") ||
    text.includes("full-sync") ||
    text.includes("fullsync") ||
    text.includes("resync")
  ) {
    return "replace";
  }
  if (
    text.includes("merge") ||
    text.includes("upsert") ||
    text.includes("delta") ||
    text.includes("incremental") ||
    text.includes("patch")
  ) {
    return "merge";
  }
  return null;
}

function parseSyncMode(
  record: Record<string, unknown>,
): IncomingSyncMode | null {
  const modeFromField = parseSyncModeValue(
    pickValue(record, [
      "sync_mode",
      "syncMode",
      "sync.mode",
      "sync.strategy",
      "payload.sync_mode",
      "payload.sync.mode",
      "meta.sync_mode",
      "meta.sync.mode",
      "payload.mode",
      "mode",
    ]),
  );
  if (modeFromField) return modeFromField;

  const boolMode = parseSyncModeValue(
    pickValue(record, [
      "snapshot",
      "full_sync",
      "fullSync",
      "sync.snapshot",
      "sync.full_sync",
    ]),
  );
  if (boolMode) return boolMode;

  return parseSyncModeValue(
    pickValue(record, [
      "type",
      "event_type",
      "eventType",
      "kind",
      "topic",
      "message_type",
    ]),
  );
}

function parseRecordOperation(
  record: Record<string, unknown>,
): "upsert" | "remove" | null {
  const op = asText(
    pickValue(record, [
      "op",
      "operation",
      "event_op",
      "event_operation",
      "sync.op",
      "sync.operation",
      "meta.op",
      "meta.operation",
    ]),
  )?.toLowerCase();
  if (!op) return null;
  if (
    op === "delete" ||
    op === "deleted" ||
    op === "remove" ||
    op === "removed" ||
    op === "clear" ||
    op === "cleared" ||
    op === "dismiss" ||
    op === "dismissed"
  ) {
    return "remove";
  }
  if (
    op === "upsert" ||
    op === "create" ||
    op === "created" ||
    op === "insert" ||
    op === "update" ||
    op === "updated" ||
    op === "patch" ||
    op === "add"
  ) {
    return "upsert";
  }
  return null;
}

function parseIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" || typeof item === "number") {
      const id = toIdString(item);
      if (id) ids.push(id);
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    const id = parseEventIdFromRecord(record);
    if (id) ids.push(id);
  }
  return ids;
}

function parseDeleteTypeEventId(record: Record<string, unknown>) {
  const typeText = asText(
    pickValue(record, [
      "type",
      "event_type",
      "eventType",
      "kind",
      "topic",
      "message_type",
    ]),
  )?.toLowerCase();
  if (!typeText) return null;

  const impliesDelete =
    typeText.includes("deleted") ||
    typeText.includes("delete") ||
    typeText.includes("removed") ||
    typeText.includes("remove") ||
    typeText.includes("cleared") ||
    typeText.includes("clear");
  if (!impliesDelete) return null;

  const idDirect = parseEventIdFromRecord(record);
  if (idDirect) return idDirect;

  const nested = asRecord(
    pickValue(record, [
      "event",
      "alert",
      "payload.event",
      "payload.alert",
      "payload.data.event",
      "message.event",
      "message.alert",
    ]),
  );
  if (!nested) return null;
  return parseEventIdFromRecord(nested);
}

function collectRemoveIds(record: Record<string, unknown>) {
  const ids: string[] = [];

  for (const path of [
    "deleted_ids",
    "removed_ids",
    "delete_ids",
    "remove_ids",
    "payload.deleted_ids",
    "payload.removed_ids",
    "payload.delete_ids",
    "payload.remove_ids",
    "sync.deleted_ids",
    "sync.removed_ids",
    "payload.sync.deleted_ids",
    "payload.sync.removed_ids",
  ]) {
    ids.push(...parseIdList(pickValue(record, [path])));
  }

  for (const path of [
    "deleted",
    "removed",
    "payload.deleted",
    "payload.removed",
    "sync.deleted",
    "sync.removed",
    "payload.sync.deleted",
    "payload.sync.removed",
  ]) {
    ids.push(...parseIdList(pickValue(record, [path])));
  }

  if (parseRecordOperation(record) === "remove") {
    const id = parseEventIdFromRecord(record);
    if (id) ids.push(id);
  }

  const typeDeleteId = parseDeleteTypeEventId(record);
  if (typeDeleteId) ids.push(typeDeleteId);

  return dedupeIds(ids);
}

function normalizeRecordsForSync(rows: unknown[], maxEvents: number) {
  const upsertCandidates: unknown[] = [];
  const removeIds: string[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (record && parseRecordOperation(record) === "remove") {
      const removeId = parseEventIdFromRecord(record);
      if (removeId) removeIds.push(removeId);
      continue;
    }
    upsertCandidates.push(row);
  }

  const upsert =
    upsertCandidates.length === 0
      ? ([] as EventItem[])
      : dropLowSignalEvents(
        normalizeEventFeed(upsertCandidates, {
          maxEvents,
          fallbackStoreId: "s001",
          defaultSource: "api",
        }),
      );

  return {
    upsert,
    removeIds: dedupeIds(removeIds),
  };
}

function emptySyncBatch(mode: IncomingSyncMode = "merge"): IncomingSyncBatch {
  return {
    mode,
    upsert: [],
    removeIds: [],
    signalPatch: {},
    signalLabels: [],
  };
}

function normalizeIncomingPayload(
  payload: unknown,
  maxEvents: number,
): IncomingSyncBatch {
  const parsed = parseMaybeJson(payload);
  if (typeof parsed === "string") return emptySyncBatch();
  if (parsed === null || parsed === undefined) return emptySyncBatch();
  const signal = parseSignalPayload(parsed, {
    fallbackStoreId: "s001",
    defaultSource: "api",
  });

  if (Array.isArray(parsed)) {
    const rows = normalizeRecordsForSync(parsed, maxEvents);
    return {
      mode: "merge",
      upsert: rows.upsert,
      removeIds: rows.removeIds,
      signalPatch: signal.patch,
      signalLabels: signal.labels,
    };
  }

  const row = asRecord(parsed);
  if (!row) return emptySyncBatch();
  const mode = parseSyncMode(row) ?? "merge";
  const rootRemoveIds = collectRemoveIds(row);

  if (row.type === "ping" || row.type === "heartbeat") {
    return {
      mode,
      upsert: [],
      removeIds: rootRemoveIds,
      signalPatch: signal.patch,
      signalLabels: signal.labels,
    };
  }

  const objectRows = pickValue(row, [
    "data.objects",
    "payload.data.objects",
    "payload.objects",
    "message.data.objects",
    "message.objects",
  ]);
  if (Array.isArray(objectRows)) {
    const normalizedRows = objectRows
      .map((objectRow) => normalizeEdgeObjectPayload(row, objectRow))
      .filter(
        (objectRow): objectRow is Record<string, unknown> => objectRow !== null,
      );

    const rows = normalizeRecordsForSync(normalizedRows, maxEvents);
    return {
      mode,
      upsert: rows.upsert,
      removeIds: dedupeIds([...rootRemoveIds, ...rows.removeIds]),
      signalPatch: signal.patch,
      signalLabels: signal.labels,
    };
  }

  const arrayCandidate = pickValue(row, [
    "events",
    "data",
    "records",
    "results",
    "items",
    "alerts",
    "payload.events",
    "payload.records",
    "payload.items",
    "payload.alerts",
    "message.events",
    "message.items",
    "stream.events",
    "sync.events",
    "payload.sync.events",
  ]);

  if (Array.isArray(arrayCandidate)) {
    const rows = normalizeRecordsForSync(arrayCandidate, maxEvents);
    return {
      mode,
      upsert: rows.upsert,
      removeIds: dedupeIds([...rootRemoveIds, ...rows.removeIds]),
      signalPatch: signal.patch,
      signalLabels: signal.labels,
    };
  }

  const singleCandidate =
    pickValue(row, [
      "event",
      "alert",
      "payload.event",
      "payload.alert",
      "payload.data",
      "message.event",
      "message.alert",
    ]) ?? row;

  const singleRecord = asRecord(singleCandidate);
  if (singleRecord && parseRecordOperation(singleRecord) === "remove") {
    const removeId = parseEventIdFromRecord(singleRecord);
    return {
      mode,
      upsert: [],
      removeIds: dedupeIds(
        removeId ? [...rootRemoveIds, removeId] : rootRemoveIds,
      ),
      signalPatch: signal.patch,
      signalLabels: signal.labels,
    };
  }

  const single = adaptRawEvent(singleCandidate, {
    fallbackStoreId: "s001",
    defaultSource: "api",
  });

  return {
    mode,
    upsert: single ? dropLowSignalEvents([single]) : [],
    removeIds: rootRemoveIds,
    signalPatch: signal.patch,
    signalLabels: signal.labels,
  };
}

function mergeEvents(
  existing: EventItem[],
  incoming: EventItem[],
  maxEvents?: number,
) {
  const map = new Map<string, EventItem>(
    existing.map((event) => [event.id, event]),
  );
  for (const event of incoming) {
    const prev = map.get(event.id);
    map.set(event.id, prev ? { ...prev, ...event } : event);
  }
  const merged = Array.from(map.values()).sort(sortByDetectedAtDesc);
  if (typeof maxEvents !== "number" || !Number.isFinite(maxEvents)) {
    return merged;
  }
  const safeMaxEvents = Math.max(1, Math.floor(maxEvents));
  return merged.slice(0, safeMaxEvents);
}

function applyIncomingSyncBatch(
  existing: EventItem[],
  incoming: IncomingSyncBatch,
  maxEvents: number,
) {
  const preservedForReplace =
    incoming.mode === "replace"
      ? existing.filter(
        (event) =>
          isManualMapEventId(event.id) || isPhotoSeedEventId(event.id),
      )
      : existing;

  let next = mergeEvents(preservedForReplace, incoming.upsert);

  if (incoming.removeIds.length > 0) {
    const removeSet = new Set(incoming.removeIds);
    next = next.filter((event) => !removeSet.has(event.id));
  }

  return next.sort(sortByDetectedAtDesc).slice(0, maxEvents);
}

function transportLabel(transport: FeedTransport) {
  if (transport === "ws") return "실시간 연결(웹소켓)";
  if (transport === "sse") return "실시간 연결(스트림)";
  if (transport === "poll") return "주기 조회";
  if (transport === "signalr") return "실시간 연결(SignalR)";
  if (transport === "demo") return "연습 데이터";
  return "연결 없음";
}

function formatSignalUpdatedAt(updatedAt: number | null) {
  if (!updatedAt || !Number.isFinite(updatedAt)) return "-";
  return new Date(updatedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getSignalToneDisplay(tone: SignalTone) {
  if (tone === "critical") return { className: "tone-critical", label: "위험" };
  if (tone === "watch") return { className: "tone-watch", label: "주의" };
  if (tone === "ok") return { className: "tone-ok", label: "정상" };
  return { className: "tone-idle", label: "대기" };
}

export default function OpsExperience() {
  const { meta } = useTheme();
  const reconnectAttemptRef = useRef(0);
  const photoSeedAppliedRef = useRef(false);

  const [hydrated, setHydrated] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [signalChecks, setSignalChecks] = useState<SignalChecksState>(
    () => INITIAL_SIGNAL_CHECKS,
  );
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [liveWindowMin, setLiveWindowMin] = useState(60);
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [minSeverity, setMinSeverity] = useState<1 | 2 | 3>(1);
  const [openOnly, setOpenOnly] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [maxEvents, setMaxEvents] = useState(DEFAULT_MAX_EVENTS);
  const [feedMode, setFeedMode] = useState<FeedMode>(
    HAS_LIVE_SOURCE ? "live" : "demo",
  );
  const [role, setRole] = useState<UserRole>("operator");
  const [manualCoordMode, setManualCoordMode] =
    useState<ManualCoordinateMode>("world");
  const [manualCoordX, setManualCoordX] = useState("");
  const [manualCoordY, setManualCoordY] = useState("");
  const [manualCameraId, setManualCameraId] = useState(
    DEFAULT_MANUAL_CAMERA_ID,
  );
  const [manualFrameWidth, setManualFrameWidth] = useState(
    String(DEFAULT_MANUAL_FRAME_WIDTH),
  );
  const [manualFrameHeight, setManualFrameHeight] = useState(
    String(DEFAULT_MANUAL_FRAME_HEIGHT),
  );

  const [connection, setConnection] = useState<FeedConnection>("idle");
  const [transport, setTransport] = useState<FeedTransport>(
    HAS_LIVE_SOURCE ? "none" : "demo",
  );
  const [connectionNote, setConnectionNote] = useState(
    HAS_LIVE_SOURCE
      ? "실시간 소스 연결을 준비 중입니다."
      : "연습 데이터로 화면을 보여주고 있습니다.",
  );
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const liveWindowMs = liveWindowMin * 60 * 1000;
  const canOperate = role !== "viewer";
  const isAdmin = role === "admin";

  useEffect(() => {
    const seededFromPhoto = buildPhotoSeedEvents(Date.now());
    const fallback =
      seededFromPhoto.length > 0
        ? seededFromPhoto
        : generateDummyEvents(72, {
          liveWindowMs: DEFAULT_LIVE_WINDOW_MS,
          historyRatio: 0.32,
        });

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setEvents(fallback);
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.playing === true || parsed.playing === false)
        setPlaying(parsed.playing);
      if (parsed.speed === 1 || parsed.speed === 2 || parsed.speed === 4)
        setSpeed(parsed.speed);

      if (typeof parsed.liveWindowMin === "number") {
        setLiveWindowMin(clampRange(Math.round(parsed.liveWindowMin), 10, 240));
      }
      if (EVENT_TYPE_FILTERS.has(parsed.typeFilter as EventTypeFilter)) {
        setTypeFilter(parsed.typeFilter as EventTypeFilter);
      }
      if (typeof parsed.zoneFilter === "string") {
        const trimmed = parsed.zoneFilter.trim();
        if (trimmed.length > 0) setZoneFilter(trimmed);
      }
      if (
        parsed.minSeverity === 1 ||
        parsed.minSeverity === 2 ||
        parsed.minSeverity === 3
      ) {
        setMinSeverity(parsed.minSeverity);
      }
      if (parsed.openOnly === true || parsed.openOnly === false) {
        setOpenOnly(parsed.openOnly);
      }
      if (parsed.debugOverlay === true || parsed.debugOverlay === false) {
        setDebugOverlay(parsed.debugOverlay);
      }
      if (parsed.showDiagnostics === true || parsed.showDiagnostics === false) {
        setShowDiagnostics(parsed.showDiagnostics);
      }

      const restoredMaxEvents =
        typeof parsed.maxEvents === "number"
          ? clampRange(Math.round(parsed.maxEvents), 120, 800)
          : DEFAULT_MAX_EVENTS;
      setMaxEvents(restoredMaxEvents);

      setFeedMode(HAS_LIVE_SOURCE ? "live" : "demo");
      if (
        parsed.role === "viewer" ||
        parsed.role === "operator" ||
        parsed.role === "admin"
      ) {
        setRole(parsed.role);
      }

      const restoredEvents = normalizeEventFeed(parsed.events, {
        maxEvents: restoredMaxEvents,
        fallbackStoreId: "s001",
        defaultSource: "demo",
      });
      setEvents(restoredEvents.length > 0 ? restoredEvents : fallback);
      setTimeline(parseTimeline(parsed.timeline));
    } catch {
      setEvents(fallback);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!hydrated) return;
    if (photoSeedAppliedRef.current) return;
    photoSeedAppliedRef.current = true;

    const seeded = buildPhotoSeedEvents(Date.now());
    if (seeded.length === 0) return;

    setEvents((prev) => {
      const manualOnly = prev.filter((event) => isManualMapEventId(event.id));
      return mergeEvents(seeded, manualOnly, maxEvents);
    });
    setSelectedId((prev) =>
      prev && isManualMapEventId(prev) ? prev : seeded[0]?.id,
    );
  }, [hydrated, maxEvents]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        events: events.slice(0, maxEvents),
        timeline: timeline.slice(0, TIMELINE_MAX),
        playing,
        speed,
        liveWindowMin,
        typeFilter,
        zoneFilter,
        minSeverity,
        openOnly,
        debugOverlay,
        showDiagnostics,
        maxEvents,
        feedMode,
        role,
      } satisfies PersistedState),
    );
  }, [
    debugOverlay,
    events,
    feedMode,
    hydrated,
    liveWindowMin,
    maxEvents,
    minSeverity,
    openOnly,
    playing,
    role,
    showDiagnostics,
    speed,
    timeline,
    typeFilter,
    zoneFilter,
  ]);

  useEffect(() => {
    setEvents((prev) => prev.slice(0, maxEvents));
  }, [maxEvents]);

  useEffect(() => {
    if (feedMode !== "demo") return;
    if (PHOTO_SEED_POINTS.length > 0) return;
    if (!playing) return;

    const interval = Math.max(220, Math.floor(980 / speed));
    const timer = window.setInterval(() => {
      const burst =
        1 +
        (Math.random() < 0.45 ? 1 : 0) +
        (Math.random() < (speed === 4 ? 0.35 : speed === 2 ? 0.24 : 0.12)
          ? 1
          : 0);
      const incoming = Array.from({ length: burst }, () =>
        generateDummyEvent({ liveWindowMs, historyRatio: 0.08 }),
      );
      setEvents((prev) => mergeEvents(prev, incoming, maxEvents));
    }, interval);

    return () => window.clearInterval(timer);
  }, [feedMode, liveWindowMs, maxEvents, playing, speed]);

  useEffect(() => {
    if (!hydrated) return;

    if (feedMode !== "live") {
      reconnectAttemptRef.current = 0;
      setConnection("idle");
      setTransport("demo");
      setConnectionNote("연습 데이터로 화면을 보여주고 있습니다.");
      return;
    }

    if (!HAS_LIVE_SOURCE) {
      setConnection("error");
      setTransport("none");
      setConnectionNote(
        "실시간 연결 주소가 없어 연습 모드만 사용할 수 있습니다.",
      );
      return;
    }

    if (!playing) {
      setConnection("idle");
      setConnectionNote("실시간 연결을 잠시 멈췄습니다.");
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let pollTimer: number | null = null;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;
    let hub: signalR.HubConnection | null = null;
    let inFlightController: AbortController | null = null;

    const closeAll = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (inFlightController) {
        inFlightController.abort();
        inFlightController = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
      if (es) {
        es.onopen = null;
        es.onerror = null;
        es.onmessage = null;
        es.close();
        es = null;
      }
      if (hub) {
        try {
          void hub.stop();
        } catch { }
        hub = null;
      }
    };

    const pushIncoming = (payload: unknown) => {
      const incoming = normalizeIncomingPayload(payload, maxEvents);
      const hasMutation =
        incoming.mode === "replace" ||
        incoming.upsert.length > 0 ||
        incoming.removeIds.length > 0;
      const hasSignalMutation = Boolean(
        incoming.signalPatch.crowd ||
        incoming.signalPatch.safety ||
        incoming.signalPatch.trash,
      );
      if (!hasMutation && !hasSignalMutation) return;
      if (hasMutation) {
        setEvents((prev) => applyIncomingSyncBatch(prev, incoming, maxEvents));
      }
      if (hasSignalMutation) {
        setSignalChecks((prev) =>
          mergeSignalChecks(prev, incoming.signalPatch),
        );
      }
      setLastSyncAt(Date.now());
    };

    const markLive = (via: FeedTransport, note: string) => {
      reconnectAttemptRef.current = 0;
      setTransport(via);
      setConnection("live");
      setConnectionNote(note);
    };

    const scheduleReconnect = (via: FeedTransport, reason: string) => {
      if (cancelled) return;
      reconnectAttemptRef.current += 1;
      const delay = Math.min(
        12000,
        800 * 2 ** Math.min(reconnectAttemptRef.current, 4),
      );
      setTransport(via);
      setConnection("connecting");
      setConnectionNote(`${reason} · ${Math.round(delay / 1000)}초 후 재시도`);

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        start();
      }, delay);
    };

    const connectWebSocket = () => {
      setTransport("ws");
      setConnection("connecting");
      setConnectionNote("웹소켓 연결을 시도하고 있습니다...");

      try {
        ws = new WebSocket(LIVE_WS_URL);
      } catch {
        scheduleReconnect("ws", "실시간 연결 시작 실패");
        return;
      }

      ws.onopen = () => {
        if (cancelled) return;
        markLive("ws", "웹소켓 실시간 연결됨");
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        pushIncoming(event.data);
      };

      ws.onerror = () => {
        if (cancelled) return;
        setConnection("error");
        setConnectionNote("웹소켓 연결 오류가 발생했습니다.");
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        scheduleReconnect("ws", `웹소켓 연결 종료 (${event.code})`);
      };
    };

    const connectSse = () => {
      setTransport("sse");
      setConnection("connecting");
      setConnectionNote("스트림 연결을 시도하고 있습니다...");

      es = new EventSource(LIVE_SSE_URL);

      es.onopen = () => {
        if (cancelled) return;
        markLive("sse", "스트림 연결됨");
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        pushIncoming(event.data);
      };

      es.onerror = () => {
        if (cancelled) return;
        if (es) {
          es.close();
          es = null;
        }
        scheduleReconnect("sse", "스트림 연결 오류");
      };
    };

    const connectSignalRFront = async () => {
      setTransport("signalr");
      setConnection("connecting");
      setConnectionNote("SignalR(negotiate_front) 연결을 시도하고 있습니다...");

      try {
        const res = await fetch(SIGNALR_NEGOTIATE_FRONT_URL, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`negotiate_front HTTP ${res.status}`);

        const info = (await res.json()) as {
          url?: string;
          accessToken?: string;
        };
        if (!info.url || !info.accessToken)
          throw new Error("negotiate 응답에 url/accessToken 없음");

        hub = new signalR.HubConnectionBuilder()
          .withUrl(info.url, { accessTokenFactory: () => info.accessToken! })
          .withAutomaticReconnect()
          .build();

        const safePreview = (x: unknown) => {
          try {
            if (typeof x === "string") return x.slice(0, 500);
            return JSON.parse(JSON.stringify(x)); // circular이면 catch로 빠짐
          } catch {
            return x;
          }
        };

        FRONT_SIGNALR_TARGETS.forEach((target) => {
          hub!.on(target, (...args: unknown[]) => {
            if (cancelled) return;

            console.groupCollapsed(
              `[SignalR] recv: ${target} (${new Date().toLocaleTimeString()})`,
            );
            console.log("args:", args.map(safePreview));
            console.groupEnd();

            // 기존 로직 유지 (args[0]이 실제 payload인 경우가 많음)
            pushIncoming(args.length === 1 ? args[0] : args);
          });
        });

        hub.onreconnecting(() => {
          if (cancelled) return;
          setTransport("signalr");
          setConnection("connecting");
          setConnectionNote("SignalR 재연결 중...");
        });

        hub.onreconnected(() => {
          if (cancelled) return;
          markLive("signalr", "SignalR 재연결됨");
        });

        hub.onclose((err) => {
          if (cancelled) return;
          scheduleReconnect(
            "signalr",
            `SignalR 연결 종료${err?.message ? `: ${err.message}` : ""}`,
          );
        });

        await hub.start();
        console.log("[SignalR] started ✅", hub.state);
        if (cancelled) return;
        markLive("signalr", "SignalR 실시간 연결됨");
      } catch (e) {
        console.log("[SignalR] start failed ❌", e);
        const note = e instanceof Error ? e.message : String(e);
        scheduleReconnect("signalr", `SignalR 연결 실패: ${note}`);
      }
    };

    const connectPolling = () => {
      setTransport("poll");
      setConnection("connecting");
      setConnectionNote(`주기 조회 중 (${LIVE_POLL_MS}ms)`);

      const poll = async () => {
        if (cancelled) return;
        try {
          inFlightController = new AbortController();
          const res = await fetch(LIVE_API_URL, {
            method: "GET",
            cache: "no-store",
            signal: inFlightController.signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const payload = (await res.json()) as unknown;
          pushIncoming(payload);
          if (!cancelled) {
            markLive("poll", `주기 조회 중 (${LIVE_POLL_MS}ms)`);
          }
        } catch (error) {
          if (cancelled) return;
          const note =
            error instanceof Error ? error.message : "알 수 없는 오류";
          setConnection("error");
          setConnectionNote(`주기 조회 오류: ${note}`);
        }
      };

      void poll();
      pollTimer = window.setInterval(() => {
        void poll();
      }, LIVE_POLL_MS);
    };

    const start = () => {
      if (cancelled) return;
      closeAll();

      if (SIGNALR_NEGOTIATE_FRONT_URL) {
        void connectSignalRFront();
        return;
      }

      if (LIVE_WS_URL) {
        connectWebSocket();
        return;
      }
      if (LIVE_SSE_URL) {
        connectSse();
        return;
      }
      connectPolling();
    };

    start();

    return () => {
      cancelled = true;
      closeAll();
    };
  }, [feedMode, hydrated, maxEvents, playing]);

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          (typeFilter === "all" || event.type === typeFilter) &&
          (zoneFilter === "all" || event.zone_id === zoneFilter) &&
          event.severity >= minSeverity &&
          (!openOnly || event.incident_status !== "resolved"),
      ),
    [events, minSeverity, openOnly, typeFilter, zoneFilter],
  );

  const liveEvents = useMemo(
    () =>
      filteredEvents.filter((event) => now - event.detected_at <= liveWindowMs),
    [filteredEvents, liveWindowMs, now],
  );

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    zm.zones.forEach((zone) => zones.add(zone.zone_id));
    events.forEach((event) => zones.add(event.zone_id));
    return Array.from(zones).sort((a, b) =>
      getZoneLabel(a).localeCompare(getZoneLabel(b), "ko"),
    );
  }, [events]);

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, MAX_VISIBLE),
    [filteredEvents],
  );

  useEffect(() => {
    if (visibleEvents.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (selectedId && !visibleEvents.some((event) => event.id === selectedId)) {
      setSelectedId(visibleEvents[0].id);
    }
  }, [selectedId, visibleEvents]);

  const selectedEvent = useMemo(
    () => visibleEvents.find((event) => event.id === selectedId),
    [selectedId, visibleEvents],
  );

  const selectedTimeline = useMemo(
    () =>
      selectedEvent
        ? timeline
          .filter((entry) => entry.event_id === selectedEvent.id)
          .sort((a, b) => b.at - a.at)
          .slice(0, 12)
        : [],
    [selectedEvent, timeline],
  );

  const moveSelection = useCallback(
    (step: -1 | 1) => {
      if (visibleEvents.length === 0) {
        setSelectedId(undefined);
        return;
      }
      if (!selectedId) {
        setSelectedId(
          step > 0
            ? visibleEvents[0].id
            : visibleEvents[visibleEvents.length - 1].id,
        );
        return;
      }
      const currentIndex = visibleEvents.findIndex(
        (event) => event.id === selectedId,
      );
      if (currentIndex < 0) {
        setSelectedId(
          step > 0
            ? visibleEvents[0].id
            : visibleEvents[visibleEvents.length - 1].id,
        );
        return;
      }
      const nextIndex =
        (currentIndex + step + visibleEvents.length) % visibleEvents.length;
      setSelectedId(visibleEvents[nextIndex].id);
    },
    [selectedId, visibleEvents],
  );

  const clearSelection = useCallback(() => {
    setSelectedId(undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        target &&
        (target.isContentEditable ||
          tag === "input" ||
          tag === "textarea" ||
          tag === "select")
      ) {
        return;
      }
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (event.key === "[" || event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }
      if (event.key === "]" || event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, moveSelection]);

  const appendTimelineEntry = (
    item: Omit<IncidentTimelineEntry, "id" | "at"> & { at?: number },
  ) => {
    setTimeline((prev) => {
      const at = item.at ?? Date.now();
      const duplicate = prev.find(
        (entry) =>
          entry.event_id === item.event_id &&
          entry.action === item.action &&
          entry.actor === item.actor &&
          entry.from_status === item.from_status &&
          entry.to_status === item.to_status &&
          entry.note === item.note,
      );
      if (
        duplicate &&
        Math.abs(at - duplicate.at) <= TIMELINE_DEDUPE_WINDOW_MS
      ) {
        return prev;
      }

      return [
        {
          id: uid(),
          at,
          event_id: item.event_id,
          zone_id: item.zone_id,
          action: item.action,
          actor: item.actor,
          from_status: item.from_status,
          to_status: item.to_status,
          note: item.note,
        },
        ...prev,
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, TIMELINE_MAX);
    });
  };

  const applyStatusChange = (
    targetEvent: EventItem,
    toStatus: IncidentStatus,
    action: IncidentAction,
    note: string,
  ) => {
    if (!canOperate) {
      setToast("보기 권한에서는 상태를 변경할 수 없어요.");
      return;
    }
    if (targetEvent.incident_status === toStatus) return;

    setEvents((prev) =>
      prev.map((event) => {
        if (event.id !== targetEvent.id) return event;
        return { ...event, incident_status: toStatus };
      }),
    );

    appendTimelineEntry({
      event_id: targetEvent.id,
      zone_id: targetEvent.zone_id,
      action,
      actor: OPERATOR_ID,
      from_status: targetEvent.incident_status,
      to_status: toStatus,
      note,
    });
  };

  const markAcknowledged = (event: EventItem) => {
    applyStatusChange(event, "ack", "ack", "담당자가 현장 확인을 시작했어요.");
    if (canOperate) setToast("확인 처리했습니다.");
  };

  const markResolved = (event: EventItem) => {
    applyStatusChange(
      event,
      "resolved",
      "resolved",
      "처리를 마치고 기록을 닫았습니다.",
    );
    if (canOperate) setToast("처리 완료로 기록했습니다.");
  };

  const dispatchOperator = (event: EventItem) => {
    if (!canOperate) {
      setToast("보기 권한에서는 직원 호출을 할 수 없어요.");
      return;
    }
    if (event.incident_status === "resolved") return;
    const toStatus =
      event.incident_status === "new" ? "ack" : event.incident_status;

    appendTimelineEntry({
      event_id: event.id,
      zone_id: event.zone_id,
      action: "dispatch",
      actor: OPERATOR_ID,
      from_status: event.incident_status,
      to_status: toStatus,
      note: "현장 인력을 호출했습니다.",
    });
    setToast("직원 호출을 기록했습니다.");

    if (toStatus === "ack") {
      setEvents((prev) =>
        prev.map((entry) =>
          entry.id === event.id ? { ...entry, incident_status: "ack" } : entry,
        ),
      );
    }
  };

  const injectOne = () => {
    if (!isAdmin) {
      setToast("관리 권한에서만 샘플을 주입할 수 있어요.");
      return;
    }
    const incoming = generateDummyEvent({ liveWindowMs, historyRatio: 0.15 });
    setEvents((prev) => mergeEvents(prev, [incoming], maxEvents));
    setToast("샘플 알림을 1건 추가했습니다.");
  };

  const injectWorldSample = () => {
    if (!isAdmin) {
      setToast("관리 권한에서만 샘플을 주입할 수 있어요.");
      return;
    }
    const nowSec = Date.now() / 1000;
    const samplePayload = {
      camera_id: "cam01",
      ts: nowSec,
      track_id: 1,
      label: "person",
      status: Math.random() < 0.28 ? "fall_down" : "walking",
      confidence: 0.85,
      world: {
        x: Number((2.1 + Math.random() * 4.8).toFixed(2)),
        z: Number((0.6 + Math.random() * 3.4).toFixed(2)),
      },
    };

    const normalized = adaptRawEvent(samplePayload, {
      fallbackStoreId: "s001",
      defaultSource: "camera",
    });
    if (!normalized) return;
    setEvents((prev) => mergeEvents(prev, [normalized], maxEvents));
    setToast("위치 샘플을 1건 추가했습니다.");
  };

  const injectPhotoBasedLogs = () => {
    if (!isAdmin) {
      setToast("관리 권한에서만 이미지 기준 로그를 주입할 수 있어요.");
      return;
    }
    const seeded = buildPhotoSeedEvents(Date.now());
    if (seeded.length === 0) {
      setToast("이미지 기준 로그를 만들지 못했습니다.");
      return;
    }
    setEvents((prev) => mergeEvents(prev, seeded, maxEvents));
    setSelectedId(seeded[0]?.id);
    setTypeFilter("all");
    setZoneFilter("all");
    setOpenOnly(false);
    setToast(`이미지 기준 로그 ${seeded.length}건을 반영했습니다.`);
  };

  const applyManualCoordinateTarget = () => {
    if (!canOperate) {
      setToast("보기 권한에서는 좌표 이동을 실행할 수 없어요.");
      return;
    }

    const x = parseInputNumber(manualCoordX);
    const y = parseInputNumber(manualCoordY);
    if (x === null || y === null) {
      setToast("좌표 X/Y를 숫자로 입력해 주세요.");
      return;
    }

    const manualEventId = `${MANUAL_MAP_EVENT_PREFIX}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const manualTrackId = `manual-${manualEventId.slice(-6)}`;

    const basePayload: Record<string, unknown> = {
      eventId: manualEventId,
      timestamp: Date.now(),
      eventType: "unknown",
      severity: 2,
      confidence: 0.99,
      track_id: manualTrackId,
      label: "manual-target",
      status: "manual_target",
    };

    let payload: Record<string, unknown>;
    let defaultSource: "api" | "camera" = "camera";
    if (manualCoordMode === "world") {
      const mappedNorm = mapPhotoWorldToNorm(x, y);
      if (!mappedNorm) {
        setToast("이미지 기준 world(x,z)를 평면 좌표로 변환하지 못했습니다.");
        return;
      }
      payload = {
        ...basePayload,
        source: "camera",
        camera_id: manualCameraId.trim() || DEFAULT_MANUAL_CAMERA_ID,
        x_norm: mappedNorm.x,
        y_norm: mappedNorm.y,
      };
    } else {
      const cameraId = manualCameraId.trim() || DEFAULT_MANUAL_CAMERA_ID;
      const frameWidth = parseInputNumber(manualFrameWidth);
      const frameHeight = parseInputNumber(manualFrameHeight);
      if (
        frameWidth === null ||
        frameHeight === null ||
        frameWidth <= 0 ||
        frameHeight <= 0
      ) {
        setToast("픽셀 입력에서는 프레임 크기를 양수로 입력해 주세요.");
        return;
      }

      payload = {
        ...basePayload,
        source: "camera",
        camera_id: cameraId,
        frame: { width: frameWidth, height: frameHeight },
        location: {
          bbox: [x, y, x, y],
          frame: { width: frameWidth, height: frameHeight },
        },
      };
      defaultSource = "camera";
    }

    const normalized = adaptRawEvent(payload, {
      fallbackStoreId: "s001",
      defaultSource,
    });
    if (!normalized) {
      setToast(
        manualCoordMode === "world"
          ? "월드 좌표를 해석하지 못했습니다."
          : "픽셀 좌표를 맵 좌표로 변환하지 못했습니다.",
      );
      return;
    }

    const manualEvent: EventItem = {
      ...normalized,
      id: manualEventId,
      severity: 2,
      confidence: Math.max(0.95, normalized.confidence),
      raw_status: "manual_target",
      world_x_m: manualCoordMode === "world" ? x : normalized.world_x_m,
      world_z_m: manualCoordMode === "world" ? y : normalized.world_z_m,
      note:
        manualCoordMode === "world"
          ? `manual photo world (${x.toFixed(2)}, ${y.toFixed(2)})`
          : `manual pixel (${x.toFixed(1)}, ${y.toFixed(1)})`,
    };

    setEvents((prev) => mergeEvents(prev, [manualEvent], maxEvents));
    setSelectedId(manualEventId);
    if (typeFilter !== "all") setTypeFilter("all");
    if (zoneFilter !== "all") setZoneFilter("all");
    if (openOnly) setOpenOnly(false);

    const worldXLabel = Number.isFinite(manualEvent.world_x_m)
      ? manualEvent.world_x_m!.toFixed(2)
      : "-";
    const worldZLabel = Number.isFinite(manualEvent.world_z_m)
      ? manualEvent.world_z_m!.toFixed(2)
      : "-";
    setToast(
      `좌표 이동 완료 · norm(${manualEvent.x.toFixed(3)}, ${manualEvent.y.toFixed(3)}) · world(${worldXLabel}, ${worldZLabel})m`,
    );
  };

  const clearManualCoordinateTarget = () => {
    const remaining = events.filter((event) => !isManualMapEventId(event.id));
    const removedCount = events.length - remaining.length;
    if (removedCount <= 0) {
      setToast("삭제할 수동 매핑 좌표가 없습니다.");
      return;
    }
    setEvents(remaining);
    setSelectedId((prev) => (isManualMapEventId(prev) ? undefined : prev));
    setToast(`수동 매핑 좌표 ${removedCount}건을 삭제했습니다.`);
  };

  const seedHistory = () => {
    if (!isAdmin) {
      setToast("관리 권한에서만 히스토리 시드를 만들 수 있어요.");
      return;
    }
    const incoming = generateDummyEvents(40, {
      liveWindowMs,
      historyRatio: 1,
      forceHistory: true,
    });
    setEvents((prev) => mergeEvents(prev, incoming, maxEvents));
    setToast("지난 알림을 채웠습니다.");
  };

  const clearAll = () => {
    if (!isAdmin) {
      setToast("관리 권한에서만 전체 초기화가 가능해요.");
      return;
    }
    setEvents([]);
    setTimeline([]);
    setSelectedId(undefined);
    setToast("화면 데이터를 초기화했습니다.");
  };

  const ackAtByEvent = useMemo(() => {
    const index = new Map<string, number>();
    timeline.forEach((entry) => {
      if (entry.to_status !== "ack") return;
      const prev = index.get(entry.event_id) ?? 0;
      if (entry.at > prev) index.set(entry.event_id, entry.at);
    });
    return index;
  }, [timeline]);

  const openEvents = useMemo(
    () =>
      filteredEvents.filter((event) => event.incident_status !== "resolved"),
    [filteredEvents],
  );
  const hasManualMappings = useMemo(
    () => events.some((event) => isManualMapEventId(event.id)),
    [events],
  );

  const criticalCount = liveEvents.filter(
    (event) => event.severity === 3,
  ).length;
  const openCount = openEvents.length;
  const overdueAckCount = openEvents.filter(
    (event) =>
      event.incident_status === "new" && now - event.detected_at > ACK_SLA_MS,
  ).length;
  const overdueResolveCount = openEvents.filter((event) => {
    if (event.incident_status !== "ack") return false;
    const ackAt = ackAtByEvent.get(event.id) ?? event.detected_at;
    return now - ackAt > RESOLVE_SLA_MS;
  }).length;
  const slaAlerts = useMemo<ZoneSlaAlert[]>(() => {
    const ackThresholdSec = Math.round(ACK_SLA_MS / 1000);
    const resolveThresholdSec = Math.round(RESOLVE_SLA_MS / 1000);
    const byZone = new Map<string, Omit<ZoneSlaAlert, "breachCount">>();

    openEvents.forEach((event) => {
      const zoneId = event.zone_id;
      const prev = byZone.get(zoneId);
      const next: Omit<ZoneSlaAlert, "breachCount"> = prev ?? {
        zoneId,
        openCount: 0,
        worstAgeSec: 0,
        overdueAckCount: 0,
        overdueResolveCount: 0,
        ackThresholdSec,
        resolveThresholdSec,
        topSeverity: 1,
      };

      next.openCount += 1;
      next.topSeverity = Math.max(next.topSeverity, event.severity) as
        | 1
        | 2
        | 3;
      next.worstAgeSec = Math.max(
        next.worstAgeSec,
        Math.max(0, Math.round((now - event.detected_at) / 1000)),
      );

      if (event.incident_status === "new") {
        if (now - event.detected_at > ACK_SLA_MS) next.overdueAckCount += 1;
      } else if (event.incident_status === "ack") {
        const ackAt = ackAtByEvent.get(event.id) ?? event.detected_at;
        if (now - ackAt > RESOLVE_SLA_MS) next.overdueResolveCount += 1;
      }

      byZone.set(zoneId, next);
    });

    return Array.from(byZone.values())
      .map((row) => ({
        ...row,
        breachCount: row.overdueAckCount + row.overdueResolveCount,
      }))
      .filter((row) => row.breachCount > 0)
      .sort(
        (a, b) =>
          b.breachCount - a.breachCount ||
          b.topSeverity - a.topSeverity ||
          b.worstAgeSec - a.worstAgeSec,
      )
      .slice(0, 8);
  }, [ackAtByEvent, now, openEvents]);

  const recentActions = useMemo(() => timeline.slice(0, 8), [timeline]);
  const avgLatency =
    liveEvents.length > 0
      ? Math.round(
        liveEvents.reduce((sum, event) => sum + event.latency_ms, 0) /
        liveEvents.length,
      )
      : 0;
  const selectedSummary = selectedEvent
    ? `${getEventTypeLabel(selectedEvent.type)} · ${selectedEvent.id.slice(-8)}`
    : "없음";
  const liveRatio =
    visibleEvents.length > 0
      ? `${Math.round((liveEvents.length / visibleEvents.length) * 100)}%`
      : "0%";

  const playLabel =
    feedMode === "live"
      ? playing
        ? "실시간 잠시 멈춤"
        : "실시간 다시 시작"
      : playing
        ? "자동 생성 멈춤"
        : "자동 생성 시작";

  const lastSyncLabel =
    lastSyncAt !== undefined
      ? new Date(lastSyncAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      : "-";
  const hasOpsKicker = meta.opsKicker.trim().length > 0;
  const hasOpsTitle = meta.opsTitle.trim().length > 0;
  const crowdTone = getSignalToneDisplay(signalChecks.crowd.tone);
  const safetyTone = getSignalToneDisplay(signalChecks.safety.tone);
  const trashTone = getSignalToneDisplay(signalChecks.trash.tone);

  return (
    <section className="opsShell reveal delay-1">
      {/* <div className="opsTop"> */}
      <div className="opsHeading">
        {hasOpsKicker ? (
          <p className="kicker">
            {meta.icon} {meta.opsKicker}
          </p>
        ) : null}
        {hasOpsTitle ? <h2>{meta.opsTitle}</h2> : null}
        <p>{meta.opsLead}</p>
      </div>

      {/* <div className="opsMetricRow"> */}
      {/* <article className="opsMetricCard"> */}
      {/* <span>현재 알림</span> */}
      {/* <strong>{liveEvents.length}</strong> */}
      {/* <small>최근 {liveWindowMin}분 기준</small> */}
      {/* </article>
          <article className="opsMetricCard">
            <span>긴급 알림</span>
            <strong>{criticalCount}</strong>
            <small>중요도 3 기준</small>
          </article>
          <article className="opsMetricCard">
            <span>미해결 알림</span>
            <strong>{openCount}</strong>
            <small>미해결 사건</small>
          </article>
          <article className="opsMetricCard">
            <span>확인 지연</span> */}
      {/* <strong>{overdueAckCount}</strong>
            <small>{Math.round(ACK_SLA_MS / 60_000)}분 이상 미확인</small>
          </article>
          <article className="opsMetricCard">
            <span>처리 지연</span>
            <strong>{overdueResolveCount}</strong>
            <small>{Math.round(RESOLVE_SLA_MS / 60_000)}분 이상 미해결</small>
          </article>
          <article className="opsMetricCard">
            <span>평균 반영 시간</span>
            <strong>{avgLatency}ms</strong>
            <small>실시간 평균 수신 지연</small>
          </article>
        </div>
      </div> */}

      {/* <div className="opsControls">
        <button
          type="button"
          className={"opsToggle" + (playing ? " active" : "")}
          onClick={() => setPlaying((value) => !value)}
        >
          {playLabel}
        </button>

        <div className="opsControlGroup">
          <span>데이터</span>
          <button
            type="button"
            className={"opsPill" + (feedMode === "live" ? " active" : "")}
            onClick={() => setFeedMode("live")}
            disabled={!HAS_LIVE_SOURCE || !canOperate}
          >
            {meta.modeLiveLabel}
          </button>
          <button
            type="button"
            className={"opsPill" + (feedMode === "demo" ? " active" : "")}
            onClick={() => setFeedMode("demo")}
            disabled={!canOperate}
          >
            {meta.modeDemoLabel}
          </button>
        </div>

        <div className="opsControlGroup">
          <span>속도</span>
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              type="button"
              className={"opsPill" + (speed === value ? " active" : "")}
              onClick={() => setSpeed(value as Speed)}
              disabled={!canOperate}
            >
              {value}배속
            </button>
          ))}
        </div>

        <div className="opsControlGroup">
          <span>최근 시간</span>
          {[30, 60, 120].map((value) => (
            <button
              key={value}
              type="button"
              className={"opsPill" + (liveWindowMin === value ? " active" : "")}
              onClick={() => setLiveWindowMin(value)}
            >
              {value}분
            </button>
          ))}
        </div>

        <div className="opsControlGroup">
          <span>중요도</span>
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              className={"opsPill" + (minSeverity === value ? " active" : "")}
              onClick={() => setMinSeverity(value as 1 | 2 | 3)}
            >
              {value} 이상
            </button>
          ))}
        </div>

        <div className="opsControlGroup">
          <span>유형</span>
          <button
            type="button"
            className={"opsPill" + (typeFilter === "all" ? " active" : "")}
            onClick={() => setTypeFilter("all")}
          >
            전체
          </button>
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={"opsPill" + (typeFilter === type ? " active" : "")}
              onClick={() => setTypeFilter(type)}
            >
              {getEventTypeLabel(type)}
            </button>
          ))}
        </div>

        <div className="opsControlGroup">
          <span>구역</span>
          <select
            className="opsSelect"
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
          >
            <option value="all">전체</option>
            {zoneOptions.map((zoneId) => (
              <option key={zoneId} value={zoneId}>
                {getZoneLabel(zoneId)}
              </option>
            ))}
          </select>
        </div> */}

      {/* <div className="opsControlGroup">
          <span>표시</span>
          <button
            type="button"
            className={"opsPill" + (openOnly ? " active" : "")}
            onClick={() => setOpenOnly((value) => !value)}
          >
            {openOnly ? "미해결만" : "전체"}
          </button>
          <button
            type="button"
            className={"opsPill" + (debugOverlay ? " active" : "")}
            onClick={() => setDebugOverlay((value) => !value)}
            disabled={!isAdmin && !debugOverlay}
          >
            {debugOverlay ? "구역 경계 표시 중" : "구역 경계 숨김"}
          </button>
          <button
            type="button"
            className={"opsPill" + (showDiagnostics ? " active" : "")}
            onClick={() => setShowDiagnostics((value) => !value)}
          >
            {showDiagnostics ? "진단 패널 표시 중" : "진단 패널 숨김"}
          </button>
        </div>

        <div className="opsControlGroup">
          <span>보관 개수</span>
          {[220, 360, 520, 720].map((value) => (
            <button
              key={value}
              type="button"
              className={"opsPill" + (maxEvents === value ? " active" : "")}
              onClick={() => setMaxEvents(value)}
              disabled={!isAdmin}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="opsControlGroup">
          <span>권한</span>
          {(["viewer", "operator", "admin"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={"opsPill" + (role === value ? " active" : "")}
              onClick={() => setRole(value)}
            >
              {ROLE_LABEL[value]}
            </button>
          ))}
        </div> */}

      {feedMode === "demo" && isAdmin && (
        <div className="opsControlGroup">
          <span>샘플</span>
          <button type="button" className="opsPill" onClick={injectOne}>
            알림 1개 추가
          </button>
          <button
            type="button"
            className="opsPill"
            onClick={injectWorldSample}
          >
            위치 데이터 1개 추가
          </button>
          <button
            type="button"
            className="opsPill"
            onClick={injectPhotoBasedLogs}
          >
            사진 기준 로그 반영
          </button>
          <button type="button" className="opsPill" onClick={seedHistory}>
            지난 알림 채우기
          </button>
          <button type="button" className="opsPill" onClick={clearAll}>
            전체 지우기
          </button>
        </div>
      )}

      {/* 좌표 추가 부분 주석 처리 */}
      {/* <form
          className="opsControlGroup opsCoordGroup"
          onSubmit={(event) => {
            event.preventDefault();
            applyManualCoordinateTarget();
          }}
        >
          <span>좌표 이동</span>
          <select
            className="opsSelect"
            value={manualCoordMode}
            onChange={(event) =>
              setManualCoordMode(event.target.value as ManualCoordinateMode)
            }
            aria-label="좌표 입력 모드"
          >
            <option value="world">photo world (x,z)</option>
            <option value="pixel">pred px (x,y)</option>
          </select>
          <input
            className="opsCoordInput"
            value={manualCoordX}
            onChange={(event) => setManualCoordX(event.target.value)}
            placeholder={manualCoordMode === "world" ? "x (m)" : "x (px)"}
            inputMode="decimal"
            aria-label={
              manualCoordMode === "world" ? "월드 X 좌표" : "픽셀 X 좌표"
            }
          />
          <input
            className="opsCoordInput"
            value={manualCoordY}
            onChange={(event) => setManualCoordY(event.target.value)}
            placeholder={manualCoordMode === "world" ? "z (m)" : "y (px)"}
            inputMode="decimal"
            aria-label={
              manualCoordMode === "world" ? "월드 Z 좌표" : "픽셀 Y 좌표"
            }
          />
          {manualCoordMode === "pixel" ? (
            <>
              <input
                className="opsCoordInput opsCoordInputWide"
                value={manualCameraId}
                onChange={(event) => setManualCameraId(event.target.value)}
                placeholder="camera id"
                aria-label="카메라 아이디"
              />
              <input
                className="opsCoordInput opsCoordInputTiny"
                value={manualFrameWidth}
                onChange={(event) => setManualFrameWidth(event.target.value)}
                placeholder="W"
                inputMode="numeric"
                aria-label="프레임 너비"
              />
              <input
                className="opsCoordInput opsCoordInputTiny"
                value={manualFrameHeight}
                onChange={(event) => setManualFrameHeight(event.target.value)}
                placeholder="H"
                inputMode="numeric"
                aria-label="프레임 높이"
              />
            </>
          ) : null}
          <button type="submit" className="opsPill" disabled={!canOperate}>
            좌표 추가
          </button>
          <button
            type="button"
            className="opsPill"
            onClick={clearManualCoordinateTarget}
            disabled={!hasManualMappings}
          >
            매핑 삭제
          </button>
        </form>
      </div> */}

      <div className="opsFeedStatus" role="status" aria-live="polite">
        <span className={`feedDot ${connection}`} aria-hidden />
        <strong>{transportLabel(transport)}</strong>
        <span>{connectionNote}</span>
        <span className="mono">마지막 갱신 {lastSyncLabel}</span>
        <span className="opsFeedHint mono">단축키 [ / ] 이동 · Esc 해제</span>
      </div>

      <section className="opsSignalGrid" aria-label="실시간 3대 상황">
        <article className="opsSignalCard">
          <div className="opsSignalHead">
            <strong>혼잡도</strong>
            <span className={`opsSignalTone ${crowdTone.className}`}>
              {crowdTone.label}
            </span>
          </div>
          <div className="opsSignalBody">
            <p>
              인원 <strong>{signalChecks.crowd.count}</strong>명 · 혼잡도{" "}
              <strong>{signalChecks.crowd.congestionLevel}</strong>
            </p>
            <p>
              구역 <strong>{signalChecks.crowd.zoneId}</strong> · 갱신{" "}
              <strong>
                {formatSignalUpdatedAt(signalChecks.crowd.updatedAt)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            className="opsSignalFocus"
            onClick={() => {
              setTypeFilter("crowd");
              setOpenOnly(false);
              setToast("혼잡도 이벤트 중심으로 지도를 보여줍니다.");
            }}
          >
            지도에서 혼잡도 보기
          </button>
        </article>

        <article className="opsSignalCard">
          <div className="opsSignalHead">
            <strong>이상행동</strong>
            <span className={`opsSignalTone ${safetyTone.className}`}>
              {safetyTone.label}
            </span>
          </div>
          <div className="opsSignalBody">
            <p>
              심각도 <strong>{signalChecks.safety.severity}</strong> · 낙상{" "}
              <strong>{signalChecks.safety.fallCount}</strong>건
            </p>
            <p>
              요약 <strong>{signalChecks.safety.summary}</strong> · 조치{" "}
              <strong>{signalChecks.safety.action}</strong>
            </p>
            <p>
              구역 <strong>{signalChecks.safety.zoneId}</strong> · 갱신{" "}
              <strong>
                {formatSignalUpdatedAt(signalChecks.safety.updatedAt)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            className="opsSignalFocus"
            onClick={() => {
              setTypeFilter("all");
              if (
                signalChecks.safety.zoneId &&
                signalChecks.safety.zoneId !== "-"
              ) {
                setZoneFilter(signalChecks.safety.zoneId);
              }
              setMinSeverity(2);
              setOpenOnly(false);
              setToast("이상행동 신호 구역으로 필터를 맞췄습니다.");
            }}
          >
            지도에서 이상행동 보기
          </button>
        </article>

        <article className="opsSignalCard">
          <div className="opsSignalHead">
            <strong>쓰레기</strong>
            <span className={`opsSignalTone ${trashTone.className}`}>
              {trashTone.label}
            </span>
          </div>
          <div className="opsSignalBody">
            <p>
              심각도 <strong>{signalChecks.trash.severity}</strong> · 감지{" "}
              <strong>{signalChecks.trash.trashCount}</strong>건
            </p>
            <p>
              이벤트 <strong>{signalChecks.trash.count}</strong>건 · 구역{" "}
              <strong>{signalChecks.trash.zoneId}</strong>
            </p>
            <p>
              갱신{" "}
              <strong>
                {formatSignalUpdatedAt(signalChecks.trash.updatedAt)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            className="opsSignalFocus"
            onClick={() => {
              setTypeFilter("unknown");
              if (
                signalChecks.trash.zoneId &&
                signalChecks.trash.zoneId !== "-"
              ) {
                setZoneFilter(signalChecks.trash.zoneId);
              }
              setMinSeverity(2);
              setOpenOnly(false);
              setToast("쓰레기 감지 중심으로 지도를 보여줍니다.");
            }}
          >
            지도에서 쓰레기 보기
          </button>
        </article>
      </section>

      {/* <SlaAlertPanel
        alerts={slaAlerts}
        onSelectZone={(zoneId) => {
          setZoneFilter(zoneId);
          setOpenOnly(true);
          setToast(`${getZoneLabel(zoneId)} 구역으로 필터했어요.`);
        }}
      /> */}

      {showDiagnostics && (
        <div className="opsDiagnostics">
          <div className="opsDiagnosticsHead">
            <strong>운영 진단 패널</strong>
            <span className="mono">
              표시 {visibleEvents.length}건 · 라이브 비율 {liveRatio}
            </span>
          </div>
          <div className="opsDiagnosticsGrid">
            <article className="opsDiagItem">
              <span>선택 객체</span>
              <strong className="mono">{selectedSummary}</strong>
            </article>
            <article className="opsDiagItem">
              <span>연결 상태</span>
              <strong>{transportLabel(transport)}</strong>
            </article>
            <article className="opsDiagItem">
              <span>필터</span>
              <strong>
                {typeFilter === "all" ? "전체" : getEventTypeLabel(typeFilter)}{" "}
                ·{" "}
                {zoneFilter === "all" ? "전체 구역" : getZoneLabel(zoneFilter)}{" "}
                · S{minSeverity}+ · {openOnly ? "미해결" : "전체"}
              </strong>
            </article>
            <article className="opsDiagItem">
              <span>미해결/긴급</span>
              <strong>
                {openCount} / {criticalCount}
              </strong>
            </article>
          </div>

          <div className="opsDiagLog">
            <div className="opsDiagLogHead">
              <strong>최근 처리</strong>
              <span className="mono">권한 {ROLE_LABEL[role]}</span>
            </div>
            {recentActions.length === 0 ? (
              <div className="opsDiagLogEmpty">
                아직 기록된 처리 동작이 없습니다.
              </div>
            ) : (
              <div className="opsDiagLogList">
                {recentActions.map((entry) => {
                  const at = new Date(entry.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const actionLabel =
                    entry.action === "ack"
                      ? "확인"
                      : entry.action === "dispatch"
                        ? "호출"
                        : "종료";
                  return (
                    <div key={entry.id} className="opsDiagLogRow">
                      <span className="mono">{at}</span>
                      <span className="opsDiagLogBadge">{actionLabel}</span>
                      <span>{getZoneLabel(entry.zone_id)}</span>
                      <span className="mono">
                        {getEventIdLabel(entry.event_id)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="opsGrid">
        {/* 회색 부분 주석 처리  */}
        {/* <article className="opsCard opsMapCard">
          <MapView
            events={visibleEvents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            liveWindowMs={liveWindowMs}
            debugOverlay={debugOverlay}
          />
        </article> */}

        <article className="opsCard opsDetailCard">
          <header className="opsCardHead opsDetailHead">
            <div>
              <h3>처리 상세</h3>
              <p>
                {hydrated ? "상태 변화와 처리 기록" : "데이터를 불러오는 중"}
              </p>
            </div>
            <div className="opsDetailTools">
              <button
                type="button"
                className="opsPill"
                onClick={() => moveSelection(-1)}
                disabled={visibleEvents.length === 0}
              >
                이전
              </button>
              <button
                type="button"
                className="opsPill"
                onClick={() => moveSelection(1)}
                disabled={visibleEvents.length === 0}
              >
                다음
              </button>
              <button
                type="button"
                className="opsPill"
                onClick={clearSelection}
                disabled={!selectedId}
              >
                선택 해제
              </button>
            </div>
          </header>

          <div className="opsDetailStack">
            <EventDetail
              event={selectedEvent}
              liveWindowMs={liveWindowMs}
              readOnly={!canOperate}
              onAcknowledge={markAcknowledged}
              onDispatch={dispatchOperator}
              onResolve={markResolved}
            />
            <IncidentTimeline
              event={selectedEvent}
              entries={selectedTimeline}
            />
          </div>
        </article>
      </div>

      {toast && (
        <div className="opsToast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </section>
  );
}
