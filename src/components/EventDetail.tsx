"use client";

import type { EventItem } from "@/lib/types";
import { isLive } from "@/lib/geo";
import { DEFAULT_LIVE_WINDOW_MS } from "@/lib/dummy";
import {
  getCameraLabel,
  getEventTypeLabel,
  getIncidentStatusLabel,
  getLiveStateLabel,
  getSourceLabel,
  getZoneLabel,
} from "@/lib/labels";

function recommendedAction(event: EventItem) {
  if (event.severity === 3) return "지금 바로 직원 호출과 현장 확인이 필요해요.";
  if (event.severity === 2) return "빠르게 확인하고 잠시 더 지켜보면 좋아요.";
  return "기록해두고 상황이 변하는지 확인해 주세요.";
}

export default function EventDetail({
  event,
  liveWindowMs = DEFAULT_LIVE_WINDOW_MS,
  readOnly = false,
  onAcknowledge,
  onDispatch,
  onResolve,
}: {
  event?: EventItem;
  liveWindowMs?: number;
  readOnly?: boolean;
  onAcknowledge?: (event: EventItem) => void;
  onDispatch?: (event: EventItem) => void;
  onResolve?: (event: EventItem) => void;
}) {
  if (!event) {
    return (
      <div className="detailEmpty">
        지도 마커를 선택하면 자세한 내용이 보여요.
      </div>
    );
  }

  const live = isLive(event.detected_at, liveWindowMs);
  const detected = new Date(event.detected_at).toLocaleString();
  const ingested = new Date(event.ingested_at).toLocaleString();
  const confidencePct = Math.round(event.confidence * 100);
  const statusLabel = getIncidentStatusLabel(event.incident_status);
  const liveStateLabel = getLiveStateLabel(live);
  const typeLabel = getEventTypeLabel(event.type);
  const canAck = !readOnly && event.incident_status === "new";
  const canResolve = !readOnly && event.incident_status !== "resolved";
  const canDispatch = !readOnly && event.incident_status !== "resolved";

  return (
    <div className="detailRoot">
      <div className="detailHeader">
        <div>
          <div className="detailTitle">{typeLabel} 사건</div>
          <div className="detailSubtitle">{recommendedAction(event)}</div>
        </div>
        <div className="detailBadges">
          <span className={`severityBadge sev-${event.severity}`}>S{event.severity}</span>
          <span className={`statusBadge ${event.incident_status}`}>{statusLabel}</span>
          <span className={`statusBadge ${live ? "new" : "resolved"}`}>{liveStateLabel}</span>
        </div>
      </div>

      <div className="detailGrid">
        <div className="detailField"><span className="detailLabel">발생 위치</span><span className="detailValue">{getZoneLabel(event.zone_id)}</span></div>
        <div className="detailField"><span className="detailLabel">카메라</span><span className="detailValue">{getCameraLabel(event.camera_id)}</span></div>
        {/* <div className="detailField"><span className="detailLabel">알림 경로</span><span className="detailValue">{getSourceLabel(event.source)}</span></div> */}
        {/* <div className="detailField"><span className="detailLabel">분석 버전</span><span className="detailValue">{event.model_version ?? "-"}</span></div> */}
        <div className="detailField"><span className="detailLabel">발생 시각</span><span className="detailValue mono">{detected}</span></div>
        {/* <div className="detailField"><span className="detailLabel">화면 반영 시간</span><span className="detailValue mono">{ingested}</span></div> */}
        {/* <div className="detailField"><span className="detailLabel">화면 반영 시간</span><span className="detailValue mono">{event.latency_ms}ms</span></div> */}
        {/* <div className="detailField"><span className="detailLabel">신뢰도</span><span className="detailValue">{confidencePct}%</span></div> */}
        <div className="detailField"><span className="detailLabel">화면 위치</span><span className="detailValue">({event.x.toFixed(3)}, {event.y.toFixed(3)})</span></div>
        <div className="detailField fullWidth">
          <span className="detailLabel">메모</span>
          <textarea
            className="detailValue"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical",
              minHeight: "2.8em",
              padding: "0",
              fontFamily: "inherit",
              fontSize: "0.82rem",
              width: "100%",
            }}
            // defaultValue={event.note ?? ""}
            placeholder="메모를 입력하세요..."
            onChange={(e) => {
              // Note: In a real app, you'd bubble this up to update the event state
              console.log("Memory update:", e.target.value);
            }}
          />
        </div>
      </div>

      <div className="actionStrip">
        <button
          type="button"
          className="opsBtn primary"
          onClick={() => onAcknowledge?.(event)}
          disabled={!canAck}
        >
          {canAck ? "확인했어요" : "확인 완료"}
        </button>
        <button
          type="button"
          className="opsBtn"
          onClick={() => onDispatch?.(event)}
          disabled={!canDispatch}
        >
          로봇 호출
        </button>
        {/* <button
          type="button"
          className="opsBtn ghost"
          onClick={() => onResolve?.(event)}
          disabled={!canResolve}
        >
          {canResolve ? "처리 끝내기" : "처리 완료"}
        </button> */}
      </div>

      {/* <p className="detailHint">
        {readOnly
          ? "보기 권한에서는 상태 변경 버튼이 비활성화됩니다."
          : "아래 요약에서는 어떤 일인지, 누가 처리했는지 한눈에 볼 수 있어요."
          }
      </p> */}
    </div>
  );
}
