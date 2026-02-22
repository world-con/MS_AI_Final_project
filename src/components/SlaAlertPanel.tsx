"use client";

import { getZoneLabel } from "@/lib/labels";

export type ZoneSlaAlert = {
  zoneId: string;
  breachCount: number;
  openCount: number;
  worstAgeSec: number;
  overdueAckCount: number;
  overdueResolveCount: number;
  ackThresholdSec: number;
  resolveThresholdSec: number;
  topSeverity: 1 | 2 | 3;
};

export default function SlaAlertPanel({
  alerts,
  onSelectZone,
}: {
  alerts: ZoneSlaAlert[];
  onSelectZone?: (zoneId: string) => void;
}) {
  const breachTotal = alerts.reduce((sum, alert) => sum + alert.breachCount, 0);

  return (
    <article className="slaCard">
      <div className="slaHead">
        <div>
          <div className="slaTitle">처리가 늦어진 구역 알림</div>
          <div className="slaSub">오래 처리되지 않은 알림이 있는 구역을 보여줘요</div>
        </div>
        <div className="slaBadge">늦어진 알림 {breachTotal}건</div>
      </div>

      <div className="slaList">
        {alerts.length === 0 && (
          <div className="slaEmpty">지금은 처리 지연 알림이 없습니다.</div>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.zoneId}
            className={"slaRow" + (onSelectZone ? " clickable" : "")}
            role={onSelectZone ? "button" : undefined}
            tabIndex={onSelectZone ? 0 : undefined}
            onClick={() => onSelectZone?.(alert.zoneId)}
            onKeyDown={(event) => {
              if (!onSelectZone) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelectZone(alert.zoneId);
            }}
            aria-label={onSelectZone ? `${getZoneLabel(alert.zoneId)} 필터로 이동` : undefined}
          >
            <div className="slaZone">{getZoneLabel(alert.zoneId)}</div>
            <div className="slaMeta">
              미확인 {alert.overdueAckCount} / 미해결 {alert.overdueResolveCount} · 진행중 {alert.openCount}
            </div>
            <div className="slaMeta mono">
              가장 오래 {alert.worstAgeSec}초 · 기준 {alert.ackThresholdSec}/{alert.resolveThresholdSec}초
            </div>
            <div className={`slaSev sev-${alert.topSeverity}`}>S{alert.topSeverity}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
