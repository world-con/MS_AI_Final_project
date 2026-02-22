"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { useTheme } from "@/components/site/theme";

const BRAND_LINKS = [
  {
    href: "/brand",
    label: "서비스 소개",
    note: "한 번에 보는 서비스 가치",
  },
  {
    href: "/explore",
    label: "매장 보기",
    note: "구역별 관찰 화면",
  },
  {
    href: "/reports",
    label: "리포트",
    note: "SLA와 운영 통계",
  },
  {
    href: "/journal",
    label: "운영 메모",
    note: "개선 기록 모음",
  },
  {
    href: "/about",
    label: "안내",
    note: "원칙과 문의 정보",
  },
] as const;

export default function BottomBadgeMenu() {
  const pathname = usePathname();
  const { meta } = useTheme();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const onHome = pathname === "/";

  return (
    <div className={"tcBadgeDock" + (open ? " open" : "")}>
      <div className="tcBadgeRail" aria-hidden={!open}>
        {BRAND_LINKS.map((item, idx) => (
          <Link
            key={item.href}
            href={item.href}
            className={"tcBadgeItem" + (pathname === item.href ? " active" : "")}
            style={{ "--order": String(idx + 1) } as CSSProperties}
            onClick={close}
          >
            <strong>{item.label}</strong>
            <span>{item.note}</span>
          </Link>
        ))}

        <Link
          href="/"
          className={"tcBadgeItem tcBadgeItemService" + (onHome ? " active" : "")}
          style={{ "--order": String(BRAND_LINKS.length + 1) } as CSSProperties}
          onClick={close}
        >
          <strong>상황판</strong>
          <span>실시간 운영 화면</span>
        </Link>
      </div>

      <button
        type="button"
        className={"tcBadgeTrigger" + (open ? " open" : "")}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="브랜드 페이지 메뉴 열기"
      >
        <span className="tcBadgeMark" aria-hidden>
          {meta.brandGlyph}
        </span>
        <span className="tcBadgeLabel">TwinCity</span>
      </button>
    </div>
  );
}
