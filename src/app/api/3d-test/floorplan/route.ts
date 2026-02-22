import { apiError, noStoreHeaders, resolveRequestId } from "@/lib/apiResponse";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CANDIDATE_FLOORPLAN_PATHS = [
  "/3d/floorplan_wireframe_20241027_clean.png",
  "/floorplan_wireframe_20241027_clean.png",
  "/3d/floorplan_wireframe_20241027.png",
  "/floorplan_wireframe_20241027.png",
  "/floorplan_s001.png",
];

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);

  for (const assetPath of CANDIDATE_FLOORPLAN_PATHS) {
    try {
      const fileUrl = new URL(assetPath, request.url);
      const assetResponse = await fetch(fileUrl.toString(), { cache: "no-store" });
      if (!assetResponse.ok) continue;

      const buffer = await assetResponse.arrayBuffer();
      return new Response(buffer, {
        status: 200,
        headers: noStoreHeaders(requestId, {
          "content-type": assetResponse.headers.get("content-type") || "image/png",
        }),
      });
    } catch {
      // Try next candidate path.
    }
  }

  return apiError("floorplan not found", { status: 404, requestId });
}
