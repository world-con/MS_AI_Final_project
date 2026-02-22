import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "컴플라이언스",
};

export default function CompliancePage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">Policy</p>
        <h1 className="pageTitle">Compliance & Quality</h1>
        <p className="pageLead">
          TwinCity UI는 현장 운영 업무를 중심으로 한 고유 콘텐츠와 공개 정책 페이지를 유지하며, 광고는 보조
          슬롯에서만 제한적으로 노출합니다.
        </p>
      </header>
      <section className="panel reveal delay-1">
        <h2 className="panelTitle">콘텐츠 품질 기준</h2>
        <p>실시간 이벤트 관제, SLA 대응 흐름, 인시던트 타임라인 등 운영 실무 콘텐츠 우선</p>
      </section>
      <section className="panel reveal delay-2">
        <h2 className="panelTitle">정책 투명성</h2>
        <p>Privacy / Terms / Contact 페이지를 상시 노출하고 변경 시 문서화합니다.</p>
      </section>
      <section className="panel reveal delay-3">
        <h2 className="panelTitle">광고 정책</h2>
        <p>광고는 기능 사용을 막지 않는 위치에서만 제공하며 콘텐츠와 구분 가능한 형태로 표시됩니다.</p>
      </section>
    </div>
  );
}
