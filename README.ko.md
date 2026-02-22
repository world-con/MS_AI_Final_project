# TwinCity UI — 매장 Digital Twin 관제 화면 (WIP)

이 레포는 **평면도 이미지 위에 Zone(다각형) + Event(포인트)** 를 실시간으로 시각화하고,
운영자가 Live/History 흐름에서 이벤트를 빠르게 탐색·판단할 수 있도록 만든 Next.js(React/TypeScript) UI입니다.

현재는 **진행 중(WIP)** 이며, 실서버가 없어도 데모/검증이 가능하도록 **로컬 Mock 이벤트 + 더미 재생기**를 함께 제공합니다.

## 현재 포함 기능(핵심)
- 실시간 / 연습(Demo) 모드 전환 (WS -> SSE -> HTTP Polling 우선순위)
- 최근 시간(라이브 윈도우), 이벤트 유형/심각도, 미해결만 보기 등 필터
- 연습 데이터: 1건 주입, 위치(world) 샘플 주입, 지난 알림 채우기, 전체 초기화
- 2D/3D 지도 뷰 전환 + Zone/Hole 디버그 오버레이
- 처리 상세(ACK/직원 호출/처리 완료) + 타임라인 기록
- 새로고침 후 상태 복원(localStorage)
- 키보드 단축키([/], Esc)

## 실행(로컬)
```bash
npm i
npm run dev
```

- 브라우저에서 http://127.0.0.1:3000 (또는 `/events`)
- 상단 `데이터`에서 `연습`을 선택한 뒤, `샘플`에서 알림을 주입해 보세요.
- `진단 패널`을 켜면 필터/연결 상태를 더 자세히 볼 수 있어요.

> 기본 `npm run dev`는 `127.0.0.1`로만 바인딩합니다. 같은 네트워크에서 접속이 필요하면:
> ```bash
> npm run dev:lan
> ```

## Live API / WebSocket 연결
상황판(`/` 또는 `/events`)은 Demo 뿐 아니라 실시간 소스를 직접 받을 수 있습니다.

아래 환경변수 중 하나 이상을 `.env.local`에 설정하면 됩니다. 시작점으로 `.env.local.example`를 복사해 사용하세요.

```bash
# 1) WebSocket (우선순위 1)
NEXT_PUBLIC_EVENT_WS_URL=wss://example.com/events

# 2) Server-Sent Events (우선순위 2)
NEXT_PUBLIC_EVENT_STREAM_URL=https://example.com/events/stream

# 3) HTTP Polling (우선순위 3)
NEXT_PUBLIC_EVENT_API_URL=https://example.com/events
NEXT_PUBLIC_EVENT_POLL_MS=5000
```

연결 우선순위: `WS -> SSE -> HTTP Polling`

- UI 상단 `데이터`에서 `실시간 / 연습` 모드 전환
- Live 연결 실패 시 상태 라인에 재연결/오류 사유 표시
- 환경변수가 없으면 자동으로 Demo 모드

### 허용되는 페이로드 형태
- `[{...event}, {...event}]` 배열
- `{ events: [...] }`
- `{ data: [...] }`
- `{ event: {...} }`
- `{...event}` 단일 객체

이벤트 객체는 기존 `EventItem` 스키마와 호환되도록 `id`, `detected_at`, `zone_id`, `x`, `y`를 포함하는 형태를 권장합니다.

### 샘플 페이로드 (튜닝 반영)
아래 2개 형태를 기준으로 파서를 보강했습니다.

```json
{
  "meta": {
    "request_id": "a6c8f5dd-8a65-4d0e-a28a-c57ed01002f0",
    "generated_at": "2026-02-10T05:09:52.119Z",
    "shape": "a"
  },
  "records": [
    {
      "eventId": "evt_10293",
      "detectedAt": "2026-02-10T05:09:50.014Z",
      "receivedAt": "2026-02-10T05:09:50.493Z",
      "eventType": "FALL",
      "priority": "P1",
      "score": 93.1,
      "zoneId": "z_checkout_02",
      "cameraId": "cam-cash-03",
      "status": "ACKNOWLEDGED",
      "location": { "xNorm": 0.7421, "yNorm": 0.4388 },
      "provider": "vision-v2",
      "note": "checkout lane slip risk"
    }
  ]
}
```

