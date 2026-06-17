"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface GridCol<T> {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
  /** 셀 클릭 인라인 편집 종류. 없으면 읽기전용/커스텀. */
  edit?: "text" | "number" | "date" | "select";
  /** 행별 편집 허용 여부(false면 그 행의 이 셀은 읽기전용). */
  editableRow?: (row: T) => boolean;
  options?: { value: string; label: string }[]; // edit==="select"
  /** 표시·필터·정렬·내보내기에 쓰는 문자열 값. */
  text?: (row: T) => string;
  /** 커스텀 셀 렌더(있으면 text 표시 대신 사용, 인라인편집 비활성). */
  render?: (row: T) => ReactNode;
}

interface Props<T> {
  storageKey: string;
  columns: GridCol<T>[];
  rows: T[];
  rowId: (r: T) => string;
  /** 인라인 편집 커밋. */
  onEdit?: (id: string, key: string, value: string) => void;
  /** 행 왼쪽 강조(미지정 등). */
  accent?: (r: T) => boolean;
  empty?: string;
  /** 처음 표시 개수(기본 10). */
  pageSize?: number;
  /** 표시 개수 선택지(기본 10/30/50/100). */
  pageSizeOptions?: number[];
  /** 하단 인라인 행 추가 버튼(있으면 표시). */
  onAddRow?: () => void;
  addLabel?: string;
  /** 행 선택 체크박스(일괄 작업). */
  selectable?: boolean;
  /** 선택 시 상단에 표시할 일괄 작업 UI. */
  renderBulk?: (ids: string[], clear: () => void) => ReactNode;
  /** 검색창 placeholder(미지정 시 기본 문구). */
  searchPlaceholder?: string;
}

const DEFAULT_W = 130;

function loadJSON<V>(key: string, fallback: V): V {
  if (typeof window === "undefined") return fallback;
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as V) : fallback;
  } catch {
    return fallback;
  }
}

