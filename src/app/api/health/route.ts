import { apiJson, resolveRequestId } from "@/lib/apiResponse";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestId = resolveRequestId(request);
  const pollMsRaw = Number(process.env.NEXT_PUBLIC_EVENT_POLL_MS ?? "5000");
  const pollMs = Number.isFinite(pollMsRaw) ? pollMsRaw : 5000;

  return apiJson(
    {
      ok: true,
      request_id: requestId,
      service: "twincity-ui",
      now: new Date().toISOString(),
      live_sources: {
        ws: Boolean(process.env.NEXT_PUBLIC_EVENT_WS_URL?.trim()),
        sse: Boolean(process.env.NEXT_PUBLIC_EVENT_STREAM_URL?.trim()),
        http: Boolean(process.env.NEXT_PUBLIC_EVENT_API_URL?.trim()),
        poll_ms: pollMs,
      },
    },
    { requestId }
  );
}
