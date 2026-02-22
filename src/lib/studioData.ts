export type PulseMetric = {
  label: string;
  value: string;
  note: string;
};

export type StudioTrack = {
  href: string;
  title: string;
  description: string;
  footnote: string;
};

export type ZoneSnapshot = {
  zone: string;
  signal: string;
  texture: string;
  action: string;
  tone: "calm" | "watch" | "critical";
};

export type EventStream = {
  title: string;
  window: string;
  owner: string;
  note: string;
  tone: "calm" | "watch" | "critical";
};

export type JournalEntry = {
  title: string;
  category: string;
  excerpt: string;
  readTime: string;
};

export type Principle = {
  title: string;
  body: string;
};

export type ContactChannel = {
  label: string;
  value: string;
};

export type LuxuryMoment = {
  title: string;
  stage: string;
  description: string;
  alt: string;
  gifByTheme: {
    atelier: string;
    gallery: string;
    mono: string;
  };
};

export const pulseMetrics: PulseMetric[] = [
  {
    label: "실시간 확인 구역",
    value: "12",
    note: "조용한 구역 7 · 관찰 구역 4 · 즉시 확인 1",
  },
  {
    label: "평균 대응 시간",
    value: "3분 08초",
    note: "지난 30분 기준 평균 대응 시간",
  },
  {
    label: "유효 알림 비율",
    value: "92%",
    note: "중복 알림 제거 후 유효 신호 비율",
  },
];

export const studioTracks: StudioTrack[] = [
  {
    href: "/explore",
    title: "매장 보기",
    description: "매장을 구역별로 나눠 현재 상황을 쉽게 확인합니다.",
    footnote: "구역별 상황 + 다음 행동",
  },
  {
    href: "/events",
    title: "알림 관리",
    description: "알림 확인부터 처리 완료까지 한 흐름으로 관리합니다.",
    footnote: "중요도 + 담당 + 메모",
  },
  {
    href: "/journal",
    title: "운영 메모",
    description: "화면을 어떻게 개선했는지 짧게 기록합니다.",
    footnote: "개선 이유 + 결과 기록",
  },
  {
    href: "/about",
    title: "안내",
    description: "서비스 방향과 운영 원칙을 정리해 보여줍니다.",
    footnote: "운영 원칙 + 문의 정보",
  },
];

export const zoneSnapshots: ZoneSnapshot[] = [
  {
    zone: "북쪽 출입구",
    signal: "방문 집중",
    texture: "유입량이 올라가는 구간, 동선은 안정적",
    action: "표지 간격 유지",
    tone: "calm",
  },
  {
    zone: "중앙 통로",
    signal: "체류 증가",
    texture: "체험형 코너 앞 대기 밀도 상승",
    action: "도슨트 1명 추가",
    tone: "watch",
  },
  {
    zone: "결제 구역",
    signal: "지연 징후",
    texture: "결제 대기열이 파형처럼 반복",
    action: "우선 결제 레인 열기",
    tone: "critical",
  },
  {
    zone: "남쪽 코너",
    signal: "조용함",
    texture: "체류는 낮고 회전은 빠른 상태",
    action: "프로모션 스탠드 테스트",
    tone: "calm",
  },
];

export const eventStreams: EventStream[] = [
  {
    title: "결제 줄 길어짐",
    window: "14:04 - 14:12",
    owner: "담당자 2",
    note: "대기열 길이 기준치 +18%",
    tone: "critical",
  },
  {
    title: "체험 코너 동선 치우침",
    window: "13:48 - 13:55",
    owner: "담당자 4",
    note: "상담 동선이 우측으로 치우침",
    tone: "watch",
  },
  {
    title: "출입구 유입 급증",
    window: "13:31 - 13:38",
    owner: "담당자 1",
    note: "외부 유입 증가, 내부 분산 정상",
    tone: "calm",
  },
  {
    title: "복도 체류 급감",
    window: "13:12 - 13:20",
    owner: "담당자 3",
    note: "체류 밀도 급감, 진열 리듬 보정 필요",
    tone: "watch",
  },
  {
    title: "결제 재시도 증가",
    window: "12:58 - 13:05",
    owner: "담당자 2",
    note: "재시도 비율이 짧은 구간에서 급증",
    tone: "critical",
  },
];

export const journalEntries: JournalEntry[] = [
  {
    title: "UI를 비워서 상황을 더 선명하게 만드는 법",
    category: "화면 단순화",
    excerpt:
      "카드 개수를 줄인 대신 우선순위 대비를 키우면 운영자는 더 빠르게 판단한다.",
    readTime: "4분",
  },
  {
    title: "알림 목록을 피드가 아니라 장면으로 구성하기",
    category: "알림 정리",
    excerpt:
      "시간, 담당자, 메모를 한 줄에 엮으면 단순 로그가 아닌 작업 맥락으로 바뀐다.",
    readTime: "6분",
  },
  {
    title: "움직임은 장식이 아니라 주의 전환 장치다",
    category: "화면 움직임",
    excerpt:
      "반복 루프는 시선을 훔치지 않고, 리듬을 만들어 인터페이스 긴장을 낮춘다.",
    readTime: "5분",
  },
];

export const principles: Principle[] = [
  {
    title: "덜 보여주고, 더 빨리 파악하기",
    body: "한 화면에서 동시에 판단할 수 없는 요소는 다음 페이지로 보낸다.",
  },
  {
    title: "부담 없는 화면 톤",
    body: "차갑지 않은 중성 팔레트와 넉넉한 여백으로 운영 피로를 낮춘다.",
  },
  {
    title: "의미 있는 화면 움직임",
    body: "루프 모션은 상태 전환을 부드럽게 연결하는 용도로만 사용한다.",
  },
];

export const contactChannels: ContactChannel[] = [
  { label: "문의 채널", value: "GitHub Issues (KIM3310/twincity-ui)" },
  { label: "응대 시간", value: "평일 10:00 - 18:00" },
  { label: "운영 위치", value: "서울 + 원격" },
];

export const luxuryMoments: LuxuryMoment[] = [
  {
    title: "입구 흐름",
    stage: "출입구 구간",
    description: "유입 변화가 튀지 않게 벨벳처럼 정돈해 첫 인상을 고급스럽게 유지합니다.",
    alt: "입구 유입 리듬을 표현하는 추상 모션",
    gifByTheme: {
      atelier: "/media/luxury-flow-atelier.webp",
      gallery: "/media/luxury-flow-gallery.webp",
      mono: "/media/luxury-flow-mono.webp",
    },
  },
  {
    title: "신호 흐름",
    stage: "중앙 알림 구간",
    description: "핵심 이벤트만 큐레이션해 팀이 같은 장면과 우선순위를 공유하게 만듭니다.",
    alt: "격자 기반 이벤트 시그널이 맥동하는 모션",
    gifByTheme: {
      atelier: "/media/signal-grid-atelier.webp",
      gallery: "/media/signal-grid-gallery.webp",
      mono: "/media/signal-grid-mono.webp",
    },
  },
  {
    title: "응대 집중",
    stage: "응대 구간",
    description: "응대 흐름이 끊기지 않도록 집중도를 조용하게 유지하는 서비스 데크입니다.",
    alt: "컨시어지 데스크 분위기의 따뜻한 루프 모션",
    gifByTheme: {
      atelier: "/media/concierge-glow-atelier.webp",
      gallery: "/media/concierge-glow-gallery.webp",
      mono: "/media/concierge-glow-mono.webp",
    },
  },
];
