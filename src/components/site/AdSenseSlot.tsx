"use client";

import { useEffect, useRef } from "react";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() ?? "";
const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT?.trim() ?? "";
const VALID_CLIENT = /^ca-pub-\d{16}$/.test(ADSENSE_CLIENT) && ADSENSE_CLIENT !== "ca-pub-0000000000000000";
const VALID_SLOT = /^\d{8,20}$/.test(ADSENSE_SLOT) && ADSENSE_SLOT !== "1234567890";
const ADS_READY = VALID_CLIENT && VALID_SLOT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSenseSlot() {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!ADS_READY || typeof document === "undefined") {
      return;
    }
    if (document.getElementById("twincity-adsbygoogle-script")) {
      return;
    }
    const script = document.createElement("script");
    script.id = "twincity-adsbygoogle-script";
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ADS_READY || pushedRef.current) {
      return;
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (_err) {
      // no-op
    }
  }, []);

  if (!ADS_READY) {
    return (
      <div className="adsenseFallback">
        Sponsored slot is in standby mode. Set valid `NEXT_PUBLIC_ADSENSE_CLIENT` and `NEXT_PUBLIC_ADSENSE_SLOT`.
      </div>
    );
  }

  return (
    <ins
      className="adsbygoogle adsenseFrame"
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={ADSENSE_SLOT}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
