
import type { Point, ZoneMap, Zone } from "./types";

const ASPECT_EPSILON = 0.003;

export type MapWorldNormTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

function safePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeDivide(value: number, divisor: number, fallback = 0.5) {
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isFinite(divisor) || divisor <= 0) return fallback;
  return value / divisor;
}

export function createMapWorldNormTransform(
  mapWidth: number,
  mapHeight: number,
  worldWidthM: number,
  worldDepthM: number
): MapWorldNormTransform {
  const safeMapWidth = safePositive(mapWidth, 1);
  const safeMapHeight = safePositive(mapHeight, 1);
  const safeWorldWidth = safePositive(worldWidthM, 1);
  const safeWorldDepth = safePositive(worldDepthM, 1);
  const mapAspect = safeMapWidth / safeMapHeight;
  const worldAspect = safeWorldWidth / safeWorldDepth;

  if (Math.abs(mapAspect - worldAspect) <= ASPECT_EPSILON) {
    return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  }

  // Map image is wider: keep Y and center-crop X for world projection.
  if (mapAspect > worldAspect) {
    const scaleX = clamp01(Math.min(1, worldAspect / mapAspect));
    return {
      scaleX,
      scaleY: 1,
      offsetX: (1 - scaleX) / 2,
      offsetY: 0,
    };
  }

  // Map image is taller: keep X and center-crop Y for world projection.
  const scaleY = clamp01(Math.min(1, mapAspect / worldAspect));
  return {
    scaleX: 1,
    scaleY,
    offsetX: 0,
    offsetY: (1 - scaleY) / 2,
  };
}

export function mapNormToWorldNorm(
  x: number,
  y: number,
  transform: MapWorldNormTransform
) {
  return {
    x: clamp01(safeDivide(x - transform.offsetX, transform.scaleX)),
    y: clamp01(safeDivide(y - transform.offsetY, transform.scaleY)),
  };
}

export function worldNormToMapNorm(
  x: number,
  y: number,
  transform: MapWorldNormTransform
) {
  return {
    x: clamp01(transform.offsetX + x * transform.scaleX),
    y: clamp01(transform.offsetY + y * transform.scaleY),
  };
}

export function pxToNorm(xPx: number, yPx: number, zm: ZoneMap) {
  return { x: xPx / zm.map.width, y: yPx / zm.map.height };
}

export function zonePolygonNorm(zone: Zone, zm: ZoneMap) {
  return zone.polygon.map(([x, y]) => [x / zm.map.width, y / zm.map.height] as const);
}

export function zoneHolesNorm(zone: Zone, zm: ZoneMap) {
  return (zone.holes ?? []).map((hole) =>
    hole.map(([x, y]) => [x / zm.map.width, y / zm.map.height] as const)
  );
}

export function centroidNorm(zone: Zone, zm: ZoneMap) {
  const [x, y] = zone.centroid;
  return { x: x / zm.map.width, y: y / zm.map.height };
}

export function randAround(x: number, y: number, r = 0.02) {
  const dx = (Math.random() * 2 - 1) * r;
  const dy = (Math.random() * 2 - 1) * r;
  return { x: clamp01(x + dx), y: clamp01(y + dy) };
}

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function isLive(ts: number, windowMs: number) {
  return Date.now() - ts <= windowMs;
}

export function pointInPolygon(x: number, y: number, polygon: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInZoneNorm(x: number, y: number, zone: Zone, zm: ZoneMap) {
  const outer = zonePolygonNorm(zone, zm);
  if (!pointInPolygon(x, y, outer)) return false;
  const holes = zoneHolesNorm(zone, zm);
  return !holes.some((hole) => pointInPolygon(x, y, hole));
}

export function samplePointInZoneNorm(zone: Zone, zm: ZoneMap, attempts = 36) {
  const outer = zonePolygonNorm(zone, zm);
  const xs = outer.map(([x]) => x);
  const ys = outer.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  for (let i = 0; i < attempts; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (pointInZoneNorm(x, y, zone, zm)) return { x, y };
  }

  return centroidNorm(zone, zm);
}
