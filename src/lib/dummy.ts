
import zoneMap from "@/data/zone_map_s001.json";
import type { EventItem, EventType, ZoneMap } from "./types";
import { samplePointInZoneNorm } from "./geo";

const zm = zoneMap as ZoneMap;
const STORE_ID = zm.store_id;
const CAMERAS = ["cam-front-01", "cam-mid-02", "cam-cash-03", "cam-back-04"] as const;

export const EVENT_TYPES: readonly EventType[] = ["crowd", "fall", "fight", "loitering"];

type DummyEventOptions = {
  now?: number;
  liveWindowMs?: number;
  historyRatio?: number;
  forceHistory?: boolean;
};

type DummyBatchOptions = DummyEventOptions & {
  newestFirst?: boolean;
};

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid() { return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16); }

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const DEFAULT_LIVE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_HISTORY_LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours

export function generateDummyEvent(options: DummyEventOptions = {}): EventItem {
  const z = pick(zm.zones);
  const p = samplePointInZoneNorm(z, zm);

  const type = pick(EVENT_TYPES);
  const severity: 1 | 2 | 3 = (type === "fall" || type === "fight") ? 3 : (type === "crowd" ? 2 : 1);
  const now = options.now ?? Date.now();
  const liveWindowMs = options.liveWindowMs ?? DEFAULT_LIVE_WINDOW_MS;
  const historyRatio = Math.max(0, Math.min(1, options.historyRatio ?? 0));
  const isHistory = options.forceHistory ?? Math.random() < historyRatio;
  const detectedAt = isHistory
    ? now - liveWindowMs - randomInt(10_000, DEFAULT_HISTORY_LOOKBACK_MS)
    : now - randomInt(0, Math.floor(Math.max(10_000, liveWindowMs * 0.3)));
  const ingestDelay = randomInt(180, 1800);
  const ingestedAt = detectedAt + ingestDelay;
  const confidence = Math.max(0.6, Math.min(0.99, 0.72 + severity * 0.08 + (Math.random() * 0.08 - 0.04)));
  const incidentStatus = isHistory
    ? (Math.random() < 0.55 ? "resolved" : "ack")
    : "new";

  return {
    id: uid(),
    store_id: STORE_ID,
    detected_at: detectedAt,
    ingested_at: ingestedAt,
    latency_ms: ingestDelay,
    type,
    severity,
    confidence,
    zone_id: z.zone_id,
    camera_id: pick(CAMERAS),
    source: "demo",
    model_version: "demo-v0.3",
    incident_status: incidentStatus,
    x: p.x,
    y: p.y,
    note: type === "crowd" ? "사람이 몰리고 있어요" :
          type === "fall" ? "넘어짐 가능성이 감지됐어요" :
          type === "fight" ? "다툼 가능 동작이 감지됐어요" :
          "오랫동안 머무는 상황이 감지됐어요",
  };
}

export function generateDummyEvents(count: number, options: DummyBatchOptions = {}): EventItem[] {
  const { newestFirst = true, ...eventOptions } = options;
  const now = options.now ?? Date.now();
  const events = Array.from({ length: Math.max(0, count) }, (_, idx) =>
    generateDummyEvent({
      ...eventOptions,
      now: now - idx * randomInt(1_000, 6_000),
    })
  );
  return newestFirst === false
    ? events.sort((a, b) => a.detected_at - b.detected_at)
    : events.sort((a, b) => b.detected_at - a.detected_at);
}
