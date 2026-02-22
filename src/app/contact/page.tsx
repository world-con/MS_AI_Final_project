import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "문의",
};

export default function ContactPage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">Contact</p>
        <h1 className="pageTitle">운영 문의</h1>
        <p className="pageLead">
          서비스 개선 제안, 장애 제보, 광고/파트너십 문의를 아래 채널로 받아 운영 백로그에 반영합니다.
        </p>
      </header>
      <section className="panel reveal delay-1">
        <h2 className="panelTitle">문의 채널</h2>
        <p>
          Primary: <a href="https://github.com/KIM3310/twincity-ui/issues">GitHub Issues</a>
        </p>
        <p>
          Business: <a href="https://github.com/KIM3310/twincity-ui/discussions">GitHub Discussions</a>
        </p>
      </section>
      <section className="panel reveal delay-2">
        <h2 className="panelTitle">응답 기준</h2>
        <p>운영 이슈 24시간 이내 1차 응답, 일반 문의 72시간 이내 응답</p>
      </section>
    </div>
  );
}
