"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MENUS, MENU_BY_HREF } from "@/lib/menus";

const STORAGE_KEY = "erp_quickmenu";
const DEFAULTS = ["/", "/partners", "/employees"];

/** 상단 우측 퀵메뉴 — 자주 쓰는 화면 바로가기 + ⚙ 설정(추가/제거). localStorage 저장. */
export function QuickMenu({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();
  const allow = new Set(allowedHrefs);
  const [mounted, setMounted] = useState(false);
  const [hrefs, setHrefs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 마운트 후 저장값 로드(하이드레이션 불일치 방지)
  useEffect(() => {
    let init: string[] = DEFAULTS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) init = JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setHrefs(init.filter((h) => MENU_BY_HREF[h]));
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 바깥 클릭 시 설정 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function persist(next: string[]) {
    setHrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  function toggle(href: string) {
    persist(hrefs.includes(href) ? hrefs.filter((h) => h !== href) : [...hrefs, href]);
  }

  if (!mounted) return null;

  const items = hrefs.map((h) => MENU_BY_HREF[h]).filter((m) => m && allow.has(m.href));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div ref={rootRef} className="relative flex items-center gap-0.5">
      <span className="mr-0.5 hidden text-xs text-neutral-300 sm:inline">⭐</span>
      {items.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          title={m.label}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition ${
            isActive(m.href) ? "bg-indigo-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {m.icon}
        </Link>
      ))}
      <button
        onClick={() => setOpen((v) => !v)}
        title="퀵메뉴 설정"
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition ${open ? "bg-neutral-100 text-neutral-800" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"}`}
      >
        ⚙
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
          <div className="mb-1 px-2 py-1 text-xs font-semibold text-neutral-400">퀵메뉴 설정 — 자주 쓰는 메뉴를 켜세요</div>
          {MENUS.filter((m) => allow.has(m.href)).map((m) => {
            const on = hrefs.includes(m.href);
            return (
              <button
                key={m.href}
                onClick={() => toggle(m.href)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${on ? "bg-neutral-100 font-medium text-neutral-800" : "text-neutral-600 hover:bg-neutral-50"}`}
              >
                <span className="text-base">{m.icon}</span>
                <span className="flex-1 truncate">{m.label}</span>
                <span className={`text-xs ${on ? "text-emerald-500" : "text-neutral-300"}`}>{on ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
