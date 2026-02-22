"use client";

import { useEffect, useRef } from "react";
import type { EventItem } from "@/lib/types";
import { isLive } from "@/lib/geo";
import { DEFAULT_LIVE_WINDOW_MS } from "@/lib/dummy";
import { getEventTypeLabel, getIncidentStatusLabel, getLiveStateLabel, getZoneLabel } from "@/lib/labels";

export default function EventList({
  events,
  selectedId,
  onSelect,
  liveWindowMs = DEFAULT_LIVE_WINDOW_MS,
}: {
  events: EventItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  liveWindowMs?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    const root = rootRef.current;
    if (!root) return;
    const selected = root.querySelector<HTMLElement>(".queueItem.selected");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div ref={rootRef} className="queueList">
      {events.length === 0 && (
        <div className="queueEmpty">보여줄 알림이 없어요.</div>
      )}

      {events.map((event) => {
        const live = isLive(event.detected_at, liveWindowMs);
        const selected = event.id === selectedId;
        const time = new Date(event.detected_at).toLocaleString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const confidencePct = Math.round(event.confidence * 100);
        const statusLabel = getIncidentStatusLabel(event.incident_status);
        const liveStateLabel = getLiveStateLabel(live);
        const typeLabel = getEventTypeLabel(event.type);

        return (
          <button
            key={event.id}
            type="button"
            className={"queueItem" + (selected ? " selected" : "")}
            onClick={() => onSelect(event.id)}
            aria-pressed={selected}
          >
            <div className="queueTop">
              <div className="queueMain">
                <span className={`severityBadge sev-${event.severity}`}>S{event.severity}</span>
                <span className="queueType">{typeLabel}</span>
                <span className={`statusBadge ${event.incident_status}`}>{statusLabel}</span>
              </div>
              <span className="queueTime mono">{time}</span>
            </div>
            <div className="queueMeta">
              <span>구역 {getZoneLabel(event.zone_id)}</span>
              <span>{liveStateLabel}</span>
              <span>신뢰도 {confidencePct}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
