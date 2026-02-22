import { describe, expect, test } from "vitest";

import { INITIAL_SIGNAL_CHECKS, mergeSignalChecks, parseSignalPayload } from "../src/lib/signalChecks";

describe("signalChecks", () => {
  test("parses CROWD envelope into crowd check state", () => {
    const payload = {
      deviceId: "camera-edge-01",
      timestamp: "2026-02-12T12:00:00Z",
      eventType: "CROWD",
      severity: "Info",
      data: {
        count: 5,
        zone_id: "Store_Main",
        congestion_level: "High",
      },
    };

    const parsed = parseSignalPayload(payload);

    expect(parsed.generatedEvents).toHaveLength(0);
    expect(parsed.labels).toContain("혼잡도");
    expect(parsed.patch.crowd).toMatchObject({
      deviceId: "camera-edge-01",
      zoneId: "Store_Main",
      count: 5,
      congestionLevel: "High",
      tone: "critical",
    });
  });

  test("parses SAFETY envelope and generates map event with world coordinates", () => {
    const payload = {
      deviceId: "camera-edge-01",
      timestamp: "2026-02-12T12:05:00Z",
      eventType: "SAFETY",
      severity: "Critical",
      data: {
        count: 1,
        objects: [
          {
            track_id: 101,
            label: "person",
            status: "fall_down",
            confidence: 0.95,
            location: {
              bbox: [655, 307, 819, 472],
              world: { x: 12.5, z: 8.2 },
              zone_id: "Store_Main",
            },
            vlm_analysis: {
              summary: "A person collapsed suddenly in the aisle.",
              cause: "Faint",
              action: "Call_119",
            },
          },
        ],
      },
    };

    const parsed = parseSignalPayload(payload);

    expect(parsed.labels).toContain("이상행동");
    expect(parsed.patch.safety).toMatchObject({
      deviceId: "camera-edge-01",
      zoneId: "Store_Main",
      count: 1,
      severity: "Critical",
      fallCount: 1,
      tone: "critical",
    });
    expect(parsed.generatedEvents).toHaveLength(1);

    const event = parsed.generatedEvents[0];
    expect(event.type).toBe("fall");
    expect(event.raw_status).toBe("fall_down");
    expect(event.world_x_m).toBeCloseTo(12.5, 4);
    expect(event.world_z_m).toBeCloseTo(8.2, 4);
    expect(event.x).toBeGreaterThanOrEqual(0);
    expect(event.x).toBeLessThanOrEqual(1);
    expect(event.y).toBeGreaterThanOrEqual(0);
    expect(event.y).toBeLessThanOrEqual(1);
  });

  test("parses CLEANING envelope into trash check and generated event", () => {
    const payload = {
      deviceId: "camera-edge-01",
      timestamp: "2026-02-12T12:10:00Z",
      eventType: "CLEANING",
      severity: "Warning",
      data: {
        count: 1,
        objects: [
          {
            track_id: 1,
            status: "trash",
            confidence: 0.88,
            location: {
              bbox: [100, 200, 150, 250],
              world: { x: 5.1, z: 3.4 },
              zone_id: "Store_Main",
            },
          },
        ],
      },
    };

    const parsed = parseSignalPayload(payload);

    expect(parsed.labels).toContain("쓰레기");
    expect(parsed.patch.trash).toMatchObject({
      deviceId: "camera-edge-01",
      zoneId: "Store_Main",
      count: 1,
      trashCount: 1,
      severity: "Warning",
      tone: "watch",
    });
    expect(parsed.generatedEvents).toHaveLength(1);
    expect(parsed.generatedEvents[0].id).toContain("cleaning");
    expect(parsed.generatedEvents[0].object_label).toBeUndefined();
  });

  test("mergeSignalChecks ignores older updates", () => {
    const prev = {
      ...INITIAL_SIGNAL_CHECKS,
      safety: {
        ...INITIAL_SIGNAL_CHECKS.safety,
        updatedAt: 2_000,
        summary: "newer",
      },
    };

    const merged = mergeSignalChecks(prev, {
      safety: {
        ...INITIAL_SIGNAL_CHECKS.safety,
        updatedAt: 1_000,
        summary: "older",
      },
    });

    expect(merged.safety.summary).toBe("newer");
    expect(merged.safety.updatedAt).toBe(2_000);
  });
});
