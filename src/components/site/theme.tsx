"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "atelier" | "gallery" | "mono";

export type ThemeMeta = {
  id: Theme;
  label: string;
  icon: string;
  brandGlyph: string;
  headerLine: string;
  footerLine: string;
  homeVoice: string;
  homeQuote: string;
  opsKicker: string;
  opsTitle: string;
  opsLead: string;
  modeLiveLabel: string;
  modeDemoLabel: string;
};

export const THEME_KEY = "twincity-ui-theme-v1";

const THEME_META: Record<Theme, ThemeMeta> = {
  atelier: {
    id: "atelier",
    label: "따뜻함",
    icon: "✶",
    brandGlyph: "✶",
    headerLine: "부드럽고 보기 편한 화면",
    footerLine: "쉽고 또렷한 매장 관제",
    homeVoice: "한눈에 상황을 파악하고, 바로 대응할 수 있게 만든 화면입니다.",
    homeQuote: "쉽게 보이면, 빠르게 움직일 수 있습니다.",
    opsKicker: "",
    opsTitle: "Vision Pro",
    opsLead: "지도, 알림, 처리 기록을 한 흐름으로 보여줘서 누구나 빠르게 판단할 수 있습니다.",
    modeLiveLabel: "실시간",
    modeDemoLabel: "연습",
  },
  gallery: {
    id: "gallery",
    label: "깔끔함",
    icon: "◍",
    brandGlyph: "◍",
    headerLine: "깔끔하고 정돈된 화면",
    footerLine: "핵심 알림만 또렷하게",
    homeVoice: "필요한 정보만 남겨서 처음 보는 사람도 빠르게 이해할 수 있습니다.",
    homeQuote: "정리된 화면은 실수를 줄여줍니다.",
    opsKicker: "깔끔한 화면 · 실시간 보기",
    opsTitle: "중요한 알림부터 보이게 정리한 화면",
    opsLead: "지금 바로 확인해야 할 일부터 보여줘서 대응 우선순위를 잡기 쉽습니다.",
    modeLiveLabel: "실시간",
    modeDemoLabel: "연습",
  },
  mono: {
    id: "mono",
    label: "집중형",
    icon: "▣",
    brandGlyph: "▣",
    headerLine: "대비가 높은 집중형 인터페이스",
    footerLine: "중요 정보 집중 보기",
    homeVoice: "강한 대비로 중요한 알림을 놓치지 않게 도와주는 화면입니다.",
    homeQuote: "중요한 건 더 선명하게 보여야 합니다.",
    opsKicker: "",
    opsTitle: "",
    opsLead: "상태 변화와 처리 결과를 또렷하게 구분해서 빠른 현장 대응을 돕습니다.",
    modeLiveLabel: "실시간",
    modeDemoLabel: "연습",
  },
};

const THEME_ORDER: Theme[] = ["atelier", "gallery", "mono"];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  options: ThemeMeta[];
  meta: ThemeMeta;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(value: string | null): Theme {
  if (value === "atelier" || value === "gallery" || value === "mono") return value;
  return "atelier";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Keep the first client render consistent with SSR to avoid hydration mismatch.
  const [theme, setTheme] = useState<Theme>("atelier");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = resolveTheme(window.localStorage.getItem(THEME_KEY));
    document.documentElement.setAttribute("data-theme", stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [hydrated, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      options: THEME_ORDER.map((id) => THEME_META[id]),
      meta: THEME_META[theme],
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
