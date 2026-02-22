"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

const FORMSPREE_ENDPOINT = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT?.trim() ?? "";
const DISQUS_SHORTNAME = process.env.NEXT_PUBLIC_DISQUS_SHORTNAME?.trim() ?? "";
const DISQUS_IDENTIFIER = process.env.NEXT_PUBLIC_DISQUS_IDENTIFIER?.trim() || "twincity-about";
const GISCUS_REPO = process.env.NEXT_PUBLIC_GISCUS_REPO?.trim() ?? "";
const GISCUS_REPO_ID = process.env.NEXT_PUBLIC_GISCUS_REPO_ID?.trim() ?? "";
const GISCUS_CATEGORY = process.env.NEXT_PUBLIC_GISCUS_CATEGORY?.trim() ?? "";
const GISCUS_CATEGORY_ID = process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID?.trim() ?? "";

export default function EngagementHub() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [notice, setNotice] = useState("");
  const giscusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!DISQUS_SHORTNAME || typeof document === "undefined") {
      return;
    }
    if (document.getElementById("twincity-disqus-script")) {
      return;
    }

    const script = document.createElement("script");
    script.id = "twincity-disqus-script";
    script.src = `https://${DISQUS_SHORTNAME}.disqus.com/embed.js`;
    script.async = true;
    script.setAttribute("data-timestamp", String(Date.now()));
    script.setAttribute("data-identifier", DISQUS_IDENTIFIER);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (
      !giscusRef.current ||
      !GISCUS_REPO ||
      !GISCUS_REPO_ID ||
      !GISCUS_CATEGORY ||
      !GISCUS_CATEGORY_ID
    ) {
      return;
    }
    if (giscusRef.current.querySelector("script[data-giscus]")) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.setAttribute("data-giscus", "1");
    script.setAttribute("data-repo", GISCUS_REPO);
    script.setAttribute("data-repo-id", GISCUS_REPO_ID);
    script.setAttribute("data-category", GISCUS_CATEGORY);
    script.setAttribute("data-category-id", GISCUS_CATEGORY_ID);
    script.setAttribute("data-mapping", "pathname");
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", "light");
    script.setAttribute("data-lang", "ko");
    script.crossOrigin = "anonymous";
    giscusRef.current.appendChild(script);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!FORMSPREE_ENDPOINT) {
      setState("error");
      setNotice("NEXT_PUBLIC_FORMSPREE_ENDPOINT 설정 후 피드백 폼을 사용할 수 있습니다.");
      return;
    }

    setState("submitting");
    setNotice("");
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          source: "twincity-ui",
          page_url: window.location.href,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = String(payload?.errors?.[0]?.message || payload?.error || "요청 처리에 실패했습니다.");
        throw new Error(detail);
      }

      setState("success");
      setMessage("");
      setNotice("피드백이 전송되었습니다. 운영 개선 항목에 반영하겠습니다.");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "피드백 전송 중 오류가 발생했습니다.");
    }
  };

  return (
    <section className="engagementPanel reveal delay-3">
      <h2>피드백 & 커뮤니티</h2>
      <div className="engagementGrid">
        <article className="engagementCard">
          <p className="engagementLabel">Formspree</p>
          <h3>운영 개선 피드백</h3>
          <form className="feedbackForm" onSubmit={onSubmit}>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="이름"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일"
            />
            <textarea
              required
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="화면/운영 흐름에서 개선이 필요한 점을 적어주세요."
            />
            <button type="submit" disabled={state === "submitting"}>
              {state === "submitting" ? "전송 중..." : "피드백 전송"}
            </button>
          </form>
          {notice && (
            <p className={`feedbackNotice ${state === "error" ? "is-error" : "is-ok"}`}>{notice}</p>
          )}
        </article>

        <article className="engagementCard">
          <p className="engagementLabel">Disqus · Giscus</p>
          <h3>토론 스레드</h3>
          <div className="discussionBlock">
            <p className="discussionTitle">Disqus</p>
            {DISQUS_SHORTNAME ? (
              <div id="disqus_thread" className="discussionFrame" />
            ) : (
              <p className="discussionHint">NEXT_PUBLIC_DISQUS_SHORTNAME 설정 시 활성화됩니다.</p>
            )}
          </div>
          <div className="discussionBlock">
            <p className="discussionTitle">Giscus (Open Source)</p>
            {GISCUS_REPO && GISCUS_REPO_ID && GISCUS_CATEGORY && GISCUS_CATEGORY_ID ? (
              <div ref={giscusRef} className="discussionFrame" />
            ) : (
              <p className="discussionHint">NEXT_PUBLIC_GISCUS_* 설정 시 GitHub Discussions 연동됩니다.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
