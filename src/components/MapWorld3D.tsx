"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import zoneMap from "@/data/zone_map_s001.json";
import { mapNormToScene } from "@/lib/coordinateTransform";
import { clamp01, isLive } from "@/lib/geo";
import type { EventItem, ZoneMap } from "@/lib/types";

type Props = {
  events: EventItem[];
  robots?: RobotPose[];
  selectedId?: string;
  onSelect: (id?: string) => void;
  liveWindowMs: number;
  mapImageSrc: string;
  modelSrc?: string;
  worldWidthM: number;
  worldDepthM: number;
  resourceSource?: "downloads" | "fallback";
  modelSource?: "downloads" | "fallback" | "missing";
};

type RobotPose = {
  id: string;
  x: number;
  y: number;
  headingRad: number;
  mode: "patrol" | "responding";
};

type MarkerMeta = {
  id: string;
  pulseSeed: number;
  alert: boolean;
  baseHeight: number;
};

type ModelLoadState = "idle" | "loading" | "loaded" | "error";

type ModelExtent = {
  width: number;
  depth: number;
};

const STORE_MAP = zoneMap as ZoneMap;
const DEFAULT_WORLD_WIDTH_M = Number.isFinite(Number(STORE_MAP.map.world?.width_m))
  ? Math.max(0.001, Number(STORE_MAP.map.world?.width_m))
  : 9.0;
const DEFAULT_WORLD_DEPTH_M = Number.isFinite(Number(STORE_MAP.map.world?.depth_m))
  ? Math.max(0.001, Number(STORE_MAP.map.world?.depth_m))
  : 4.8;

const MARKER_RADIUS_M = 0.12;

function toStatusColor(event: EventItem, live: boolean) {
  // 엣지 마커: 쓰레기=노란색, 이상행동=빨간색
  if (event.edge_category === "safety") return 0xff4d4f;
  if (event.edge_category === "cleaning") return 0xffc857;
  const raw = event.raw_status?.toLowerCase();
  if (raw === "fall_down" || event.type === "fall" || event.severity === 3) return 0xff4d4f;
  if (!live) return 0x6d82a0;
  if (event.severity === 2) return 0xffc857;
  return 0x59b0ff;
}

function markerBaseHeightM() {
  return 0.14;
}

function pickFloorMesh(root: THREE.Object3D) {
  let namedCandidate: THREE.Mesh | null = null;
  let namedFootprint = -1;
  let flatCandidate: THREE.Mesh | null = null;
  let flatFootprint = -1;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    box.setFromObject(child);
    box.getSize(size);
    if (size.x <= 0.001 || size.z <= 0.001) return;

    const footprint = size.x * size.z;
    const name = child.name.toLowerCase();
    if ((name.includes("floor") || name.includes("plane") || name.includes("평면")) && footprint > namedFootprint) {
      namedCandidate = child;
      namedFootprint = footprint;
    }

    if (size.y <= 0.26 && footprint > flatFootprint) {
      flatCandidate = child;
      flatFootprint = footprint;
    }
  });

  return namedCandidate ?? flatCandidate;
}

function resolveScenePoint(event: EventItem, worldWidthM: number, worldDepthM: number, modelExtent: ModelExtent | null) {
  const width = modelExtent?.width ?? worldWidthM;
  const depth = modelExtent?.depth ?? worldDepthM;
  return mapNormToScene(clamp01(event.x), clamp01(event.y), width, depth);
}

function disposeMaterial(material: THREE.Material) {
  const m = material as unknown as Record<string, unknown>;
  const maybeTextures = [
    "map",
    "emissiveMap",
    "metalnessMap",
    "roughnessMap",
    "normalMap",
    "aoMap",
    "alphaMap",
    "envMap",
    "lightMap",
    "bumpMap",
  ];
  for (const key of maybeTextures) {
    const tex = m[key] as { dispose?: () => void } | undefined;
    if (tex?.dispose) tex.dispose();
  }
  material.dispose();
}

function disposeObject3D(root: THREE.Object3D) {
  const disposed = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        if (disposed.has(m)) return;
        disposed.add(m);
        disposeMaterial(m);
      });
    } else if (mat) {
      if (disposed.has(mat)) return;
      disposed.add(mat);
      disposeMaterial(mat);
    }
  });
}

