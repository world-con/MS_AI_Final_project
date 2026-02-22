import { describe, expect, test } from "vitest";

import { adaptRawEvent, normalizeEventFeed } from "../src/lib/eventAdapter";
import type { EventItem } from "../src/lib/types";

function pointInRectWithPadding(
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  padding: number
) {
  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  );
}

function expectNormalized(event: EventItem) {
  expect(typeof event.id).toBe("string");
  expect(event.id.length).toBeGreaterThan(0);

  expect(typeof event.detected_at).toBe("number");
  expect(Number.isFinite(event.detected_at)).toBe(true);

  expect(typeof event.ingested_at).toBe("number");
  expect(Number.isFinite(event.ingested_at)).toBe(true);

  expect(typeof event.x).toBe("number");
  expect(typeof event.y).toBe("number");
  expect(event.x).toBeGreaterThanOrEqual(0);
  expect(event.x).toBeLessThanOrEqual(1);
  expect(event.y).toBeGreaterThanOrEqual(0);
  expect(event.y).toBeLessThanOrEqual(1);

  expect([1, 2, 3]).toContain(event.severity);
  expect(["new", "ack", "resolved"]).toContain(event.incident_status);
}

describe("eventAdapter", () => {
  test("shape A: { meta, records[] }", () => {
    const payload = {
      meta: { request_id: "req-1", generated_at: "2026-02-10T05:09:52.119Z" },
      records: [
        {
          eventId: "evt_10001",
          detectedAt: "2026-02-10T05:09:50.014Z",
          receivedAt: "2026-02-10T05:09:50.493Z",
          eventType: "FALL",
          priority: "P1",
          score: 93.1,
          zoneId: "z_checkout_02",
          cameraId: "cam-cash-03",
          status: "ACKNOWLEDGED",
          location: { xNorm: 0.7421, yNorm: 0.4388 },
          provider: "vision-v2",
          note: "checkout lane slip risk",
        },
      ],
    };

    // normalizeEventFeed expects an array of event records (the wrapper parsing is handled in the UI layer).
    const events = normalizeEventFeed(payload.records, { maxEvents: 50 });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("fall");
    expect(events[0].severity).toBe(3);
    expect(events[0].incident_status).toBe("ack");
    expectNormalized(events[0]);
  });

  test("shape B: { type, payload.items[] }", () => {
    const payload = {
      type: "alert.batch",
      payload: {
        items: [
          {
            alarm_id: "alm-8f91",
            timestamp: 1739168718,
            ingested_at: 1739168718822,
            category: "crowd",
            level: "medium",
            confidence: 88.4,
            zone: { id: "z_entry_01" },
            position: { x: 63.2, y: 21.4, unit: "percent" },
            state: "IN_PROGRESS",
            camera: { id: "cam-front-01" },
            store: { id: "s001" },
            message: "entry congestion rising",
          },
        ],
      },
    };

    const events = normalizeEventFeed(payload.payload.items, { maxEvents: 50 });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("crowd");
    expect(events[0].severity).toBe(2);
    expect(events[0].incident_status).toBe("ack");
    expectNormalized(events[0]);
  });

  test("edge device: { data.objects[] + location.world/bbox }", () => {
    // The UI merges edge parent + object into a single record before adapting.
    const merged = {
      deviceId: "camera-edge-01",
      timestamp: "2026-02-12T12:05:00Z",
      eventType: "SAFETY",
      severity: "Critical",
      frame: { width: 1280, height: 720 },
      track_id: 101,
      label: "person",
      status: "fall_down",
      confidence: 0.95,
      location: {
        bbox: [655, 307, 819, 472],
        frame: { width: 1280, height: 720 },
        world: { x: 12.5, z: 8.2 },
        zone_id: "Store",
      },
      vlm_analysis: {
        summary: "A person collapsed suddenly in the aisle.",
        cause: "Faint",
        action: "Call_119",
      },
    };

    const events = normalizeEventFeed([merged], {
      maxEvents: 50,
      fallbackStoreId: "s001",
      defaultSource: "api",
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].severity).toBe(3);
    expectNormalized(events[0]);
  });

  test("adaptRawEvent returns null for empty input", () => {
    expect(adaptRawEvent(null)).toBe(null);
    expect(adaptRawEvent(undefined)).toBe(null);
    expect(adaptRawEvent({})).toBe(null);
  });

  test("parses unix-seconds timestamp strings", () => {
    const event = adaptRawEvent({
      eventId: "evt-seconds-1",
      timestamp: "1739168718",
      eventType: "crowd",
      position: { x: 0.4, y: 0.6 },
    });

    expect(event).not.toBeNull();
    expect(event?.detected_at).toBe(1739168718000);
  });

  test("drops invalid epoch timestamps outside sane range", () => {
    const tooOld = adaptRawEvent({
      eventId: "evt-old",
      timestamp: 123,
      eventType: "crowd",
      position: { x: 0.4, y: 0.6 },
    });

    const tooFuture = adaptRawEvent({
      eventId: "evt-future",
      timestamp: "3026-01-01T00:00:00Z",
      eventType: "crowd",
      position: { x: 0.4, y: 0.6 },
    });

    expect(tooOld).toBeNull();
    expect(tooFuture).toBeNull();
  });

  test("normalizeEventFeed deduplicates by id using latest detected_at", () => {
    const records = [
      {
        eventId: "evt-dup-1",
        timestamp: 1739168718,
        eventType: "crowd",
        position: { x: 0.5, y: 0.5 },
      },
      {
        eventId: "evt-dup-1",
        timestamp: 1739168728,
        eventType: "fall",
        position: { x: 0.52, y: 0.55 },
      },
      {
        eventId: "evt-uniq-1",
        timestamp: 1739168738,
        eventType: "fight",
        position: { x: 0.45, y: 0.61 },
      },
    ];

    const normalized = normalizeEventFeed(records, { maxEvents: 10 });
    expect(normalized).toHaveLength(2);
    expect(normalized.find((item) => item.id === "evt-dup-1")?.type).toBe("fall");
  });

  test("normalizeEventFeed sorts deterministically on timestamp ties", () => {
    const records = [
      {
        eventId: "evt-b",
        timestamp: 1739168718,
        ingested_at: 1739168719000,
        eventType: "crowd",
        position: { x: 0.5, y: 0.5 },
      },
      {
        eventId: "evt-a",
        timestamp: 1739168718,
        ingested_at: 1739168720000,
        eventType: "fall",
        position: { x: 0.52, y: 0.55 },
      },
      {
        eventId: "evt-c",
        timestamp: 1739168718,
        ingested_at: 1739168719000,
        eventType: "fight",
        position: { x: 0.45, y: 0.61 },
      },
    ];

    const normalized = normalizeEventFeed(records, { maxEvents: 10 });
    expect(normalized.map((item) => item.id)).toEqual(["evt-a", "evt-b", "evt-c"]);
  });

  test("keeps cashier-hole coordinates as-is for known zone", () => {
    const event = adaptRawEvent({
      eventId: "evt-cashier-hole-1",
      timestamp: "2026-02-18T10:00:00Z",
      eventType: "crowd",
      zoneId: "zone-s001-cashier",
      position: { x: 0.48, y: 0.61 }, // inside cashier right fixture hole
    });

    expect(event).not.toBeNull();
    const e = event as EventItem;
    expectNormalized(e);

    const cashierRightHole = { minX: 377 / 800, maxX: 400 / 800, minY: 238 / 427, maxY: 320 / 427 };
    const padded = pointInRectWithPadding(e.x, e.y, cashierRightHole, 0.024);
    expect(padded).toBe(true);
    expect(e.x).toBeCloseTo(0.48, 3);
    expect(e.y).toBeCloseTo(0.61, 3);
  });

  test("keeps hole coordinates as-is even when zone id is unknown", () => {
    const event = adaptRawEvent({
      eventId: "evt-unknown-zone-hole-1",
      timestamp: "2026-02-18T10:00:00Z",
      eventType: "fall",
      zoneId: "unknown-zone",
      position: { x: 0.48, y: 0.61 }, // same fixture footprint
    });

    expect(event).not.toBeNull();
    const e = event as EventItem;
    expectNormalized(e);

    const cashierRightHole = { minX: 377 / 800, maxX: 400 / 800, minY: 238 / 427, maxY: 320 / 427 };
    const padded = pointInRectWithPadding(e.x, e.y, cashierRightHole, 0.024);
    expect(padded).toBe(true);
    expect(e.x).toBeCloseTo(0.48, 3);
    expect(e.y).toBeCloseTo(0.61, 3);
  });
});
