"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * 테이블 다중선택 훅. 넘겨준 rows(대개 화면에 보이는/필터된 행)만 대상으로 하며,
 * rows 가 바뀌어 사라진 id 는 자동으로 선택에서 빠진다("보이는 것만 처리" 원칙).
 */
export function useTableSelection<T extends { id: string }>(rows: T[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // 현재 보이는 행과의 교집합만 실제 선택으로 취급(유령 id 방지)
  const selected = useMemo(() => rowIds.filter((id) => picked.has(id)), [rowIds, picked]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const allChecked = rowIds.length > 0 && selected.length === rowIds.length;
  const someChecked = selected.length > 0 && !allChecked;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked((prev) => {
      const allSel = rowIds.length > 0 && rowIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSel) rowIds.forEach((id) => next.delete(id));
      else rowIds.forEach((id) => next.add(id));
      return next;
    });

  const clear = () => setPicked(new Set());
  const isSelected = (id: string) => selectedSet.has(id);

  return { selected, count: selected.length, allChecked, someChecked, toggle, toggleAll, clear, isSelected };
}

const BOX =
  "h-4 w-4 cursor-pointer rounded border-neutral-300 accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40";

/** 헤더용 전체선택 체크박스 <th>. someChecked 면 하이픈(indeterminate) 표시. */
export function SelectAllCell({
  checked,
  someChecked,
  onToggle,
  className = "",
}: {
  checked: boolean;
  someChecked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <th className={`w-9 px-3 py-3 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = someChecked;
        }}
        onChange={onToggle}
        aria-label="전체 선택"
        className={BOX}
      />
    </th>
  );
}

/** 행용 체크박스 <td>. 클릭이 행(상세 이동 등)으로 전파되지 않도록 막는다. */
export function SelectRowCell({
  checked,
  onToggle,
  disabled,
  className = "",
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <td className={`w-9 px-3 py-3 ${className}`} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label="행 선택"
        className={BOX}
      />
    </td>
  );
}

/**
 * 선택된 항목이 있을 때 목록 위에 붙는 일괄작업 바(스티키).
 * children 에 화면별 일괄작업 버튼/셀렉트를 넣는다.
 */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-indigo-200 bg-indigo-50/95 px-4 py-2.5 shadow-sm backdrop-blur">
      <span className="text-sm font-semibold text-indigo-800">{count}건 선택</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button
        onClick={onClear}
        className="ml-auto text-xs font-medium text-indigo-500 hover:text-indigo-700"
      >
        선택 해제
      </button>
    </div>
  );
}

/** 일괄바 안에서 쓰는 표준 버튼(tone: default/danger). */
export function BulkButton({
  onClick,
  disabled,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
