import { apiError, noStoreHeaders, resolveRequestId } from "@/lib/apiResponse";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Optional: if a GLB is added under public/, this endpoint will serve it.
const CANDIDATE_MODEL_PATHS = [
  "/3d/models/store_13x13.glb",
  "/models/store_13x13.glb",
  "/store_13x13.glb",
  "/store.glb",
];

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);

  for (const modelPath of CANDIDATE_MODEL_PATHS) {
    try {
      const modelUrl = new URL(modelPath, request.url);
      const assetResponse = await fetch(modelUrl.toString(), { cache: "no-store" });
      if (!assetResponse.ok) continue;
      const buffer = await assetResponse.arrayBuffer();
      return new Response(buffer, {
        status: 200,
        headers: noStoreHeaders(requestId, {
          "content-type": assetResponse.headers.get("content-type") || "model/gltf-binary",
        }),
      });
    } catch {
      // Try next candidate.
    }
  }

  return apiError("model not found", { status: 404, requestId });
}
