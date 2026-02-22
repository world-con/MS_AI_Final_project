import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="pageStack">
      <header className="pageHeading reveal">
        <p className="kicker">Policy</p>
        <h1 className="pageTitle">Privacy Policy</h1>
        <p className="pageLead">
          TwinCity UI는 운영 관제 기능 제공에 필요한 최소 데이터만 저장하며, 요청/응답 이벤트는 서비스 품질
          개선과 장애 대응 목적으로만 사용합니다.
        </p>
      </header>
      <section className="panel reveal delay-1">
        <h2 className="panelTitle">수집 항목</h2>
        <p>이벤트 로그, 운영자 액션 기록, 진단 목적의 최소 브라우저/세션 정보</p>
      </section>
      <section className="panel reveal delay-2">
        <h2 className="panelTitle">제3자 서비스</h2>
        <p>Formspree/Disqus/Giscus/AdSense는 설정 시에만 활성화되며 각 제공자 정책이 적용됩니다.</p>
      </section>
    </div>
  );
}
