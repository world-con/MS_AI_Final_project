
import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/site/AppShell";
import { ThemeProvider } from "@/components/site/theme";
import AnalyticsScripts from "@/components/site/AnalyticsScripts";
import "../styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://twincity-ui.pages.dev"),
  title: {
    default: "TwinCity 매장 관제",
    template: "%s | TwinCity 매장 관제",
  },
  description: "매장 상황을 쉽게 보고 빠르게 대응할 수 있는 TwinCity 운영 화면",
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "google-adsense-account": "ca-pub-0000000000000000",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="atelier">
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <AnalyticsScripts />
        </ThemeProvider>
      </body>
    </html>
  );
}
