import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
};

export default function TermsPage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">Policy</p>
        <h1 className="pageTitle">Terms of Service</h1>
        <p className="pageLead">
          본 서비스의 분석/권고 결과는 운영 지원 목적이며, 최종 운영 판단과 법적 책임은 사용자 조직에 있습니다.
        </p>
      </header>
      <section className="panel reveal delay-1">
        <h2 className="panelTitle">허용 사용</h2>
        <p>현장 운영 모니터링, 이벤트 분류, 대응 절차 문서화</p>
      </section>
      <section className="panel reveal delay-2">
        <h2 className="panelTitle">금지 사항</h2>
        <p>불법 콘텐츠, 계정 오남용, 서비스 안정성 훼손 행위</p>
      </section>
    </div>
  );
}
