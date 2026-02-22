import { PHOTO_REFERENCE_POINTS as photoReferencePointsRaw } from "@/data/photo_reference_points.js";
import { applyHomography, computeHomography } from "./homography";

type Pair = readonly [number, number];

type PhotoReferencePoint = {
  trackId: number;
  predX: number;
  predY: number;
  worldX: number;
  worldZ: number;
};

const CAMERA_FRAME_WIDTH_PX = 1280;
const CAMERA_FRAME_HEIGHT_PX = 720;

export const MODEL_REF_WIDTH_M = 13.0;
export const MODEL_REF_DEPTH_M = 15.12058;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toPair(value: unknown): Pair | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

const PHOTO_REFERENCE_POINTS: readonly PhotoReferencePoint[] = (Array.isArray(photoReferencePointsRaw)
  ? photoReferencePointsRaw
  : []
)
  .map((row) => {
    if (!row || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;
    const trackId = Number(record.trackId);
    const pred = toPair(record.pred);
    const world = toPair(record.world);
    if (!Number.isFinite(trackId) || !pred || !world) return null;
    return {
      trackId: Math.trunc(trackId),
      predX: pred[0],
      predY: pred[1],
      worldX: world[0],
      worldZ: world[1],
    } satisfies PhotoReferencePoint;
  })
  .filter((point): point is PhotoReferencePoint => point !== null);

const WORLD_TO_MAP_NORM_H = (() => {
  if (PHOTO_REFERENCE_POINTS.length < 4) return null;

  const byTrackId = new Map(PHOTO_REFERENCE_POINTS.map((point) => [point.trackId, point] as const));
  const preferredAnchors = [2, 6, 5, 1]
    .map((trackId) => byTrackId.get(trackId))
    .filter((point): point is PhotoReferencePoint => point !== undefined);
  const anchors = preferredAnchors.length >= 4 ? preferredAnchors : PHOTO_REFERENCE_POINTS;

  const src: Pair[] = [];
  const dst: Pair[] = [];
  for (const point of anchors) {
    // world Z is inverted before mapping so all consumers share the same sign convention.
    src.push([point.worldX, -point.worldZ]);
    dst.push([
      clamp01(point.predX / CAMERA_FRAME_WIDTH_PX),
      clamp01(point.predY / CAMERA_FRAME_HEIGHT_PX),
    ]);
  }

  if (src.length < 4 || dst.length < 4) return null;
  return computeHomography(src.slice(0, 4), dst.slice(0, 4));
})();

export function worldToMapNorm(worldX: number, worldZ: number) {
  const sourceX = worldX;
  const sourceZ = -worldZ;

  if (WORLD_TO_MAP_NORM_H) {
    const mapped = applyHomography(WORLD_TO_MAP_NORM_H, sourceX, sourceZ);
    if (mapped) {
      return {
        x: clamp01(mapped.x),
        y: clamp01(mapped.y),
      };
    }
  }

  return {
    x: clamp01(sourceX / MODEL_REF_WIDTH_M + 0.5),
    y: clamp01(sourceZ / MODEL_REF_DEPTH_M + 0.5),
  };
}

export function mapNormToScene(normX: number, normY: number, widthM: number, depthM: number) {
  const width = Number.isFinite(widthM) && widthM > 0 ? widthM : MODEL_REF_WIDTH_M;
  const depth = Number.isFinite(depthM) && depthM > 0 ? depthM : MODEL_REF_DEPTH_M;
  return {
    x: (clamp01(normX) - 0.5) * width,
    z: (clamp01(normY) - 0.5) * depth,
  };
}
