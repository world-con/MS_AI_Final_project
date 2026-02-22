"use client";

import type { EventItem, IncidentTimelineEntry } from "@/lib/types";
import {
  getActorLabel,
  getCameraLabel,
  getEventIdLabel,
  getEventTypeLabel,
  getIncidentStatusLabel,
  getZoneLabel,
} from "@/lib/labels";

function getActionLabel(action?: IncidentTimelineEntry["action"]) {
  if (action === "ack") return "확인함";
  if (action === "dispatch") return "직원 호출";
  if (action === "resolved") return "처리 완료";
  return "처음 감지";
}

export default function OntologyPanel({
  event,
  timelineEntries,
}: {
  event?: EventItem;
  timelineEntries: IncidentTimelineEntry[];
}) {
  if (!event) {
    return <div className="ontologyEmpty">알림을 선택하면 무슨 일인지, 누가 처리했는지, 지금 상태가 어떤지 쉽게 보여줘요.</div>;
  }

  const latestAction = timelineEntries[0];
  const actorLabel = getActorLabel(latestAction?.actor ?? "ops-01");
  const actionLabel = getActionLabel(latestAction?.action);
  const statusAfter = latestAction?.to_status ?? event.incident_status;
  const typeLabel = getEventTypeLabel(event.type);
  const statusLabel = getIncidentStatusLabel(statusAfter);

  return (
    <div className="ontologyRoot">
      <div className="ontologyHead">
        <div className="ontologyTitle">알림 요약 보기</div>
        <div className="ontologySub">무슨 일이 있었고 누가 어떻게 처리했는지 쉽게 보여줘요</div>
      </div>

      <div className="ontologyTriples">
        <div className="tripleRow"><span>무슨 일이었나요?</span><span>:</span><span>{typeLabel}</span></div>
        <div className="tripleRow"><span>어디서 일어났나요?</span><span>:</span><span>{getZoneLabel(event.zone_id)}</span></div>
        <div className="tripleRow"><span>누가 처리했나요?</span><span>:</span><span>{actorLabel}</span></div>
        <div className="tripleRow"><span>마지막으로 한 일은?</span><span>:</span><span>{actionLabel}</span></div>
        <div className="tripleRow"><span>지금 상태는?</span><span>:</span><span>{statusLabel}</span></div>
      </div>

      <div className="ontologyMeta">
        <span className="ontologyBadge">알림 번호 {getEventIdLabel(event.id)}</span>
        <span className="ontologyBadge">카메라 {getCameraLabel(event.camera_id)}</span>
      </div>

      <div className="ontologyExplain">
        <p>이 알림은 <strong>{typeLabel}</strong> 상황으로 기록됩니다.</p>
        <p><strong>{actorLabel}</strong>가 최근에 <strong>{actionLabel}</strong> 처리했습니다.</p>
        <p>현재 상태는 <strong>{statusLabel}</strong>입니다.</p>
      </div>
    </div>
  );
}
