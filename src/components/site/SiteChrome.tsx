"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useTheme } from "@/components/site/theme";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/explore", label: "매장 보기" },
  { href: "/events", label: "알림 관리" },
  { href: "/journal", label: "운영 메모" },
  { href: "/about", label: "안내" },
] as const;

const THEME_TONE = {
  atelier: "편안함",
  gallery: "깔끔함",
  mono: "집중형",
} as const;

export default function SiteChrome({ children }: { children: ReactNode }) {
  const { theme, setTheme, options, meta } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    body.classList.add("motion-ready");
    body.classList.remove("is-gated", "is-entering");
    return () => body.classList.remove("is-gated", "is-entering");
  }, []);

  useEffect(() => {
    const body = document.body;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));

    reveals.forEach((node) => node.classList.remove("in-view"));

    if (prefersReducedMotion) {
      reveals.forEach((node) => node.classList.add("in-view"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    reveals.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <div className="siteRoot">
      <header className="siteHeader">
        <div className="shell headerRow">
          <Link className="brand" href="/">
            <span className="brandDot" aria-hidden>
              {meta.brandGlyph}
            </span>
            <span className="brandTextWrap">
              <strong>TwinCity 매장 관제</strong>
              <small>{meta.headerLine}</small>
            </span>
          </Link>

          <div className="headerTools">
            <nav className="siteNav" aria-label="메인 메뉴">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="navLink">
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="themeSwitch" role="group" aria-label="테마 선택">
              {options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={"themeBtn" + (theme === item.id ? " active" : "")}
                  onClick={() => setTheme(item.id)}
                >
                  <span className="themeBtnPreview" data-variant={item.id} aria-hidden />
                  <span className="themeBtnText">
                    <span className="themeBtnLabel">
                      <span className="themeBtnIcon" aria-hidden>
                        {item.icon}
                      </span>
                      {item.label}
                    </span>
                    <span className="themeBtnTone">{THEME_TONE[item.id]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="siteMain">
        <div className="shell">{children}</div>
      </main>

      <footer className="siteFooter">
        <div className="shell footerRow">
          <p>
            {meta.icon} TwinCity 매장 관제
          </p>
          <p>{meta.footerLine}</p>
        </div>
      </footer>
    </div>
  );
}
