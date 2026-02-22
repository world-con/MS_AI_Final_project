import type { EventType, EventTypeFilter, IncidentStatus } from "@/lib/types";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  crowd: "사람 몰림",
  fall: "넘어짐",
  fight: "다툼",
  loitering: "오래 머묾",
  unknown: "알 수 없음",
};

const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  new: "새 알림",
  ack: "확인함",
  resolved: "처리 완료",
};

const ZONE_LABELS: Record<string, string> = {
  "zone-s001-back": "뒤쪽 통로",
  "zone-s001-aisle-a": "왼쪽 통로",
  "zone-s001-center": "중앙 구역",
  "zone-s001-aisle-b": "오른쪽 통로",
  "zone-s001-storage": "창고 앞",
  "zone-s001-cashier": "계산대 앞",
  "zone-s001-entrance": "입구",
  "zone-s001-exit": "출구",
};

const STORE_LABELS: Record<string, string> = {
  s001: "본 매장",
};

const CAMERA_LABELS: Record<string, string> = {
  "cam-front-01": "입구 카메라",
  "cam-mid-02": "중앙 카메라",
  "cam-cash-03": "계산대 카메라",
  "cam-back-04": "뒤쪽 카메라",
  cam01: "카메라 1",
};

export function getEventTypeLabel(type: EventType | EventTypeFilter) {
  if (type === "all") return "전체";
  return EVENT_TYPE_LABELS[type];
}

export function getIncidentStatusLabel(status: IncidentStatus) {
  return INCIDENT_STATUS_LABELS[status];
}

export function getLiveStateLabel(live: boolean) {
  return live ? "지금" : "지난 기록";
}

export function getZoneLabel(zoneId?: string | null) {
  if (!zoneId) return "-";
  if (ZONE_LABELS[zoneId]) return ZONE_LABELS[zoneId];
  if (zoneId.startsWith("zone-")) return "매장 구역";
  return zoneId;
}

export function getStoreLabel(storeId?: string | null) {
  if (!storeId) return "-";
  return STORE_LABELS[storeId] ?? "매장";
}

export function getCameraLabel(cameraId?: string | null) {
  if (!cameraId) return "-";
  if (CAMERA_LABELS[cameraId]) return CAMERA_LABELS[cameraId];
  if (cameraId.startsWith("cam")) return "카메라";
  return cameraId;
}

export function getActorLabel(actor?: string | null) {
  if (!actor) return "-";
  if (actor.startsWith("ops-")) return "현장 담당자";
  if (actor === "demo") return "시스템";
  return actor;
}

export function getSourceLabel(source?: string | null) {
  if (source === "camera") return "카메라";
  if (source === "api") return "외부 연동";
  if (source === "demo") return "샘플 데이터";
  return "기타";
}

export function getEventIdLabel(id?: string | null) {
  if (!id) return "-";
  const compact = id.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length === 0) return id.slice(0, 8);
  const tail = compact.slice(-6).toUpperCase();
  return `#${tail}`;
}

export function getTrackLabel(trackId?: string | null, fallbackEventId?: string | null) {
  if (trackId && trackId.trim().length > 0) return `대상 ${trackId}`;
  const eventTail = getEventIdLabel(fallbackEventId);
  return `대상 ${eventTail}`;
}
