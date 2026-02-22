"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react"; // 1. useState 추가

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_CONTAINER_ID ?? "GTM-MHK4C4D7";
const ANALYTICS_ENABLED =
  (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED ?? "true").toLowerCase() !==
  "false";
const REQUIRE_CONSENT =
  (
    process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT ?? "false"
  ).toLowerCase() === "true";

function isValidGaId(value: string): boolean {
  return /^G-[A-Z0-9]{6,}$/i.test(value) && !value.includes("X");
}

function isValidClarityId(value: string): boolean {
  return (
    /^[a-z0-9]{6,24}$/i.test(value) && !/clarity|xxxx|placeholder/i.test(value)
  );
}

function isValidGtmId(value: string): boolean {
  return /^GTM-[A-Z0-9]{6,}$/i.test(value);
}

function hasConsent(): boolean {
  if (!REQUIRE_CONSENT) return true;
  try {
    return window.localStorage.getItem("analytics_consent") === "granted";
  } catch {
    return false;
  }
}

function isDntEnabled(): boolean {
  if (typeof window === "undefined") return false; // 서버 환경 방어 코드
  return (
    navigator.doNotTrack === "1" ||
    (window as Window & { doNotTrack?: string }).doNotTrack === "1" ||
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

export default function AnalyticsScripts() {
  const pathname = usePathname();
  const useGtm = isValidGtmId(GTM_ID);

  // 2. 마운트 상태 관리 추가
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const canTrack = useMemo(() => {
    if (!isMounted) return false; // 3. 마운트 전에는 무조건 false 반환
    if (!ANALYTICS_ENABLED) return false;
    if (typeof window === "undefined") return false;
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    )
      return false;
    if (isDntEnabled() || !hasConsent()) return false;
    return true;
  }, [isMounted]); // 의존성 배열에 isMounted 추가

  useEffect(() => {
    if (!canTrack) return;

    const pagePath = window.location.pathname + window.location.search;
    if (useGtm) {
      const win = window as Window & {
        dataLayer?: Array<Record<string, unknown>>;
      };
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push({
        event: "virtual_page_view",
        page_path: pagePath,
        page_title: document.title,
      });
      return;
    }

    if (!isValidGaId(GA_ID)) return;

    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void })
      .gtag;
    if (typeof gtag === "function") {
      gtag("event", "page_view", {
        page_path: pagePath,
        page_title: document.title,
      });
    }
  }, [canTrack, pathname, useGtm]);

  // 4. 마운트 전이거나 트래킹 불가 시 렌더링 방지
  if (!isMounted || !canTrack) {
    return null;
  }

  return (
    <>
      {isValidGaId(GA_ID) && !useGtm && (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-config" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);} 
window.gtag = window.gtag || gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}', {
  anonymize_ip: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  send_page_view: false,
  transport_type: 'beacon',
  page_path: window.location.pathname + window.location.search
});`}
          </Script>
        </>
      )}

      {isValidGtmId(GTM_ID) && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  'gtm.start': new Date().getTime(),
  event: 'gtm.js',
  analytics_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});`}
          </Script>
          <Script
            id="gtm-loader"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`}
          />
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(GTM_ID)}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
            />
          </noscript>
        </>
      )}

      {!useGtm && isValidClarityId(CLARITY_ID) && (
        <Script id="clarity-config" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, 'clarity', 'script', '${CLARITY_ID}');`}
        </Script>
      )}
    </>
  );
}
