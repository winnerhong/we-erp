"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createRow,
  updateRow,
  deleteRow,
  setRowActive,
  bulkSetRowActive,
  bulkDeleteRows,
} from "@/app/(erp)/actions";
import type { ImportKind, ImportCtx } from "@/lib/import-specs";
import { BulkImport } from "./bulk-import";
import { Card, Field, TextInput, SelectInput, EmptyState, Badge } from "./ui";
import { useTableSelection, SelectAllCell, SelectRowCell, BulkBar, BulkButton } from "./bulk-select";

export type FieldType = "text" | "number" | "date" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface ColumnDef<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface Row {
  id: string;
  is_active: boolean;
}

const asRecord = (row: unknown) => row as Record<string, unknown>;

interface Props<T extends Row> {
  kind: ImportKind;
  title: string;
  description?: string;
  rows: T[];
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  ctx: ImportCtx;
  /** 제공 시 검색창 노출 — 반환 문자열에 대해 부분일치 필터. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** 헤더 아래 우측에 별도 줄로 렌더할 버튼 등(동기화 등). */
  extraActions?: ReactNode;
  /** 구분 필터 탭 — 제공 시 ‘전체 + 탭들’로 행을 거를 수 있음. */
  filterTabs?: { key: string; label: string; test: (row: T) => boolean }[];
  /** 내장 상태(활성/비활성) 컬럼 숨김 — 자체 상태 컬럼을 쓸 때. */
  hideBuiltinStatus?: boolean;
  /** 맨 앞에 순번(No) 컬럼 표시. */
  showRowNumber?: boolean;
}

function emptyDraft(fields: FieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

/** 폼 입력값(문자열) → DB 레코드(타입 변환·빈값 null). */
function toRecord(fields: FieldDef[], draft: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (draft[f.key] ?? "").trim();
    if (raw === "") {
      out[f.key] = null;
      continue;
    }
    if (f.type === "number") {
      const n = Number(raw.replace(/[^\d.-]/g, ""));
      out[f.key] = Number.isFinite(n) ? n : null;
    } else {
      out[f.key] = raw;
    }
  }
  return out;
}

