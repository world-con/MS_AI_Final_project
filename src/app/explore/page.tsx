import type { Metadata } from "next";
import LoopVisual from "@/components/site/LoopVisual";
import { zoneSnapshots } from "@/lib/studioData";

export const metadata: Metadata = {
  title: "매장 보기",
};

export default function ExplorePage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">매장 보기</p>
        <h1 className="pageTitle">매장 상황을 구역별로 쉽게 확인</h1>
        <p className="pageLead">
          복잡한 지도 대신 지금 확인이 필요한 구역만 보이게 정리했습니다.
          구역별 상황과 다음 행동을 카드로 나눠 빠르게 볼 수 있습니다.
        </p>
      </header>

      <section className="splitBlock reveal delay-1">
        <article className="panel">
          <h2 className="panelTitle">화면 구성 원칙</h2>
          <ul className="textList">
            <li>기본 화면은 차분하게 유지</li>
            <li>주의가 필요한 정보만 눈에 띄게 표시</li>
            <li>바로 해야 할 행동은 카드 아래에 고정</li>
          </ul>
        </article>

        <LoopVisual className="compactLoop" caption="현재 매장 흐름" />
      </section>

      <section className="zoneGrid reveal delay-2">
        {zoneSnapshots.map((zone) => (
          <article key={zone.zone} className="zoneCard">
            <div className="zoneHeader">
              <h3>{zone.zone}</h3>
              <span className="chip" data-tone={zone.tone}>
                {zone.signal}
              </span>
            </div>
            <p>{zone.texture}</p>
            <strong>{zone.action}</strong>
          </article>
        ))}
      </section>
    </div>
  );
}
