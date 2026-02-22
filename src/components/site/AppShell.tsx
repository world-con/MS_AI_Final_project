"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import BottomBadgeMenu from "@/components/site/BottomBadgeMenu";

function isBrandRoute(pathname: string) {
  return (
    pathname === "/brand" ||
    pathname === "/explore" ||
    pathname === "/journal" ||
    pathname === "/about"
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const brandRoute = isBrandRoute(pathname);

  useEffect(() => {
    const body = document.body;
    body.classList.add("motion-ready");
    body.classList.remove("is-gated", "is-entering");
    return () => body.classList.remove("is-gated", "is-entering");
  }, []);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsIntersectionObserver = typeof window.IntersectionObserver !== "undefined";

    const seen = new Set<HTMLElement>();
    let observer: IntersectionObserver | null = null;

    const revealAll = () => {
      seen.forEach((node) => node.classList.add("in-view"));
    };

    const register = (node: HTMLElement) => {
      if (seen.has(node)) return;
      node.classList.remove("in-view");
      seen.add(node);
      if (observer) observer.observe(node);
    };

    const scan = () => {
      const reveals = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
      reveals.forEach(register);
    };

    scan();

    if (prefersReducedMotion || !supportsIntersectionObserver) {
      revealAll();
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in-view");
          observer?.unobserve(entry.target);
        });
      },
      {
        root: null,
        threshold: 0.06,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    seen.forEach((node) => observer?.observe(node));

    const mutationObserver = new MutationObserver(() => {
      scan();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // If observer callbacks are skipped (rare hydration/race cases), keep content visible.
    const fallbackTimer = window.setTimeout(() => {
      revealAll();
    }, 1800);

    return () => {
      window.clearTimeout(fallbackTimer);
      mutationObserver.disconnect();
      observer?.disconnect();
    };
  }, [pathname]);

  if (brandRoute) {
    return (
      <div className="tcBrandRoot">
        <div className="shell tcBrandShell">{children}</div>
        <BottomBadgeMenu />
      </div>
    );
  }

  return (
    <div className="tcOpsRoot">
      <div className="tcOpsCanvas">{children}</div>
      <BottomBadgeMenu />
    </div>
  );
}
