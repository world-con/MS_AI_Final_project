import type { Metadata } from "next";
import LoopVisual from "@/components/site/LoopVisual";
import AdSenseSlot from "@/components/site/AdSenseSlot";
import EngagementHub from "@/components/site/EngagementHub";
import { contactChannels, principles } from "@/lib/studioData";

export const metadata: Metadata = {
  title: "안내",
};

export default function AboutPage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">안내</p>
        <h1 className="pageTitle">TwinCity 매장 관제 소개</h1>
        <p className="pageLead">
          이 서비스는 매장 상황을 쉽게 보고 빠르게 대응할 수 있게 만든 운영 화면입니다.
          어려운 용어보다 현장에서 바로 쓰기 쉬운 표현과 구조를 우선했습니다.
        </p>
      </header>

      <section className="splitBlock reveal delay-1">
        <article className="panel">
          <h2 className="panelTitle">운영 원칙</h2>
          <div className="principleGrid">
            {principles.map((principle) => (
              <article key={principle.title} className="principleCard">
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </article>

        <LoopVisual className="compactLoop" caption="운영 흐름 미리보기" />
      </section>

      <section className="contactPanel reveal delay-2">
        <h2>문의</h2>
        <div className="contactGrid">
          {contactChannels.map((channel) => (
            <article key={channel.label} className="contactCard">
              <p>{channel.label}</p>
              <strong>{channel.value}</strong>
            </article>
          ))}
        </div>
        <p className="pageLead" style={{ marginTop: "0.85rem" }}>
          정책 페이지: <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
          <a href="/contact">Contact</a> · <a href="/compliance">Compliance</a>
        </p>
      </section>

      <EngagementHub />

      <section className="panel reveal delay-3">
        <h2 className="panelTitle">Sponsored</h2>
        <p className="pageLead">광고는 콘텐츠 흐름을 방해하지 않도록 제한적으로 노출합니다.</p>
        <AdSenseSlot />
      </section>
    </div>
  );
}
