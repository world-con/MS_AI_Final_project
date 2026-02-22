import { apiError, apiJson, readBoundedIntParam, resolveRequestId } from "@/lib/apiResponse";
import { generateDummyEvents } from "@/lib/dummy";
import type { EventItem } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toSchemaA(event: EventItem) {
  return {
    eventId: event.id,
    detectedAt: new Date(event.detected_at).toISOString(),
    receivedAt: new Date(event.ingested_at).toISOString(),
    eventType: event.type.toUpperCase(),
    priority: event.severity === 3 ? "P1" : event.severity === 2 ? "P2" : "P3",
    score: Number((event.confidence * 100).toFixed(1)),
    zoneId: event.zone_id,
    cameraId: event.camera_id,
    status:
      event.incident_status === "new"
        ? "OPEN"
        : event.incident_status === "ack"
          ? "ACKNOWLEDGED"
          : "CLOSED",
    location: {
      xNorm: Number(event.x.toFixed(4)),
      yNorm: Number(event.y.toFixed(4)),
    },
    provider: "vision-v2",
    note: event.note,
  };
}

function toSchemaB(event: EventItem) {
  return {
    alarm_id: event.id,
    timestamp: Math.floor(event.detected_at / 1000),
    ingested_at: event.ingested_at,
    category: event.type,
    level: event.severity === 3 ? "high" : event.severity === 2 ? "medium" : "low",
    confidence: Number((event.confidence * 100).toFixed(1)),
    zone: {
      id: event.zone_id,
    },
    position: {
      x: Number((event.x * 100).toFixed(2)),
      y: Number((event.y * 100).toFixed(2)),
      unit: "percent",
    },
    state:
      event.incident_status === "new"
        ? "OPEN"
        : event.incident_status === "ack"
          ? "IN_PROGRESS"
          : "DONE",
    camera: {
      id: event.camera_id,
    },
    store: {
      id: event.store_id,
    },
    message: event.note,
  };
}

function toSchemaEdgeObject(event: EventItem, idx: number) {
  const status =
    event.type === "fall"
      ? "fall_down"
      : event.type === "fight"
        ? "aggressive"
        : event.type === "crowd"
          ? "crowding"
          : "walking";

  const worldX = Number((event.world_x_m ?? event.x * 9).toFixed(2));
  const worldZ = Number((event.world_z_m ?? event.y * 4.8).toFixed(2));
  const cause = event.type === "fall" ? "Faint" : event.type === "fight" ? "Conflict" : "Unknown";
  const action = event.severity === 3 ? "Call_119" : "Check_Onsite";

  return {
    track_id: Number(event.track_id ?? idx + 100),
    label: event.object_label ?? "person",
    status,
    confidence: Number(event.confidence.toFixed(2)),
    location: {
      bbox: [655, 307, 819, 472],
      frame: {
        width: 1280,
        height: 720,
      },
      world: {
        x: worldX,
        z: worldZ,
      },
      zone_id: "Store",
    },
    vlm_analysis: {
      summary: event.note ?? "Potential safety issue detected.",
      cause,
      action,
    },
  };
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);
  const shape = String(url.searchParams.get("shape") ?? "a").trim().toLowerCase();
  const count = readBoundedIntParam(url, "count", 4, 1, 20);

  if (!["a", "b", "single", "edge"].includes(shape)) {
    return apiError("Invalid shape parameter. Use a, b, single, or edge.", {
      status: 400,
      requestId,
    });
  }

  const events = generateDummyEvents(count, {
    liveWindowMs: 60 * 60 * 1000,
    historyRatio: 0.15,
  });

  if (shape === "b") {
    return apiJson(
      {
        type: "alert.batch",
        request_id: requestId,
        payload: {
          items: events.map(toSchemaB),
        },
        generated_at: new Date().toISOString(),
      },
      { requestId }
    );
  }

  if (shape === "single") {
    return apiJson(
      {
        type: "alert.created",
        request_id: requestId,
        payload: {
          event: toSchemaB(events[0]),
        },
        generated_at: new Date().toISOString(),
      },
      { requestId }
    );
  }

  if (shape === "edge") {
    return apiJson(
      {
        request_id: requestId,
        deviceId: "camera-edge-01",
        timestamp: new Date(events[0].detected_at).toISOString(),
        eventType: "SAFETY",
        severity: events.some((event) => event.severity === 3) ? "Critical" : "Warning",
        data: {
          count: events.length,
          frame: {
            width: 1280,
            height: 720,
          },
          objects: events.map(toSchemaEdgeObject),
        },
      },
      { requestId }
    );
  }

  return apiJson(
    {
      meta: {
        request_id: requestId,
        generated_at: new Date().toISOString(),
        shape: "a",
      },
      records: events.map(toSchemaA),
    },
    { requestId }
  );
}
