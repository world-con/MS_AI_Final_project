import type { Metadata } from "next";
import Link from "next/link";
import LoopVisual from "@/components/site/LoopVisual";
import LuxuryGifBand from "@/components/site/LuxuryGifBand";
import ThemeHomeVoice from "@/components/site/ThemeHomeVoice";
import { pulseMetrics, studioTracks } from "@/lib/studioData";

export const metadata: Metadata = {
  title: "서비스 소개",
};

export default function BrandPage() {
  return (
    <div className="pageStack">
      <section className="hero heroLuxury reveal">
        <div className="heroCopy">
          <p className="kicker">TwinCity 매장 관제</p>
          <h1 className="heroTitle">매장 상황을 누구나 쉽게 보는 화면</h1>
          <p className="heroLead">
            복잡한 용어를 줄이고, 필요한 정보만 크게 보여주도록 화면을 구성했습니다.
            점주님과 경비원분이 바로 보고 바로 대응할 수 있게 만든 운영 화면입니다.
          </p>

          <div className="ctaRow">
            <Link className="button" href="/">
              상황판 열기
            </Link>
            <Link className="button buttonGhost" href="/about">
              서비스 안내
            </Link>
          </div>
        </div>

        <LoopVisual className="heroLoop" />
      </section>

      <LuxuryGifBand />

      <section className="sectionBlock reveal delay-2">
        <div className="sectionHead">
          <p className="kicker">지금 상태</p>
          <h2>핵심 숫자 한눈에 보기</h2>
        </div>

        <div className="metricGrid">
          {pulseMetrics.map((metric) => (
            <article key={metric.label} className="metricCard">
              <p className="metricLabel">{metric.label}</p>
              <p className="metricValue">{metric.value}</p>
              <p className="metricNote">{metric.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sectionBlock reveal delay-3">
        <div className="sectionHead">
          <p className="kicker">화면 바로가기</p>
          <h2>필요한 화면으로 빠르게 이동</h2>
        </div>

        <div className="trackGrid">
          {studioTracks.map((track) => (
            <Link key={track.href} href={track.href} className="trackCard">
              <h3>{track.title}</h3>
              <p>{track.description}</p>
              <span>{track.footnote}</span>
            </Link>
          ))}
        </div>
      </section>

      <ThemeHomeVoice />

      <section className="quoteStrip reveal delay-3">
        <p>
          &ldquo;쉽게 보이면, 빠르게 움직일 수 있습니다.&rdquo;
        </p>
      </section>
    </div>
  );
}

