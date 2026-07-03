"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MENU_GROUPS, MENU_BY_HREF, type MenuItem } from "@/lib/menus";
import { QuickMenu } from "@/components/quick-menu";

const ADMIN_ITEMS: MenuItem[] = [
  { href: "/admin/users", label: "사용자 관리", icon: "🔑" },
  { href: "/admin/permissions", label: "권한 관리", icon: "🛡️" },
  { href: "/admin/audit", label: "감사추적", icon: "🕵️" },
  { href: "/admin/close", label: "결산 마감", icon: "🔒" },
];

const NAV_ORDER_KEY = "erp_nav_order";
const NAV_ITEM_ORDER_KEY = "erp_nav_item_order";

/** 상단 그룹 네비 — 좌측 사이드바 대체. 그룹별 드롭다운. 순서 사용자 지정 가능. */
export function TopNav({ allowedHrefs, isAdmin }: { allowedHrefs: string[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]); // 저장된 그룹 순서(label 목록)
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>({}); // 그룹별 항목 순서(href 목록)
  const [editMode, setEditMode] = useState(false); // 순서 편집 모드(직접 드래그)
  const [groupDrag, setGroupDrag] = useState<number | null>(null);
  const [itemDrag, setItemDrag] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const allow = new Set(allowedHrefs);

  // 저장된 그룹·항목 순서 로드
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(NAV_ORDER_KEY);
      if (raw) setOrder(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    try {
      const rawI = localStorage.getItem(NAV_ITEM_ORDER_KEY);
      if (rawI) setItemOrder(JSON.parse(rawI) as Record<string, string[]>);
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  function persistOrder(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  function persistItemOrder(groupLabel: string, hrefs: string[]) {
    setItemOrder((prev) => {
      const next = { ...prev, [groupLabel]: hrefs };
      try { localStorage.setItem(NAV_ITEM_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function resetOrder() {
    setOrder([]);
    setItemOrder({});
    try {
      localStorage.removeItem(NAV_ORDER_KEY);
      localStorage.removeItem(NAV_ITEM_ORDER_KEY);
    } catch {
      /* ignore */
    }
  }

  // 바깥 클릭 시 닫기 (링크 클릭 시엔 onClick 에서 닫음)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 편집 모드: ESC 로 종료
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setEditMode(false); setOpen(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  const baseGroups = MENU_GROUPS.map((g) => {
    const items = g.hrefs.filter((h) => allow.has(h)).map((h) => MENU_BY_HREF[h]).filter(Boolean);
    const admin = g.label === "설정" && isAdmin ? ADMIN_ITEMS : [];
    return { ...g, items, admin };
  }).filter((g) => g.items.length + g.admin.length > 0);

  // 저장된 순서 적용(목록에 없는 신규 그룹/항목은 뒤로, 사라진 것은 무시)
  const orderIdx = new Map(order.map((l, i) => [l, i]));
  const groups = baseGroups
    .slice()
    .sort((a, b) => (orderIdx.get(a.label) ?? Infinity) - (orderIdx.get(b.label) ?? Infinity))
    .map((g) => {
      const io = itemOrder[g.label];
      if (!io) return g;
      const iidx = new Map(io.map((h, i) => [h, i]));
      const items = g.items.slice().sort((a, b) => (iidx.get(a.href) ?? Infinity) - (iidx.get(b.href) ?? Infinity));
      return { ...g, items };
    });

  const dashOn = pathname === "/";

  // 그룹 드래그 재배치
  function dropGroup(target: number) {
    if (groupDrag === null || groupDrag === target) { setGroupDrag(null); return; }
    const labels = groups.map((g) => g.label);
    const [moved] = labels.splice(groupDrag, 1);
    labels.splice(target, 0, moved);
    persistOrder(labels);
    setGroupDrag(null);
  }
  // 항목 드래그 재배치(열린 그룹 기준)
  function dropItem(groupLabel: string, items: { href: string }[], target: number) {
    if (itemDrag === null || itemDrag === target) { setItemDrag(null); return; }
    const hrefs = items.map((it) => it.href);
    const [moved] = hrefs.splice(itemDrag, 1);
    hrefs.splice(target, 0, moved);
    persistItemOrder(groupLabel, hrefs);
    setItemDrag(null);
  }

  return (
    <div ref={rootRef} className="border-t border-neutral-100">
      <nav className={`flex flex-wrap items-center gap-0.5 px-3 py-1.5 text-sm transition-colors ${editMode ? "bg-indigo-50/50" : ""}`}>
        {editMode && (
          <span className="mr-1 flex items-center gap-1 rounded-lg bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
            🔀 순서 편집 중 · 드래그
            <button onClick={resetOrder} className="ml-1 rounded px-1 text-[11px] text-indigo-500 hover:bg-indigo-200">초기화</button>
          </span>
        )}
        {allow.has("/") &&
          (editMode ? (
            <span className="rounded-lg px-3 py-1.5 font-medium text-neutral-300" title="대시보드는 고정입니다">📊 대시보드</span>
          ) : (
            <Link href="/" className={`rounded-lg px-3 py-1.5 font-medium ${dashOn ? "bg-indigo-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              📊 대시보드
            </Link>
          ))}
        {groups.map((g, gi) => {
          const groupOn = g.items.some((i) => isActive(i.href)) || g.admin.some((a) => isActive(a.href));
          const isOpen = open === g.label;
          return (
            <div
              key={g.label}
              className="relative"
              onMouseEnter={editMode ? undefined : () => setOpen(g.label)}
              onMouseLeave={editMode ? undefined : () => setOpen((cur) => (cur === g.label ? null : cur))}
            >
              <button
                draggable={editMode}
                onDragStart={editMode ? () => setGroupDrag(gi) : undefined}
                onDragOver={editMode ? (e) => e.preventDefault() : undefined}
                onDrop={editMode ? () => dropGroup(gi) : undefined}
                onDragEnd={editMode ? () => setGroupDrag(null) : undefined}
                onClick={() => setOpen(isOpen ? null : g.label)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium ${
                  editMode
                    ? `cursor-grab border border-dashed active:cursor-grabbing ${
                        groupDrag === gi ? "border-indigo-400 bg-indigo-100 opacity-60" : "border-indigo-300 text-indigo-800 hover:bg-indigo-100"
                      }`
                    : groupOn
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span>{g.icon}</span>
                <span>{g.label}</span>
                {editMode ? (
                  <span className="select-none text-[10px] text-indigo-400">⠿</span>
                ) : (
                  <span className={`text-[9px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                )}
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full z-40 min-w-[200px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                  {editMode && <p className="px-2 py-1 text-[11px] text-indigo-400">드래그로 항목 순서 변경</p>}
                  {g.items.map((it, ii) =>
                    editMode ? (
                      <div
                        key={it.href}
                        draggable
                        onDragStart={() => setItemDrag(ii)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => dropItem(g.label, g.items, ii)}
                        onDragEnd={() => setItemDrag(null)}
                        className={`flex cursor-grab items-center gap-2 rounded-lg border border-dashed px-3 py-2 active:cursor-grabbing ${
                          itemDrag === ii ? "border-indigo-400 bg-indigo-100 opacity-60" : "border-indigo-300 hover:bg-indigo-50"
                        }`}
                      >
                        <span className="select-none text-neutral-300">⠿</span>
                        <span className="text-base">{it.icon}</span>
                        <span className="truncate text-neutral-700">{it.label}</span>
                      </div>
                    ) : (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setOpen(null)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                          isActive(it.href) ? "bg-indigo-500 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        <span className="text-base">{it.icon}</span>
                        <span className="truncate">{it.label}</span>
                      </Link>
                    )
                  )}
                  {g.admin.length > 0 && <div className="my-1 border-t border-neutral-100" />}
                  {g.admin.map((a) =>
                    editMode ? (
                      <div key={a.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-neutral-400">
                        <span className="text-base">{a.icon}</span>
                        <span className="truncate">{a.label}</span>
                        <span className="ml-auto text-[10px] text-neutral-300">고정</span>
                      </div>
                    ) : (
                      <Link
                        key={a.href}
                        href={a.href}
                        onClick={() => setOpen(null)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                          isActive(a.href) ? "bg-indigo-500 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        <span className="text-base">{a.icon}</span>
                        <span className="truncate">{a.label}</span>
                      </Link>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <button
            onClick={() => { setEditMode((v) => !v); setOpen(null); }}
            title={editMode ? "순서 편집 완료" : "메뉴 순서 편집 (드래그)"}
            className={`flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-base ${
              editMode ? "bg-indigo-500 text-white" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            }`}
          >
            {editMode ? <span className="px-0.5 text-xs font-semibold">✓ 완료</span> : "⇅"}
          </button>
          <QuickMenu allowedHrefs={allowedHrefs} />
        </div>
      </nav>
    </div>
  );
}
