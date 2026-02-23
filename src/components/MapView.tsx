"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import zoneMap from "@/data/zone_map_s001.json";
import MapWorld3D from "@/components/MapWorld3D";
import { MODEL_REF_DEPTH_M, MODEL_REF_WIDTH_M } from "@/lib/coordinateTransform";
import { clamp01, isLive } from "@/lib/geo";
import { getEventTypeLabel, getTrackLabel, getZoneLabel } from "@/lib/labels";
import type { EventItem, ZoneMap } from "@/lib/types";

type Props = {
  events: EventItem[];
  selectedId?: string;
  onSelect: (id?: string) => void;
  liveWindowMs?: number;
  debugOverlay?: boolean;
  mapAspectRatioOverride?: number;
  onExpand?: () => void;
};

const FALLBACK_FLOOR_IMAGE = "/floorplan_wireframe_20241027.png";
const EXTERNAL_FLOORPLAN_IMAGE = "/api/3d-test/floorplan";
const EXTERNAL_3D_TEST_MODEL = "/api/3d-test/model";

function formatMeters(value?: number) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "-";
}

function resolvePhotoLabelPosition(id: string, cx: number, cy: number, vbW: number, vbH: number) {
  const hash = Array.from(id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const staggerY = ((hash % 3) - 1) * 14;
  let textAnchor: "start" | "end" = cx < vbW * 0.74 ? "start" : "end";
  let x = textAnchor === "start" ? cx + 12 : cx - 12;
  let y = cy > vbH * 0.18 ? cy - 10 + staggerY : cy + 20 + staggerY;

  if (y < 18) y = cy + 20 + Math.abs(staggerY);
  if (y > vbH - 8) y = cy - 10 - Math.abs(staggerY);
  if (x < 8) {
    x = cx + 12;
    textAnchor = "start";
  }
  if (x > vbW - 8) {
    x = cx - 12;
    textAnchor = "end";
  }

  return {
    x: Math.max(8, Math.min(vbW - 8, x)),
    y: Math.max(18, Math.min(vbH - 8, y)),
    textAnchor,
  };
}

export default function MapView({
  events,
  selectedId,
  onSelect,
  liveWindowMs = 60 * 60 * 1000,
  debugOverlay = false,
  mapAspectRatioOverride,
  onExpand,
}: Props) {
  const zm = zoneMap as ZoneMap;

  const worldWidthM = MODEL_REF_WIDTH_M;
  const worldDepthM = MODEL_REF_DEPTH_M;

  const mapImageSrc2d = useMemo(() => {
    const imageName = zm.map.image_name?.trim();
    if (!imageName) return FALLBACK_FLOOR_IMAGE;
    return imageName.startsWith("/") ? imageName : `/${imageName}`;
  }, [zm.map.image_name]);

  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [threeCacheBust, setThreeCacheBust] = useState(0);

  const floorplan3dSrc = `${EXTERNAL_FLOORPLAN_IMAGE}?v=${threeCacheBust}`;
  const model3dSrc = `${EXTERNAL_3D_TEST_MODEL}?v=${threeCacheBust}`;

  const vbW = 1000;
  const mapAspect = Number.isFinite(mapAspectRatioOverride) && Number(mapAspectRatioOverride) > 0
    ? Number(mapAspectRatioOverride)
    : zm.map.width / zm.map.height;
  const vbH = Math.round(vbW / mapAspect);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedEvent = events.find((event) => event.id === selectedId);

  if (!mounted) {
    return <div style={{ width: "100%", height: "100%", background: "rgba(0,0,0,0.05)" }} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          aspectRatio: `${mapAspect}`,
          borderRadius: "14px",
          overflow: "hidden",
          border: "1px solid rgba(120,150,210,0.18)",
          background: "rgba(0,0,0,0.12)",
        }}
      >
        {viewMode === "2d" ? (
          <>
            <Image
              src={mapImageSrc2d}
              alt="floorplan"
              fill
              style={{
                objectFit: "contain",
                opacity: 0.97,
              }}
              priority
            />

            <svg
              viewBox={`0 0 ${vbW} ${vbH}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                cursor: onExpand ? "zoom-in" : "default"
              }}
              onClick={() => {
                onSelect(undefined);
                onExpand?.();
              }}
            >
              {debugOverlay &&
                zm.zones.map((zone) => {
                  const points = (zone.polygon ?? [])
                    .filter((pair): pair is number[] => Array.isArray(pair) && pair.length >= 2)
                    .map(([x, y]) => `${(x / zm.map.width) * vbW},${(y / zm.map.height) * vbH}`)
                    .join(" ");
                  return (
                    <g key={zone.zone_id}>
                      <polygon
                        points={points}
                        fill="rgba(87, 166, 255, 0.12)"
                        stroke="rgba(160, 209, 255, 0.6)"
                        strokeWidth={2}
                      />
                      <text
                        x={(Number(zone.centroid?.[0] ?? 0) / zm.map.width) * vbW}
                        y={(Number(zone.centroid?.[1] ?? 0) / zm.map.height) * vbH}
                        fill="rgba(236,241,250,0.9)"
                        fontSize={14}
                        fontWeight={700}
                        textAnchor="middle"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {getZoneLabel(zone.zone_id)}
                      </text>
                    </g>
                  );
                })}

              {events.map((event) => {
                const live = isLive(event.detected_at, liveWindowMs);
                const isAlert = event.raw_status?.toLowerCase() === "fall_down" || event.type === "fall";
                const isPhotoLog = event.id.startsWith("photo-log-");
                const isEdgeCleaning = event.edge_category === "cleaning";
                const isEdgeSafety = event.edge_category === "safety";
                const isEdgeMarker = isEdgeCleaning || isEdgeSafety;
                const radius = isEdgeSafety ? 11 : isEdgeCleaning ? 9 : isAlert ? 11 : event.severity === 2 ? 8 : 7;
                const x = clamp01(event.x);
                const y = clamp01(event.y);
                const cx = x * vbW;
                const cy = y * vbH;
                const selected = event.id === selectedId;
                const labelPos = isPhotoLog ? resolvePhotoLabelPosition(event.id, cx, cy, vbW, vbH) : null;

                // 엣지 마커 색상: 쓰레기=노란색, 이상행동=빨간색
                const markerFill = isEdgeSafety
                  ? "rgba(255,74,93,0.96)"
                  : isEdgeCleaning
                    ? "rgba(255,201,87,0.93)"
                    : isAlert
                      ? "rgba(255,74,93,0.96)"
                      : event.severity === 2
                        ? "rgba(255,201,87,0.93)"
                        : live
                          ? "rgba(87,166,255,0.92)"
                          : "rgba(121,150,196,0.84)";

                const markerGlow = isEdgeSafety
                  ? "rgba(255,74,93,0.24)"
                  : isEdgeCleaning
                    ? "rgba(255,201,87,0.22)"
                    : isAlert
                      ? "rgba(255,74,93,0.24)"
                      : live
                        ? "rgba(89,176,255,0.18)"
                        : "rgba(109,130,160,0.18)";

                return (
                  <g
                    key={event.id}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onSelect(event.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle cx={cx} cy={cy} r={Math.max(14, radius + 6)} fill="transparent" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={selected ? radius + 11 : radius + 7}
                      fill={markerGlow}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill={markerFill}
                      stroke={selected ? "white" : "rgba(0,0,0,0.26)"}
                      strokeWidth={selected ? 3 : 1}
                    />
                    {isPhotoLog ? (
                      <text
                        x={labelPos?.x}
                        y={labelPos?.y}
                        textAnchor={labelPos?.textAnchor}
                        fill="rgba(255, 230, 118, 0.98)"
                        fontSize={13}
                        fontWeight={700}
                        style={{
                          pointerEvents: "none",
                          userSelect: "none",
                          paintOrder: "stroke",
                          stroke: "rgba(12, 19, 35, 0.88)",
                          strokeWidth: 3.2,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                        }}
                      >
                        {`${event.id} -> w(${formatMeters(event.world_x_m)}, ${formatMeters(event.world_z_m)})`}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </>
        ) : (
          <MapWorld3D
            events={events}
            selectedId={selectedId}
            onSelect={onSelect}
            liveWindowMs={liveWindowMs}
            mapImageSrc={floorplan3dSrc}
            modelSrc={model3dSrc}
            worldWidthM={worldWidthM}
            worldDepthM={worldDepthM}
            resourceSource="downloads"
            modelSource="downloads"
          />
        )}

        <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 6 }}>
          <button
            type="button"
            className={"opsPill" + (viewMode === "2d" ? " active" : "")}
            onClick={() => setViewMode("2d")}
            aria-pressed={viewMode === "2d"}
          >
            평면
          </button>
          <button
            type="button"
            className={"opsPill" + (viewMode === "3d" ? " active" : "")}
            onClick={() => {
              setThreeCacheBust(Date.now());
              setViewMode("3d");
            }}
            aria-pressed={viewMode === "3d"}
          >
            입체
          </button>
        </div>
      </div>

      {/* <div
        style={{
          width: "100%",
          borderRadius: "0 0 14px 14px",
          border: "1px solid rgba(198, 218, 255, 0.24)",
          borderTop: "none",
          background: "rgba(6, 13, 24, 0.42)",
          color: "rgba(227,238,255,0.96)",
          padding: "0.34rem 0.5rem 0.5rem",
          fontSize: 11,
          display: "grid",
          gap: 6,
        }}
      > */}
      {/* {selectedEvent ? ( */}
      <>
        {/* <p>
              <strong>{getEventTypeLabel(selectedEvent.type)}</strong> · {getTrackLabel(selectedEvent.track_id, selectedEvent.id)} · 구역 {getZoneLabel(selectedEvent.zone_id)}
            </p> */}
      </>
      {/* ) : ( */}
      {/* <p style={{ opacity: 0.74 }}>지도의 마커를 누르면 선택 정보가 표시됩니다.</p> */}
      {/* )} */}
    </div>
    // </div>
  );
}