export function ExcelGrid<T>({
  storageKey,
  columns,
  rows,
  rowId,
  onEdit,
  accent,
  empty,
  pageSize = 10,
  pageSizeOptions = [10, 30, 50, 100],
  onAddRow,
  addLabel = "+ 행 추가",
  selectable,
  renderBulk,
  searchPlaceholder = "통장내역 검색 (내용·거래처·금액 등)",
}: Props<T>) {
  const allKeys = columns.map((c) => c.key);
  const colMap = new Map(columns.map((c) => [c.key, c]));

  // ---- 레이아웃 상태(localStorage, 렌더 단계 1회 하이드레이트) ----
  // 기본값(=서버 렌더와 동일)으로 시작. 저장된 레이아웃은 마운트 후 적용해 하이드레이션 불일치 방지.
  const [order, setOrder] = useState<string[]>(allKeys);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  // limit: 표시 개수(null = 전체)
  const [limit, setLimit] = useState<number | null>(pageSize);

  useEffect(() => {
    const savedOrder = loadJSON<string[]>(`${storageKey}:order`, []).filter((k) => colMap.has(k));
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedOrder.length) {
      for (const k of allKeys) if (!savedOrder.includes(k)) savedOrder.push(k);
      setOrder(savedOrder);
    }
    setWidths(loadJSON<Record<string, number>>(`${storageKey}:w`, {}));
    setHidden(loadJSON<string[]>(`${storageKey}:hidden`, []).filter((k) => colMap.has(k)));
    setLimit(loadJSON<number | null>(`${storageKey}:limit`, pageSize));
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const persist = (k: string, v: unknown) => {
    try {
      localStorage.setItem(`${storageKey}:${k}`, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  const visibleCols = order.map((k) => colMap.get(k)).filter((c): c is GridCol<T> => !!c && !hidden.includes(c.key));

  // ---- 컬럼 드래그(순서) ----
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  function dropCol(target: string) {
    if (!dragKey || dragKey === target) return;
    const next = [...order];
    next.splice(next.indexOf(target), 0, next.splice(next.indexOf(dragKey), 1)[0]);
    setOrder(next);
    persist("order", next);
    setDragKey(null);
    setOverKey(null);
  }

  // ---- 컬럼 폭 조정 ----
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);
  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key, startX: e.clientX, startW: widths[key] ?? colMap.get(key)?.width ?? DEFAULT_W };
    const move = (ev: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      const w = Math.max(60, r.startW + (ev.clientX - r.startX));
      setWidths((prev) => ({ ...prev, [r.key]: w }));
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      if (resizing.current) {
        setWidths((prev) => {
          persist("w", prev);
          return prev;
        });
        resizing.current = null;
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // ---- 정렬 / 필터 ----
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const cellText = (c: GridCol<T>, r: T) => (c.text ? c.text(r) : "");

  let view = rows;
  const q = search.trim().toLowerCase();
  if (q) {
    view = view.filter((r) => columns.some((c) => c.text && cellText(c, r).toLowerCase().includes(q)));
  }
  const active = Object.entries(filters).filter(([, v]) => v.trim());
  if (active.length) {
    view = view.filter((r) =>
      active.every(([k, v]) => {
        const c = colMap.get(k);
        return c ? cellText(c, r).toLowerCase().includes(v.trim().toLowerCase()) : true;
      })
    );
  }
  if (sortKey) {
    const c = colMap.get(sortKey);
    if (c) {
      view = [...view].sort((a, b) => {
        const av = cellText(c, a);
        const bv = cellText(c, b);
        const na = Number(av.replace(/[^\d.-]/g, ""));
        const nb = Number(bv.replace(/[^\d.-]/g, ""));
        const cmp =
          av !== "" && bv !== "" && Number.isFinite(na) && Number.isFinite(nb)
            ? na - nb
            : av.localeCompare(bv, "ko");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
  }

  const shown = limit == null ? view : view.slice(0, limit);
  const changeLimit = (v: number | null) => {
    setLimit(v);
    persist("limit", v);
  };

  // ---- 행 선택(일괄 작업) ----
  const [selected, setSelected] = useState<string[]>([]);
  const selSet = new Set(selected);
  const shownIds = shown.map(rowId);
  const allSel = shownIds.length > 0 && shownIds.every((id) => selSet.has(id));
  const clearSel = () => setSelected([]);
  function toggleAll() {
    if (allSel) setSelected(selected.filter((id) => !shownIds.includes(id)));
    else setSelected([...new Set([...selected, ...shownIds])]);
  }
  function toggleOne(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  // ---- 인라인 편집 ----
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  function startEdit(id: string, c: GridCol<T>, r: T) {
    if (!c.edit || !onEdit) return; // edit 미지정 컬럼(커스텀 렌더 등)은 편집 안 함
    if (c.editableRow && !c.editableRow(r)) return; // 원본 행 등 잠긴 셀

    setEditing({ id, key: c.key });
    if (c.edit === "select") {
      // 표시 라벨 → 옵션 value 로 매핑(초기 선택)
      const cur = cellText(c, r);
      setEditVal(c.options?.find((o) => o.label === cur)?.value ?? "");
    } else {
      setEditVal(cellText(c, r));
    }
  }
  function commit() {
    if (editing && onEdit) onEdit(editing.id, editing.key, editVal);
    setEditing(null);
  }

  return (
    <div>
      {/* 검색 + 표시 개수 + 컬럼 표시/필터 토글 */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="relative mr-auto">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-64 rounded-lg border border-neutral-300 bg-white py-1.5 pl-7 pr-7 text-sm focus:border-neutral-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              aria-label="검색 지우기"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-neutral-400">표시</span>
        <select
          value={limit == null ? "all" : String(limit)}
          onChange={(e) => changeLimit(e.target.value === "all" ? null : Number(e.target.value))}
          className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 font-medium text-neutral-600"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}개
            </option>
          ))}
          <option value="all">전체</option>
        </select>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className={`rounded-lg border px-2.5 py-1.5 font-medium ${
            filterOpen ? "border-neutral-800 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          🔎 컬럼 필터
        </button>
        <ColumnToggle
          columns={order.map((k) => colMap.get(k)!).filter(Boolean)}
          hidden={hidden}
          onToggle={(key) => {
            const next = hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key];
            setHidden(next);
            persist("hidden", next);
          }}
          onReset={() => {
            setOrder(allKeys);
            setWidths({});
            setHidden([]);
            persist("order", allKeys);
            persist("w", {});
            persist("hidden", []);
          }}
        />
      </div>

      {selectable && selected.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
          <span className="font-semibold text-indigo-800">{selected.length}개 선택</span>
          {renderBulk?.(selected, clearSel)}
          <button
            onClick={clearSel}
            className="ml-auto rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="max-h-[72vh] overflow-auto rounded-xl border border-neutral-200">
        <table className="text-sm" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
          <colgroup>
            <col style={{ width: selectable ? 34 : 8 }} />
            {visibleCols.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.width ?? DEFAULT_W }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-xs text-neutral-600">
              <th className="sticky top-0 z-20 bg-neutral-50 p-0 text-center shadow-[inset_0_-1px_0_#e5e7eb]">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={toggleAll}
                    aria-label="전체 선택"
                  />
                )}
              </th>
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  draggable
                  onDragStart={() => setDragKey(c.key)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverKey(c.key);
                  }}
                  onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
                  onDrop={() => dropCol(c.key)}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  className={`sticky top-0 z-20 relative select-none whitespace-nowrap border-r border-neutral-200 bg-neutral-50 px-2 py-2 font-semibold shadow-[inset_0_-1px_0_#e5e7eb] last:border-r-0 ${
                    overKey === c.key && dragKey !== c.key ? "bg-indigo-100" : ""
                  } ${dragKey === c.key ? "opacity-40" : ""}`}
                >
                  <span className="flex cursor-move items-center gap-1">
                    <span className="text-neutral-300">⋮⋮</span>
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={`flex-1 text-left hover:text-neutral-900 ${c.align === "right" ? "text-right" : ""}`}
                    >
                      {c.label}
                      {sortKey === c.key && <span className="ml-0.5 text-indigo-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </span>
                  {/* 폭 조정 핸들 */}
                  <span
                    onMouseDown={(e) => startResize(e, c.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300"
                  />
                </th>
              ))}
            </tr>
            {filterOpen && (
              <tr className="text-neutral-600">
                <th className="sticky top-[37px] z-20 bg-white p-0 shadow-[inset_0_-1px_0_#e5e7eb]" />
                {visibleCols.map((c) => (
                  <th key={c.key} className="sticky top-[37px] z-20 border-r border-neutral-100 bg-white p-1 shadow-[inset_0_-1px_0_#e5e7eb] last:border-r-0">
                    {c.options ? (
                      <select
                        value={filters[c.key] ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                        className="w-full rounded border border-neutral-200 px-1.5 py-1 text-xs"
                      >
                        <option value="">전체</option>
                        {c.options.map((o) => (
                          <option key={o.value} value={o.label}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : c.text ? (
                      <input
                        value={filters[c.key] ?? ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                        placeholder="검색"
                        className="w-full rounded border border-neutral-200 px-1.5 py-1 text-xs"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {view.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-4 py-12 text-center text-sm text-neutral-400">
                  {empty ?? "데이터가 없습니다"}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const id = rowId(r);
                return (
                  <tr key={id} className={`group hover:bg-sky-100 ${selSet.has(id) ? "bg-indigo-50" : ""}`}>
                    <td
                      className={`text-center align-middle ${
                        accent?.(r) ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"
                      }`}
                    >
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={selSet.has(id)}
                          onChange={() => toggleOne(id)}
                          aria-label="행 선택"
                        />
                      )}
                    </td>
                    {visibleCols.map((c) => {
                      const isEditing = editing?.id === id && editing.key === c.key;
                      const cellEditable = !!c.edit && onEdit && (!c.editableRow || c.editableRow(r));
                      return (
                        <td
                          key={c.key}
                          onClick={() => !isEditing && startEdit(id, c, r)}
                          className={`overflow-hidden border-r border-neutral-100 px-2 py-1.5 align-middle last:border-r-0 ${
                            c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""
                          } ${cellEditable ? "cursor-text" : ""}`}
                        >
                          {isEditing ? (
                            c.edit === "select" ? (
                              <select
                                autoFocus
                                value={editVal}
                                onChange={(e) => {
                                  setEditVal(e.target.value);
                                  if (onEdit && editing) onEdit(editing.id, editing.key, e.target.value);
                                  setEditing(null);
                                }}
                                onBlur={() => setEditing(null)}
                                className="w-full rounded border border-indigo-400 px-1 py-0.5 text-sm outline-none"
                              >
                                {(c.options ?? []).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                autoFocus
                                type={c.edit === "number" ? "text" : c.edit}
                                inputMode={c.edit === "number" ? "numeric" : undefined}
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                onBlur={commit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commit();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="w-full rounded border border-indigo-400 px-1 py-0.5 text-sm outline-none"
                              />
                            )
                          ) : c.render ? (
                            c.render(r)
                          ) : (
                            <span className="block truncate">{cellText(c, r) || <span className="text-neutral-300">-</span>}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {onAddRow && (
            <tfoot>
              <tr>
                <td colSpan={visibleCols.length + 1} className="p-0">
                  <button
                    onClick={onAddRow}
                    className="w-full border-t border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
                  >
                    {addLabel}
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 더 보기 + 건수 */}
      {view.length > 0 &&
        (limit != null && view.length > limit ? (
          <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3">
            <p className="text-sm text-indigo-800">
              전체 <b>{view.length.toLocaleString()}건</b> 중 <b>{shown.length.toLocaleString()}건</b> 표시 중 ·{" "}
              <span className="font-semibold text-rose-600">{(view.length - shown.length).toLocaleString()}건 더 있음 ↓</span>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => changeLimit(limit + Math.max(pageSize, 10))}
                className="rounded-lg border border-indigo-300 bg-white px-4 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                + {Math.max(pageSize, 10)}개 더 보기
              </button>
              <button
                onClick={() => changeLimit(null)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                전체 {view.length.toLocaleString()}건 보기
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-neutral-400">
            전체 {view.length.toLocaleString()}건 표시 중
          </p>
        ))}
    </div>
  );
}

// 컬럼 표시/숨김 + 초기화 메뉴
function ColumnToggle<T>({
  columns,
  hidden,
  onToggle,
  onReset,
}: {
  columns: GridCol<T>[];
  hidden: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-medium text-neutral-600 hover:bg-neutral-50"
      >
        👁 컬럼 표시
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl">
            <div className="max-h-72 overflow-y-auto">
              {columns
                .filter((c) => c.label)
                .map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100"
                  >
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => onToggle(c.key)} />
                    {c.label}
                  </label>
                ))}
            </div>
            <div className="mt-1 border-t border-neutral-100 pt-1">
              <button
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-100"
              >
                ↺ 컬럼 초기화
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
