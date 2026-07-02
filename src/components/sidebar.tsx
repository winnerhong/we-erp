"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MENUS } from "@/lib/menus";

/** 좌측 사이드바 — 접힘/펼침 토글(상태 localStorage 저장). */
export function Sidebar({ allowedHrefs, isAdmin }: { allowedHrefs: string[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // 첫 렌더는 서버와 동일(펼침)으로 → 하이드레이션 일치. 마운트 후 저장값 적용.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("erp_sidebar") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
    }
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("erp_sidebar", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const allow = new Set(allowedHrefs);
  const items = MENUS.filter((m) => allow.has(m.href));

  const renderLink = (href: string, icon: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
        collapsed ? "justify-center" : ""
      } ${active ? "bg-indigo-600 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
    >
      <span className="text-base">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  return (
    <aside
      className={`hidden shrink-0 border-r border-neutral-200 bg-white transition-[width] duration-200 md:flex md:flex-col ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex items-center justify-between gap-1 border-b border-neutral-200 px-3 py-4">
        {!collapsed && (
          <Link href="/" className="truncate text-base font-bold text-neutral-900">
            위너 통합 ERP
          </Link>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 text-sm">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return renderLink(item.href, item.icon, item.label, active);
        })}
        {isAdmin && (
          <div className="mt-1 space-y-1 border-t border-neutral-200 pt-2">
            {renderLink("/admin/users", "🔑", "사용자 관리", pathname.startsWith("/admin/users"))}
            {renderLink("/admin/permissions", "🛡️", "권한 관리", pathname.startsWith("/admin/permissions"))}
          </div>
        )}
      </nav>
    </aside>
  );
}
