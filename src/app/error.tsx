"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface unexpected runtime issues during development/debug sessions.
    console.error(error);
  }, [error]);

  const message = typeof error?.message === "string" ? error.message : "알 수 없는 오류";
  const digest = typeof error?.digest === "string" ? error.digest : undefined;

  return (
    <div className="pageStack">
      <section className="panel reveal in-view" style={{ padding: "1.2rem" }}>
        <p className="kicker">오류</p>
        <h1 className="pageTitle">화면을 불러오는 중 문제가 발생했어요</h1>
        <p className="pageLead">
          새로고침이나 다시 시도로 대부분 해결됩니다. 계속 반복되면 아래 오류 정보를 함께 알려주세요.
        </p>

        <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
          <div className="mono" style={{ fontSize: 12, opacity: 0.85 }}>
            {digest ? `digest: ${digest}` : "digest: -"}
          </div>
          <div className="mono" style={{ fontSize: 12, opacity: 0.85 }}>
            message: {message}
          </div>
        </div>

        <div className="ctaRow" style={{ marginTop: "1.1rem" }}>
          <button type="button" className="button" onClick={() => reset()}>
            다시 시도
          </button>
          <Link className="button buttonGhost" href="/">
            상황판으로
          </Link>
        </div>
      </section>
    </div>
  );
}