export default function MapWorld3D({
  events,
  selectedId,
  onSelect,
  liveWindowMs,
  mapImageSrc,
  modelSrc,
  worldWidthM,
  worldDepthM,
  resourceSource,
  modelSource,
}: Props) {
  const safeWorldWidthM = Number.isFinite(worldWidthM) && worldWidthM > 0 ? worldWidthM : DEFAULT_WORLD_WIDTH_M;
  const safeWorldDepthM = Number.isFinite(worldDepthM) && worldDepthM > 0 ? worldDepthM : DEFAULT_WORLD_DEPTH_M;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const markersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const focusedSelectionRef = useRef<string | null>(null);
  const modelExtentRef = useRef<ModelExtent | null>(null);

  const [modelState, setModelState] = useState<ModelLoadState>(() => (modelSrc ? "loading" : "idle"));
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelRevision, setModelRevision] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    modelExtentRef.current = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e141d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 240);
    const maxSpan = Math.max(safeWorldWidthM, safeWorldDepthM);
    camera.position.set(0, Math.max(2.2, maxSpan * 1.1), Math.max(2.4, maxSpan * 0.95));
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(2.0, maxSpan * 0.26);
    controls.maxDistance = Math.max(14.0, maxSpan * 4.0);
    controls.minPolarAngle = Math.PI / 7;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.update();
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const key = new THREE.DirectionalLight(0xfff2d6, 0.82);
    key.position.set(safeWorldWidthM * 0.16, safeWorldDepthM * 1.4, safeWorldDepthM * 0.28);
    const fill = new THREE.DirectionalLight(0x7ea6ff, 0.34);
    fill.position.set(-safeWorldWidthM * 0.2, safeWorldDepthM * 0.9, -safeWorldDepthM * 0.14);
    scene.add(ambient, key, fill);

    const texture = new THREE.TextureLoader().load(mapImageSrc);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const floorGeometry = new THREE.PlaneGeometry(safeWorldWidthM, safeWorldDepthM, 1, 1);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.04,
      transparent: true,
      opacity: 1,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    scene.add(floor);

    const markerGroup = new THREE.Group();
    markerGroupRef.current = markerGroup;
    scene.add(markerGroup);
    const markerMap = markersRef.current;

    let modelRoot: THREE.Object3D | null = null;
    let modelCancelled = false;

    if (modelSrc) {
      const loader = new GLTFLoader();
      loader.load(
        modelSrc,
        (gltf) => {
          if (modelCancelled) {
            disposeObject3D(gltf.scene);
            return;
          }

          try {
            modelRoot = gltf.scene;
            modelRoot.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) return;
              child.receiveShadow = true;
            });

            const anchorObject = pickFloorMesh(modelRoot) ?? modelRoot;
            const anchorBox = new THREE.Box3().setFromObject(anchorObject);
            const anchorCenter = new THREE.Vector3();
            anchorBox.getCenter(anchorCenter);

            modelRoot.position.x -= anchorCenter.x;
            modelRoot.position.z -= anchorCenter.z;
            modelRoot.position.y -= anchorBox.min.y;

            const extentObject = pickFloorMesh(modelRoot) ?? modelRoot;
            const alignedBox = new THREE.Box3().setFromObject(extentObject);
            const alignedSize = new THREE.Vector3();
            alignedBox.getSize(alignedSize);
            modelExtentRef.current = {
              width: Math.max(0.001, alignedSize.x),
              depth: Math.max(0.001, alignedSize.z),
            };

            scene.add(modelRoot);
            floor.visible = false;
            setModelState("loaded");
            setModelRevision((value) => value + 1);
          } catch (err) {
            setModelState("error");
            setModelError(err instanceof Error ? err.message : String(err));
          }
        },
        undefined,
        (err) => {
          if (modelCancelled) return;
          setModelState("error");
          setModelError(err instanceof Error ? err.message : String(err));
        }
      );
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let downAt: { x: number; y: number } | null = null;
    let moved = false;

    const onPointerDown = (evt: PointerEvent) => {
      if (evt.button !== 0) return;
      downAt = { x: evt.clientX, y: evt.clientY };
      moved = false;
    };

    const onPointerMove = (evt: PointerEvent) => {
      if (!downAt || moved) return;
      const dx = evt.clientX - downAt.x;
      const dy = evt.clientY - downAt.y;
      if (dx * dx + dy * dy > 36) moved = true;
    };

    const onPointerUp = (evt: PointerEvent) => {
      if (evt.button !== 0) return;
      if (!downAt || moved) {
        downAt = null;
        return;
      }
      downAt = null;

      const target = renderer.domElement;
      const rect = target.getBoundingClientRect();
      pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const meshes = Array.from(markersRef.current.values());
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) {
        onSelect(undefined);
        return;
      }
      const id = hits[0].object.userData?.id;
      onSelect(typeof id === "string" ? id : undefined);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let frameId = 0;
    const animate = (t: number) => {
      frameId = window.requestAnimationFrame(animate);
      controls.update();

      markerMap.forEach((mesh) => {
        const meta = mesh.userData as MarkerMeta;
        const pulse = Math.sin(t * 0.0038 + meta.pulseSeed);
        mesh.position.y = meta.baseHeight + pulse * 0.01;
        if (meta.alert) {
          const scale = 1 + Math.max(0, pulse) * 0.14;
          if (mesh.scale.x < 1.3) mesh.scale.setScalar(scale);
        }
      });

      renderer.render(scene, camera);
    };
    frameId = window.requestAnimationFrame(animate);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      window.cancelAnimationFrame(frameId);

      modelCancelled = true;
      if (modelRoot) {
        scene.remove(modelRoot);
        disposeObject3D(modelRoot);
      }

      controls.dispose();

      markerMap.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshStandardMaterial).dispose();
      });
      markerMap.clear();
      markerGroup.clear();

      floorGeometry.dispose();
      floorMaterial.dispose();
      texture.dispose();

      scene.clear();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);

      controlsRef.current = null;
      focusedSelectionRef.current = null;
      modelExtentRef.current = null;
    };
  }, [mapImageSrc, modelSrc, onSelect, safeWorldDepthM, safeWorldWidthM]);

  useEffect(() => {
    const markerGroup = markerGroupRef.current;
    if (!markerGroup) return;

    const markerMap = markersRef.current;
    const activeIds = new Set(events.map((event) => event.id));

    events.forEach((event) => {
      const live = isLive(event.detected_at, liveWindowMs);
      const colorHex = toStatusColor(event, live);
      const isAlert = event.raw_status?.toLowerCase() === "fall_down" || event.type === "fall";
      const baseHeight = markerBaseHeightM();

      let mesh = markerMap.get(event.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(MARKER_RADIUS_M, 24, 18),
          new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.24,
            metalness: 0.14,
            emissive: 0x0,
          })
        );
        mesh.userData = {
          id: event.id,
          pulseSeed: Math.random() * Math.PI * 2,
          alert: isAlert,
          baseHeight,
        } satisfies MarkerMeta;
        markerGroup.add(mesh);
        markerMap.set(event.id, mesh);
      }

      const markerMaterial = mesh.material as THREE.MeshStandardMaterial;
      markerMaterial.color.setHex(colorHex);
      markerMaterial.emissive.setHex(isAlert ? 0x620000 : 0x0f2038);
      markerMaterial.emissiveIntensity = event.id === selectedId ? 0.45 : isAlert ? 0.33 : 0.14;

      const point = resolveScenePoint(event, safeWorldWidthM, safeWorldDepthM, modelExtentRef.current);
      mesh.position.x = point.x;
      mesh.position.z = point.z;
      mesh.scale.setScalar(event.id === selectedId ? 1.36 : 1);

      const meta = mesh.userData as MarkerMeta;
      meta.alert = isAlert;
      meta.baseHeight = baseHeight;
    });

    markerMap.forEach((mesh, id) => {
      if (activeIds.has(id)) return;
      markerGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshStandardMaterial).dispose();
      markerMap.delete(id);
    });
  }, [events, liveWindowMs, modelRevision, safeWorldDepthM, safeWorldWidthM, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      focusedSelectionRef.current = null;
      return;
    }
    if (focusedSelectionRef.current === selectedId) return;

    const selectedEvent = events.find((event) => event.id === selectedId);
    if (!selectedEvent) return;

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const point = resolveScenePoint(selectedEvent, safeWorldWidthM, safeWorldDepthM, modelExtentRef.current);
    const target = new THREE.Vector3(point.x, 0, point.z);

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) {
      const maxSpan = Math.max(safeWorldWidthM, safeWorldDepthM);
      offset.set(0, maxSpan * 0.95, maxSpan * 0.66);
    }

    const nextPosition = target.clone().add(offset);
    const minCameraY = Math.max(1.1, Math.max(safeWorldWidthM, safeWorldDepthM) * 0.22);
    nextPosition.y = Math.max(nextPosition.y, minCameraY);

    controls.target.copy(target);
    camera.position.copy(nextPosition);
    controls.update();
    focusedSelectionRef.current = selectedId;
  }, [events, modelRevision, safeWorldDepthM, safeWorldWidthM, selectedId]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 10,
          pointerEvents: "none",
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: 999,
          padding: "0.2rem 0.52rem",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "rgba(232,240,255,0.92)",
          background: "rgba(8, 14, 26, 0.56)",
          textTransform: "uppercase",
          display: "grid",
          gap: 2,
        }}
      >
        {/* 입체 지도 보기
        <span className="mono" style={{ opacity: 0.78, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
          marker source: normalized(x,y) unified
        </span>
        {mapImageSrc.startsWith("/api/3d-test/") ? (
          <>
            <span style={{ opacity: 0.8, textTransform: "none" }}>리소스: 3D model-first</span>
            <span className="mono" style={{ opacity: 0.76, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
              floorplan: {resourceSource ?? "?"} · model: {modelSource ?? "?"}
            </span>
            <span className="mono" style={{ opacity: 0.74, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
              model load: {modelState}
              {modelState === "error" && modelError ? ` (${modelError})` : ""}
            </span>
          </>
        ) : null} */}
      </div>
    </div>
  );
}
