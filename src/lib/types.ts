
export type Point = readonly [number, number];

export type Zone = {
  zone_id: string;
  zone_key?: string;
  name: string;
  polygon: number[][];     // pixel points from source
  centroid: number[];      // pixel [x, y]
  holes?: number[][][];    // optional polygon holes in pixel coordinates
};

export type ZoneMap = {
  store_id: string;
  map: {
    image_name: string;
    width: number;         // reference pixel width
    height: number;        // reference pixel height
    origin?: { x: number; y: number };
    axis?: { x_positive: string; y_positive: string };
    world?: {
      width_m: number;
      depth_m: number;
      offset_x_m?: number;
      offset_z_m?: number;
      x_positive?: string;
      z_positive?: string;
      note?: string;
    };
    units?: string;
    note?: string;
  };
  zones: Zone[];
  schema_notes?: string[];
};

export type EventType = "crowd" | "fall" | "fight" | "loitering" | "unknown";
export type EventTypeFilter = EventType | "all";
export type IncidentStatus = "new" | "ack" | "resolved";
export type EventSource = "demo" | "camera" | "api" | "unknown";
export type IncidentAction = "detected" | "ack" | "dispatch" | "resolved";

export type EventItem = {
  id: string;
  store_id: string;
  detected_at: number;     // epoch ms (when model detected)
  ingested_at: number;     // epoch ms (when platform received)
  latency_ms: number;      // ingested_at - detected_at
  type: EventType;
  severity: 1 | 2 | 3;
  confidence: number;      // 0..1
  zone_id: string;
  camera_id?: string;
  track_id?: string;
  object_label?: string;
  raw_status?: string;
  source: EventSource;
  model_version?: string;
  incident_status: IncidentStatus;
  x: number;               // normalized 0..1
  y: number;               // normalized 0..1
  world_x_m?: number;
  world_z_m?: number;
  note?: string;
};

export type IncidentTimelineEntry = {
  id: string;
  event_id: string;
  zone_id: string;
  action: IncidentAction;
  actor: string;
  at: number;
  from_status?: IncidentStatus;
  to_status?: IncidentStatus;
  note?: string;
};
