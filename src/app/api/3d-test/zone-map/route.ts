import zoneMap from "@/data/zone_map_s001.json";
import { apiJson, resolveRequestId } from "@/lib/apiResponse";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);
  if (zoneMap && typeof zoneMap === "object" && !Array.isArray(zoneMap)) {
    return apiJson(zoneMap as Record<string, unknown>, { requestId });
  }
  return apiJson({ value: zoneMap }, { requestId });
}