아래처럼 `data.objects[] + location.world + vlm_analysis` 형태도 바로 받을 수 있습니다.

```json
{
  "deviceId": "camera-edge-01",
  "timestamp": "2026-02-12T12:05:00Z",
  "eventType": "SAFETY",
  "severity": "Critical",
  "data": {
    "count": 1,
    "objects": [
      {
        "track_id": 101,
        "label": "person",
        "status": "fall_down",
        "confidence": 0.95,
        "location": {
          "world": { "x": 12.5, "z": 8.2 },
          "zone_id": "Store"
        },
        "vlm_analysis": {
          "summary": "A person collapsed suddenly in the aisle.",
          "cause": "Faint",
          "action": "Call_119"
        }
      }
    ]
  }
}
```

`location.bbox`가 있으면 중심점 `(x1+x2)/2, (y1+y2)/2`를 2D 위치로 사용합니다.
- `frame.width/height`(또는 동등 필드)가 있으면 해당 해상도로 정규화
- 없으면 `zone_map_s001.json`의 `map.width/height`를 기준으로 정규화
- `location.world`가 함께 있으면 지도 점은 `bbox` 기준, `world_x_m/world_z_m`는 메타로 함께 저장

```json
{
  "type": "alert.batch",
  "payload": {
    "items": [
      {
        "alarm_id": "alm-8f91",
        "timestamp": 1739168718,
        "ingested_at": 1739168718822,
        "category": "crowd",
        "level": "medium",
        "confidence": 88.4,
        "zone": { "id": "z_entry_01" },
        "position": { "x": 63.2, "y": 21.4, "unit": "percent" },
        "state": "IN_PROGRESS",
        "camera": { "id": "cam-front-01" },
        "store": { "id": "s001" },
        "message": "entry congestion rising"
      }
    ]
  }
}
```

### 로컬 Mock 엔드포인트
실서버가 없어도 위 샘플 형태를 바로 재생할 수 있습니다.

- `GET /api/mock/events?shape=a&count=4`
- `GET /api/mock/events?shape=b&count=4`
- `GET /api/mock/events?shape=single`
- `GET /api/mock/events?shape=edge&count=4`

예시 `.env.local`:
```bash
NEXT_PUBLIC_EVENT_API_URL=http://localhost:3000/api/mock/events?shape=b&count=6
NEXT_PUBLIC_EVENT_POLL_MS=4000
```

## 데이터 교체(나중에)
- `src/data/zone_map_s001.json` : 평면도 기준 Zone 폴리곤
- `src/data/camera_calibration_s001.json` : 카메라별 4점 보정(호모그래피)
- 더미 이벤트 생성기: `src/lib/dummy.ts`
  - 나중에 API 연결 시 `generateDummyEvent()` 대신 API 호출로 대체하면 됩니다.

### 카메라별 `bbox -> floorplan` 보정
- `camera_calibration_s001.json`에서 카메라별로 다음 4개를 맞춰 넣습니다.
  - `camera_id`
  - `frame.width/height` (보정 기준 해상도)
  - `image_points` : 카메라 프레임의 4점(px)
  - `map_norm_points` : 평면도의 대응 4점(0..1)
- 이벤트에 `location.bbox`가 있으면 중심점을 계산하고, 카메라 보정값이 있으면 호모그래피로 평면도 좌표로 변환합니다.
- 보정값이 없고 `location.world`가 있으면 `world` 좌표를 우선 사용합니다.
- 보정값이 없고 `location.world`도 없으면 프레임 크기 정규화 fallback으로 동작합니다.

## 좌표계
- 현재는 `zone_map_s001.json`이 **참조 해상도(px)** 기반입니다.
- UI 렌더링은 내부적으로 이를 **0..1 정규화**로 변환해서, 어떤 화면 크기에서도 잘 그려지게 했습니다.
- 이벤트 포인트는 Zone 내부 샘플링으로 생성되어, Zone 외부로 점이 튀는 문제를 줄였습니다.

## 배포(메모)
- Azure Static Web Apps 또는 Azure Web App 중 선택 가능.
- MVP 단계에서는 Static Web Apps 권장.

---

## 🧰 Ops Artifacts (Portfolio)
- `RUNBOOK.md` (local demo runbook)
- `POSTMORTEM_TEMPLATE.md` (incident postmortem template)
- `.github/workflows/ci.yml` (CI: lint + build)
