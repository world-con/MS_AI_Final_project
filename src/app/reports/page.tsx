"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { normalizeEventFeed } from "@/lib/eventAdapter";
import { getEventTypeLabel, getZoneLabel } from "@/lib/labels";
import type { EventItem, IncidentTimelineEntry } from "@/lib/types";

const STORAGE_KEY = "twincity-ops-experience-v2";
const ACK_SLA_MS = 2 * 60 * 1000;
const RESOLVE_SLA_MS = 10 * 60 * 1000;

type RangeKey = "30m" | "60m" | "120m" | "24h" | "all";

function rangeLabel(range: RangeKey) {
  if (range === "30m") return "최근 30분";
  if (range === "60m") return "최근 60분";
  if (range === "120m") return "최근 120분";
  if (range === "24h") return "최근 24시간";
  return "전체";
}

function rangeMs(range: RangeKey) {
  if (range === "30m") return 30 * 60 * 1000;
  if (range === "60m") return 60 * 60 * 1000;
  if (range === "120m") return 120 * 60 * 1000;
  if (range === "24h") return 24 * 60 * 60 * 1000;
  return Number.POSITIVE_INFINITY;
}

function parseTimeline(raw: unknown): IncidentTimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  const rows: IncidentTimelineEntry[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const action = row.action;
    if (action !== "detected" && action !== "ack" && action !== "dispatch" && action !== "resolved") continue;

    const id = typeof row.id === "string" ? row.id : null;
    const eventId = typeof row.event_id === "string" ? row.event_id : null;
    const zoneId = typeof row.zone_id === "string" ? row.zone_id : null;
    const actor = typeof row.actor === "string" ? row.actor : null;
    const at = typeof row.at === "number" && Number.isFinite(row.at) ? row.at : null;
    if (!id || !eventId || !zoneId || !actor || at === null) continue;

    const fromStatus = row.from_status;
    const toStatus = row.to_status;
    const safeFromStatus =
      fromStatus === "new" || fromStatus === "ack" || fromStatus === "resolved" ? fromStatus : undefined;
    const safeToStatus = toStatus === "new" || toStatus === "ack" || toStatus === "resolved" ? toStatus : undefined;

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

  return rows.sort((a, b) => b.at - a.at);
}

function toCsvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export default function ReportsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [range, setRange] = useState<RangeKey>("120m");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setEvents([]);
        setTimeline([]);
        return;
      }

      const parsed = JSON.parse(raw) as { events?: unknown; timeline?: unknown; maxEvents?: number };
      const maxEvents = typeof parsed.maxEvents === "number" ? Math.max(80, Math.min(4000, parsed.maxEvents)) : 220;
      setEvents(
        normalizeEventFeed(parsed.events, {
          maxEvents,
          fallbackStoreId: "s001",
          defaultSource: "demo",
        })
      );
      setTimeline(parseTimeline(parsed.timeline));
    } catch {
      setEvents([]);
      setTimeline([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const since = useMemo(() => {
    const ms = rangeMs(range);
    return Number.isFinite(ms) ? now - ms : Number.NEGATIVE_INFINITY;
  }, [now, range]);

  const inRangeEvents = useMemo(
    () => events.filter((event) => event.detected_at >= since),
    [events, since]
  );

  const ackAtByEvent = useMemo(() => {
    const index = new Map<string, number>();
    timeline.forEach((entry) => {
      if (entry.to_status !== "ack") return;
      const prev = index.get(entry.event_id) ?? 0;
      if (entry.at > prev) index.set(entry.event_id, entry.at);
    });
    return index;
  }, [timeline]);

  const resolvedAtByEvent = useMemo(() => {
    const index = new Map<string, number>();
    timeline.forEach((entry) => {
      if (entry.to_status !== "resolved") return;
      const prev = index.get(entry.event_id) ?? 0;
      if (entry.at > prev) index.set(entry.event_id, entry.at);
    });
    return index;
  }, [timeline]);

  const openCount = inRangeEvents.filter((event) => event.incident_status !== "resolved").length;
  const criticalCount = inRangeEvents.filter((event) => event.severity === 3).length;

  const ackDurations = useMemo(() => {
    const rows: number[] = [];
    inRangeEvents.forEach((event) => {
      const ackAt = ackAtByEvent.get(event.id);
      if (!ackAt) return;
      rows.push(Math.max(0, ackAt - event.detected_at));
    });
    return rows;
  }, [ackAtByEvent, inRangeEvents]);

  const resolveDurations = useMemo(() => {
    const rows: number[] = [];
    inRangeEvents.forEach((event) => {
      const resolvedAt = resolvedAtByEvent.get(event.id);
      if (!resolvedAt) return;
      const ackAt = ackAtByEvent.get(event.id) ?? event.detected_at;
      rows.push(Math.max(0, resolvedAt - ackAt));
    });
    return rows;
  }, [ackAtByEvent, inRangeEvents, resolvedAtByEvent]);

  const ackSlaMet = ackDurations.filter((ms) => ms <= ACK_SLA_MS).length;
  const resolveSlaMet = resolveDurations.filter((ms) => ms <= RESOLVE_SLA_MS).length;

  const avgAckMs = ackDurations.length > 0 ? Math.round(ackDurations.reduce((a, b) => a + b, 0) / ackDurations.length) : 0;
  const avgResolveMs = resolveDurations.length > 0 ? Math.round(resolveDurations.reduce((a, b) => a + b, 0) / resolveDurations.length) : 0;

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    inRangeEvents.forEach((event) => {
      map.set(event.type, (map.get(event.type) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRangeEvents]);

  const byZone = useMemo(() => {
    const map = new Map<string, number>();
    inRangeEvents.forEach((event) => {
      map.set(event.zone_id, (map.get(event.zone_id) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [inRangeEvents]);

  const downloadCsv = () => {
    const header = [
      "id",
      "detected_at",
      "zone_id",
      "type",
      "severity",
      "incident_status",
      "camera_id",
      "source",
      "latency_ms",
      "ack_at",
      "resolved_at",
      "note",
    ];

    const rows = inRangeEvents.map((event) => {
      const ackAt = ackAtByEvent.get(event.id);
      const resolvedAt = resolvedAtByEvent.get(event.id);
      return [
        event.id,
        new Date(event.detected_at).toISOString(),
        event.zone_id,
        event.type,
        event.severity,
        event.incident_status,
        event.camera_id ?? "",
        event.source,
        event.latency_ms,
        ackAt ? new Date(ackAt).toISOString() : "",
        resolvedAt ? new Date(resolvedAt).toISOString() : "",
        event.note ?? "",
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map(toCsvValue).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `twincity-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("CSV를 다운로드했습니다.");
  };

  const copySummary = async () => {
    const text = [
      `TwinCity 운영 리포트 (${rangeLabel(range)})`,
      `총 알림: ${inRangeEvents.length}`,
      `미해결: ${openCount}`,
      `긴급(S3): ${criticalCount}`,
      `ACK SLA(<=${Math.round(ACK_SLA_MS / 60_000)}m): ${ackDurations.length > 0 ? `${ackSlaMet}/${ackDurations.length}` : "-"}`,
      `RESOLVE SLA(<=${Math.round(RESOLVE_SLA_MS / 60_000)}m): ${resolveDurations.length > 0 ? `${resolveSlaMet}/${resolveDurations.length}` : "-"}`,
      `평균 ACK: ${ackDurations.length > 0 ? `${Math.round(avgAckMs / 1000)}s` : "-"}`,
      `평균 처리: ${resolveDurations.length > 0 ? `${Math.round(avgResolveMs / 1000)}s` : "-"}`,
      "",
      "Top Zones",
      ...byZone.map(([zoneId, count]) => `- ${getZoneLabel(zoneId)}: ${count}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setNotice("요약을 클립보드에 복사했습니다.");
    } catch {
      setNotice("복사 권한이 없어서 실패했습니다.");
    }
  };

  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">리포트</p>
        <h1 className="pageTitle">운영 통계와 SLA</h1>
        <p className="pageLead">
          로컬에 저장된 이벤트/처리 기록을 기준으로, 운영 품질을 빠르게 점검할 수 있게 정리했습니다.
        </p>
      </header>

      <section className="panel reveal delay-1" style={{ padding: "1rem" }}>
        <div className="reportControls">
          <div className="reportControl">
            <span className="reportLabel">기간</span>
            <select className="opsSelect" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
              {(["30m", "60m", "120m", "24h", "all"] as const).map((key) => (
                <option key={key} value={key}>
                  {rangeLabel(key)}
                </option>
              ))}
            </select>
          </div>

          <div className="reportActions">
            <button type="button" className="button buttonGhost" onClick={load}>
              새로고침
            </button>
            <button type="button" className="button buttonGhost" onClick={copySummary}>
              요약 복사
            </button>
            <button type="button" className="button" onClick={downloadCsv} disabled={inRangeEvents.length === 0}>
              CSV 다운로드
            </button>
          </div>
        </div>

        {notice && <div className="reportNotice mono">{notice}</div>}
      </section>

      <section className="reveal delay-2">
        <div className="opsMetricRow">
          <article className="opsMetricCard">
            <span>총 알림</span>
            <strong>{inRangeEvents.length}</strong>
            <small>{rangeLabel(range)} 기준</small>
          </article>
          <article className="opsMetricCard">
            <span>미해결</span>
            <strong>{openCount}</strong>
            <small>처리 필요</small>
          </article>
          <article className="opsMetricCard">
            <span>긴급(S3)</span>
            <strong>{criticalCount}</strong>
            <small>중요도 3</small>
          </article>
          <article className="opsMetricCard">
            <span>ACK SLA</span>
            <strong>{ackDurations.length > 0 ? `${ackSlaMet}/${ackDurations.length}` : "-"}</strong>
            <small>{Math.round(ACK_SLA_MS / 60_000)}분 내 확인</small>
          </article>
          <article className="opsMetricCard">
            <span>처리 SLA</span>
            <strong>{resolveDurations.length > 0 ? `${resolveSlaMet}/${resolveDurations.length}` : "-"}</strong>
            <small>{Math.round(RESOLVE_SLA_MS / 60_000)}분 내 종료</small>
          </article>
        </div>
      </section>

      <section className="splitBlock reveal delay-3">
        <article className="panel reportCard">
          <h2 className="panelTitle">유형 분포</h2>
          {byType.length === 0 ? (
            <p className="reportEmpty">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="reportTable">
              {byType.map(([type, count]) => (
                <div key={type} className="reportRow">
                  <span>{getEventTypeLabel(type as EventItem["type"])}</span>
                  <span className="mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel reportCard">
          <h2 className="panelTitle">Top Zones</h2>
          {byZone.length === 0 ? (
            <p className="reportEmpty">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="reportTable">
              {byZone.map(([zoneId, count]) => (
                <div key={zoneId} className="reportRow">
                  <span>{getZoneLabel(zoneId)}</span>
                  <span className="mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="panel reveal delay-3 reportCard">
        <h2 className="panelTitle">SLA 평균</h2>
        <div className="reportTable">
          <div className="reportRow">
            <span>평균 ACK 시간</span>
            <span className="mono">{ackDurations.length > 0 ? `${Math.round(avgAckMs / 1000)}s` : "-"}</span>
          </div>
          <div className="reportRow">
            <span>평균 처리 시간</span>
            <span className="mono">{resolveDurations.length > 0 ? `${Math.round(avgResolveMs / 1000)}s` : "-"}</span>
          </div>
          <div className="reportRow">
            <span>기준 시작</span>
            <span className="mono">{Number.isFinite(since) ? new Date(since).toLocaleString() : "-"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
