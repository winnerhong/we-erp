"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * 검색 가능한 단일 선택 콤보박스. 긴 목록(거래처 등)에서 타이핑으로 좁혀 고른다.
 * 드롭다운은 fixed 위치로 띄워 모달 overflow 에 잘리지 않는다.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "선택",
  emptyOption,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** 값이 ""인 비우기 항목 라벨(예: "미연결"). 없으면 비우기 항목 숨김. */
  emptyOption?: string;
  disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? (value === "" ? emptyOption ?? placeholder : placeholder);

  const term = q.trim().toLowerCase();
  const filtered = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;

  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // 아래 공간이 부족하면 위로 띄움
      const below = window.innerHeight - r.bottom;
      const height = 300;
      const top = below < height && r.top > below ? Math.max(8, r.top - height - 4) : r.bottom + 4;
      setPos({ top, left: r.left, width: r.width });
    }
  }, [open]);

  function close() {
    setOpen(false);
    setQ("");
  }
  function pick(v: string) {
    onChange(v);
    close();
  }

  // 바깥 클릭 시 닫기 — 화면 전체 오버레이 대신 document 리스너로 처리해
  // 모달의 X·배경 클릭이 그대로 통과되도록 한다(클릭 가로채지 않음).
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    // capture 단계에서 듣되 막지 않음 → 대상 요소의 클릭도 정상 동작
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left text-sm focus:border-neutral-500 focus:outline-none disabled:opacity-50"
      >
        <span className={selected ? "truncate text-neutral-900" : "truncate text-neutral-400"}>{label}</span>
        <span className="shrink-0 text-xs text-neutral-400">▾</span>
      </button>
      {open && (
        <>
          <div
            ref={panelRef}
            className="fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl"
            style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: 0 }}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색…"
              className="mb-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <div className="max-h-60 overflow-y-auto">
              {emptyOption && !term && (
                <button
                  type="button"
                  onClick={() => pick("")}
                  className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                    value === "" ? "font-semibold text-indigo-600" : "text-neutral-500"
                  }`}
                >
                  {emptyOption}
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-neutral-400">결과 없음</p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => pick(o.value)}
                    className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                      o.value === value ? "font-semibold text-indigo-600" : ""
                    }`}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