export function EntityManager<T extends Row>({
  kind,
  title,
  description,
  rows,
  columns,
  fields,
  ctx,
  searchText,
  searchPlaceholder,
  extraActions,
  filterTabs,
  hideBuiltinStatus,
  showRowNumber,
}: Props<T>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<T | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft(fields));
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");

  const q = query.trim().toLowerCase();
  let visibleRows = rows;
  if (filterTabs && activeFilter !== "ALL") {
    const tab = filterTabs.find((f) => f.key === activeFilter);
    if (tab) visibleRows = visibleRows.filter(tab.test);
  }
  if (searchText && q) {
    visibleRows = visibleRows.filter((r) => searchText(r).toLowerCase().includes(q));
  }

  const sel = useTableSelection(visibleRows);

  function runBulk(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { alert(res.error); return; }
      sel.clear();
      router.refresh();
    });
  }

  function openAdd() {
    setEditing(null);
    setDraft(emptyDraft(fields));
    setError(null);
    setFormOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    const rec = asRecord(row);
    setDraft(
      Object.fromEntries(
        fields.map((f) => [f.key, rec[f.key] == null ? "" : String(rec[f.key])])
      )
    );
    setError(null);
    setFormOpen(true);
  }

  function submit() {
    for (const f of fields) {
      if (f.required && !(draft[f.key] ?? "").trim()) {
        setError(`${f.label}은(는) 필수입니다`);
        return;
      }
    }
    const record = toRecord(fields, draft);
    startTransition(async () => {
      const res = editing
        ? await updateRow(kind, editing.id, record)
        : await createRow(kind, record);
      if (res.ok) {
        setFormOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "오류가 발생했습니다");
      }
    });
  }

  function toggleActive(row: T) {
    startTransition(async () => {
      await setRowActive(kind, row.id, !row.is_active);
      router.refresh();
    });
  }

  function remove(row: T) {
    if (!confirm("정말 삭제할까요? 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      const res = await deleteRow(kind, row.id);
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <BulkImport kind={kind} ctx={ctx} />
          <button
            onClick={openAdd}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 동기화 등 부가 컨트롤 — 별도 줄, 우측 정렬 */}
      {extraActions && (
        <div className="mb-3 flex justify-end rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          {extraActions}
        </div>
      )}

      {/* 구분 필터 탭 */}
      {filterTabs && (
        <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
          {[{ key: "ALL", label: "전체", test: () => true }, ...filterTabs].map((t) => {
            const n =
              t.key === "ALL" ? rows.length : rows.filter(t.test).length;
            return (
              <button
                key={t.key}
                onClick={() => setActiveFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  activeFilter === t.key ? "bg-white shadow-sm" : "text-neutral-500"
                }`}
              >
                {t.label} <span className="text-neutral-400">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {searchText && (
        <div className="mb-3 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? "검색…"}
            className="w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          {q && (
            <span className="text-xs text-neutral-400">
              {visibleRows.length} / {rows.length}건
            </span>
          )}
        </div>
      )}

      <BulkBar count={sel.count} onClear={sel.clear}>
        {!hideBuiltinStatus && (
          <>
            <BulkButton onClick={() => runBulk(() => bulkSetRowActive(kind, sel.selected, true))} disabled={pending}>
              활성화
            </BulkButton>
            <BulkButton onClick={() => runBulk(() => bulkSetRowActive(kind, sel.selected, false))} disabled={pending}>
              비활성화
            </BulkButton>
          </>
        )}
        <BulkButton
          tone="danger"
          disabled={pending}
          onClick={() => {
            if (confirm(`선택한 ${sel.count}건을 삭제할까요? 되돌릴 수 없습니다.`))
              runBulk(() => bulkDeleteRows(kind, sel.selected));
          }}
        >
          🗑 삭제
        </BulkButton>
      </BulkBar>

      <Card>
        {visibleRows.length === 0 ? (
          <EmptyState
            message={
              q
                ? "검색 결과가 없습니다."
                : "등록된 항목이 없습니다. ‘추가’ 또는 CSV 일괄등록으로 시작하세요."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr>
                  <SelectAllCell checked={sel.allChecked} someChecked={sel.someChecked} onToggle={sel.toggleAll} />
                  {showRowNumber && <th className="px-4 py-3 font-medium">No</th>}
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium">
                      {c.label}
                    </th>
                  ))}
                  {!hideBuiltinStatus && <th className="px-4 py-3 font-medium">상태</th>}
                  <th className="px-4 py-3 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`${!hideBuiltinStatus && !row.is_active ? "opacity-50" : ""} ${sel.isSelected(row.id) ? "bg-indigo-50/50" : ""}`}
                  >
                    <SelectRowCell checked={sel.isSelected(row.id)} onToggle={() => sel.toggle(row.id)} />
                    {showRowNumber && (
                      <td className="px-4 py-3 text-neutral-400 tabular">{idx + 1}</td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {c.render ? c.render(row) : String(asRecord(row)[c.key] ?? "-")}
                      </td>
                    ))}
                    {!hideBuiltinStatus && (
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(row)} disabled={pending}>
                          {row.is_active ? (
                            <Badge tone="green">활성</Badge>
                          ) : (
                            <Badge>비활성</Badge>
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(row)}
                        className="mr-3 text-neutral-600 hover:text-neutral-900"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <div className="mt-10 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <h2 className="font-semibold">
                {title} {editing ? "수정" : "추가"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required}>
                    {f.type === "select" ? (
                      <SelectInput
                        value={draft[f.key] ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                        }
                      >
                        <option value="">선택…</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </SelectInput>
                    ) : (
                      <TextInput
                        type={f.type === "date" ? "date" : "text"}
                        inputMode={f.type === "number" ? "numeric" : undefined}
                        placeholder={f.placeholder}
                        value={draft[f.key] ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                        }
                      />
                    )}
                </Field>
              ))}
            </div>
            {error && (
              <p className="px-5 text-sm text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {pending ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
