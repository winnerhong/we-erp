"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MENU_GROUPS, MENU_BY_HREF, type MenuItem } from "@/lib/menus";

const ADMIN_ITEMS: MenuItem[] = [
  { href: "/admin/users", label: "사용자 관리", icon: "🔑" },
  { href: "/admin/permissions", label: "권한 관리", icon: "🛡️" },
];

/** 상단 그룹 네비 — 좌측 사이드바 대체. 그룹별 드롭다운. */
export function TopNav({ allowedHrefs, isAdmin }: { allowedHrefs: string[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const allow = new Set(allowedHrefs);

  // 바깥 클릭 시 닫기 (링크 클릭 시엔 onClick 에서 닫음)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  const groups = MENU_GROUPS.map((g) => {
    const items = g.hrefs.filter((h) => allow.has(h)).map((h) => MENU_BY_HREF[h]).filter(Boolean);
    const admin = g.label === "설정" && isAdmin ? ADMIN_ITEMS : [];
    return { ...g, items, admin };
  }).filter((g) => g.items.length + g.admin.length > 0);

  const dashOn = pathname === "/";

  return (
    <div ref={rootRef} className="border-t border-neutral-100">
      <nav className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 text-sm">
        {allow.has("/") && (
          <Link href="/" className={`rounded-lg px-3 py-1.5 font-medium ${dashOn ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
            📊 대시보드
          </Link>
        )}
        {groups.map((g) => {
          const groupOn = g.items.some((i) => isActive(i.href)) || g.admin.some((a) => isActive(a.href));
          const isOpen = open === g.label;
          return (
            <div key={g.label} className="relative">
              <button
                onClick={() => setOpen(isOpen ? null : g.label)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium ${
                  groupOn ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span>{g.icon}</span>
                <span>{g.label}</span>
                <span className={`text-[9px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full z-40 mt-1 min-w-[190px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                  {g.items.map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setOpen(null)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                        isActive(i.href) ? "bg-neutral-900 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="text-base">{i.icon}</span>
                      <span className="truncate">{i.label}</span>
                    </Link>
                  ))}
                  {g.admin.length > 0 && <div className="my-1 border-t border-neutral-100" />}
                  {g.admin.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={() => setOpen(null)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                        isActive(a.href) ? "bg-neutral-900 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="text-base">{a.icon}</span>
                      <span className="truncate">{a.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
