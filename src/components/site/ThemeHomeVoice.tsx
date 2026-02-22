"use client";

import { useTheme } from "@/components/site/theme";

export default function ThemeHomeVoice() {
  const { meta } = useTheme();

  return (
    <section className="themeVoice reveal delay-3" aria-live="polite">
      <p className="kicker">{meta.icon} 화면 분위기: {meta.label}</p>
      <p className="themeVoiceLine">{meta.homeVoice}</p>
      <p className="themeVoiceQuote">&ldquo;{meta.homeQuote}&rdquo;</p>
    </section>
  );
}
