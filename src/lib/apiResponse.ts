import { NextResponse } from "next/server";

type ApiJsonBody = Record<string, unknown> | unknown[] | string | number | boolean | null;

type ApiJsonOptions = {
  status?: number;
  requestId?: string;
  cacheControl?: string;
  headers?: HeadersInit;
};

export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming?.trim() || crypto.randomUUID();
}

export function apiJson(body: ApiJsonBody, options: ApiJsonOptions = {}): NextResponse {
  const requestId = options.requestId ?? crypto.randomUUID();
  const response = NextResponse.json(body, {
    status: options.status ?? 200,
    headers: options.headers,
  });
  response.headers.set("x-request-id", requestId);
  response.headers.set("cache-control", options.cacheControl ?? "no-store");
  return response;
}

export function apiError(
  message: string,
  options: Omit<ApiJsonOptions, "status"> & { status?: number } = {}
): NextResponse {
  return apiJson(
    {
      error: {
        message: message.trim() || "internal server error",
        request_id: options.requestId ?? crypto.randomUUID(),
      },
    },
    {
      ...options,
      status: options.status ?? 500,
    }
  );
}

export function noStoreHeaders(requestId: string, headers: HeadersInit = {}): Headers {
  const out = new Headers(headers);
  out.set("x-request-id", requestId);
  out.set("cache-control", "no-store");
  return out;
}

export function readBoundedIntParam(
  url: URL,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = Number(url.searchParams.get(name) ?? String(fallback));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(raw)));
}
