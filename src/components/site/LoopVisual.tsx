"use client";

import Image from "next/image";
import { useState } from "react";
import { useTheme } from "@/components/site/theme";

type LoopVisualProps = {
  className?: string;
  caption?: string;
};

const LOOP_ASSET = {
  atelier: {
    primary: "/media/luxury-flow-atelier.webp",
    fallback: "/media/luxury-flow-atelier.gif",
    alt: "따뜻한 톤의 프리미엄 루프 모션",
    caption: "따뜻한 화면 흐름",
  },
  gallery: {
    primary: "/media/luxury-flow-gallery.webp",
    fallback: "/media/luxury-flow-gallery.gif",
    alt: "큐레이션된 시그널 흐름을 표현한 루프 모션",
    caption: "깔끔한 화면 흐름",
  },
  mono: {
    primary: "/media/luxury-flow-mono.webp",
    fallback: "/media/luxury-flow-mono.gif",
    alt: "정제된 흑백 계열의 정밀 루프 모션",
    caption: "집중형 화면 흐름",
  },
} as const;

export default function LoopVisual({
  className = "",
  caption,
}: LoopVisualProps) {
  const { theme } = useTheme();
  const asset = LOOP_ASSET[theme];
  const [fallbackTheme, setFallbackTheme] = useState<null | keyof typeof LOOP_ASSET>(null);
  const useFallback = fallbackTheme === theme;
  const src = useFallback ? asset.fallback : asset.primary;

  return (
    <figure className={`loopFrame ${className}`.trim()}>
      <div className="loopHalo" aria-hidden />
      <Image
        className="loopImage"
        src={src}
        alt={asset.alt}
        width={1440}
        height={840}
        loading="eager"
        unoptimized
        key={`${theme}-${useFallback ? "fallback" : "primary"}`}
        onError={() => {
          if (!useFallback) setFallbackTheme(theme);
        }}
      />
      {caption ? <figcaption className="loopCaption">{caption}</figcaption> : null}
    </figure>
  );
}
