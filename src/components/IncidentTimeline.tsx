"use client";

import type { EventItem, IncidentAction, IncidentTimelineEntry } from "@/lib/types";
import { getActorLabel, getEventIdLabel, getIncidentStatusLabel, getZoneLabel } from "@/lib/labels";

function getActionLabel(action: IncidentAction) {
  if (action === "detected") return "처음 알림";
  if (action === "ack") return "확인함";
  if (action === "dispatch") return "직원 호출";
  return "처리 완료";
}

export default function IncidentTimeline({
  event,
  entries,
}: {
  event?: EventItem;
  entries: IncidentTimelineEntry[];
}) {
  if (!event) {
    return <div className="timelineEmpty">알림을 선택하면 처리 과정을 시간순으로 볼 수 있어요.</div>;
  }

  const baseline: IncidentTimelineEntry = {
    id: `detected-${event.id}`,
    event_id: event.id,
    zone_id: event.zone_id,
    action: "detected",
    actor: event.source,
    at: event.detected_at,
    to_status: "new",
    note: "시스템이 처음 감지했어요",
  };
  const rows = [baseline, ...entries]
    .sort((a, b) => b.at - a.at)
    .slice(0, 14);

  return (
    <div className="timelineRoot">
      <div className="timelineHead">
        <div className="timelineTitle">처리 기록</div>
        <div className="timelineSub">알림 번호 {getEventIdLabel(event.id)}</div>
      </div>
      <div className="timelineList">
        {rows.map((row) => {
          const at = new Date(row.at).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const fromLabel = row.from_status ? getIncidentStatusLabel(row.from_status) : undefined;
          const toLabel = row.to_status ? getIncidentStatusLabel(row.to_status) : undefined;

          return (
            <div key={row.id} className="timelineItem">
              <div className="timelineTop">
                <span className={`timelineBadge action-${row.action}`}>{getActionLabel(row.action)}</span>
                <span className="timelineTime mono">{at}</span>
              </div>
              <div className="timelineMeta">
                <span>담당 {getActorLabel(row.actor)}</span>
                <span>위치 {getZoneLabel(row.zone_id)}</span>
                {(fromLabel || toLabel) && (
                  <span>
                    상태 {fromLabel ?? "-"} → {toLabel ?? "-"}
                  </span>
                )}
              </div>
              {row.note && <div className="timelineNote">{row.note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
