"use client";

import { EVENT_TYPES } from "@/lib/dummy";
import type { EventTypeFilter } from "@/lib/types";
import { getEventTypeLabel } from "@/lib/labels";

export default function SettingsPanel({
  playing,
  onToggle,
  speed,
  onSpeed,
  liveWindowMin,
  onLiveWindowMin,
  maxEvents,
  onMaxEvents,
  typeFilter,
  onTypeFilter,
  minSeverity,
  onMinSeverity,
  onSeedHistory,
  onInjectOne,
  onClear,
  totalCount,
  liveCount,
  historyCount,
}: {
  playing: boolean;
  onToggle: () => void;
  speed: 1 | 2 | 4;
  onSpeed: (speed: 1 | 2 | 4) => void;
  liveWindowMin: number;
  onLiveWindowMin: (value: number) => void;
  maxEvents: number;
  onMaxEvents: (value: number) => void;
  typeFilter: EventTypeFilter;
  onTypeFilter: (value: EventTypeFilter) => void;
  minSeverity: 1 | 2 | 3;
  onMinSeverity: (value: 1 | 2 | 3) => void;
  onSeedHistory: () => void;
  onInjectOne: () => void;
  onClear: () => void;
  totalCount: number;
  liveCount: number;
  historyCount: number;
}) {
  const segment = (active: boolean) => "segBtn" + (active ? " active" : "");

  return (
    <div className="simRoot">
      <section className="simBlock">
        <div className="simLabel">알림 흐름</div>
        <div className="simActions">
          <button type="button" className={segment(playing)} onClick={onToggle}>
            {playing ? "새 알림 자동 생성 멈춤" : "새 알림 자동 생성 시작"}
          </button>
          <button type="button" className={segment(speed === 1)} onClick={() => onSpeed(1)}>보통</button>
          <button type="button" className={segment(speed === 2)} onClick={() => onSpeed(2)}>빠르게</button>
          <button type="button" className={segment(speed === 4)} onClick={() => onSpeed(4)}>매우 빠르게</button>
        </div>
      </section>

      <section className="simBlock">
        <div className="simLabel">지금으로 볼 시간 범위</div>
        <div className="simActions">
          {[15, 30, 60, 180].map((value) => (
            <button
              key={value}
              type="button"
              className={segment(liveWindowMin === value)}
              onClick={() => onLiveWindowMin(value)}
            >
              {value}분
            </button>
          ))}
        </div>
      </section>

      <section className="simBlock">
        <div className="simLabel">어떤 알림을 볼지</div>
        <div className="simActions">
          <button type="button" className={segment(typeFilter === "all")} onClick={() => onTypeFilter("all")}>전체</button>
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={segment(typeFilter === type)}
              onClick={() => onTypeFilter(type)}
            >
              {getEventTypeLabel(type)}
            </button>
          ))}
        </div>
        <div className="simActions">
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              className={segment(minSeverity === value)}
              onClick={() => onMinSeverity(value as 1 | 2 | 3)}
            >
              중요도 {value} 이상
            </button>
          ))}
        </div>
      </section>

      <section className="simBlock">
        <div className="simLabel">연습 데이터</div>
        <div className="simActions">
          {[100, 200, 400].map((value) => (
            <button
              key={value}
              type="button"
              className={segment(maxEvents === value)}
              onClick={() => onMaxEvents(value)}
            >
              최대 {value}개 보관
            </button>
          ))}
        </div>
        <div className="simActions">
          <button type="button" className="segBtn" onClick={onInjectOne}>알림 1개 추가</button>
          <button type="button" className="segBtn" onClick={onSeedHistory}>지난 알림 채우기</button>
          <button type="button" className="segBtn" onClick={onClear}>알림 모두 지우기</button>
        </div>
      </section>

      <section className="simBlock">
        <div className="simLabel">현재 숫자</div>
        <div className="statsGrid">
          <div className="statRow"><span>전체 알림</span><strong>{totalCount}</strong></div>
          <div className="statRow"><span>지금 알림</span><strong>{liveCount}</strong></div>
          <div className="statRow"><span>지난 알림</span><strong>{historyCount}</strong></div>
          <div className="statRow"><span>시간 범위</span><strong>{liveWindowMin}분</strong></div>
        </div>
      </section>

      <p className="helperNote">
        지금 설정은 브라우저에 저장됩니다. 나중에 실제 데이터로 바꿔도 같은 화면을 그대로 쓸 수 있어요.
      </p>
    </div>
  );
}
