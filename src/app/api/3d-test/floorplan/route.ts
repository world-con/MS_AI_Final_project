import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { apiError, noStoreHeaders, resolveRequestId } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const CANDIDATE_FLOORPLAN_PATHS = [
  "/3d/floorplan_wireframe_20241027.png",
  "/floorplan_wireframe_20241027.png",
  "/3d/floorplan_wireframe_20241027.png",
  "/floorplan_wireframe_20241027.png",
  "/floorplan_s001.png",
];

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);

  for (const assetPath of CANDIDATE_FLOORPLAN_PATHS) {
    try {
      const fullPath = join(process.cwd(), "public", assetPath);
      const buffer = await readFile(fullPath);

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: noStoreHeaders(requestId, {
          "content-type": assetPath.endsWith(".png") ? "image/png" : "image/jpeg",
        }),
      });
    } catch {
      // Try next candidate path.
    }
  }

  return apiError("floorplan not found", { status: 404, requestId });
}
