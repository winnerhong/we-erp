"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renderBody,
  manualTokens,
  ensureHtml,
  type VarCompany,
  type VarLabels,
} from "@/lib/document-vars";
import type { DocumentTemplateRow, DocumentIssueRow, EmployeeRow } from "@/lib/supabase/database.types";

export interface IssueActionInput {
  employee_id: string;
  template_id: string | null;
  company_id: string | null;
  title: string;
  rendered_body: string;
  field_values: Record<string, string>;
}
export interface IssueActions {
  create: (input: IssueActionInput) => Promise<{ ok: boolean; error?: string }>;
  saveSigned: (id: string, dataUrl: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "작성중", cls: "bg-neutral-100 text-neutral-600" },
  ISSUED: { label: "발행", cls: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "서명완료", cls: "bg-emerald-100 text-emerald-700" },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 추가 입력 항목 → 문서 하단에 붙일 '추가 기재 사항' HTML (항목명/내용 중 하나라도 있으면 포함). */
function buildExtraHtml(extra: { label: string; value: string }[]): string {
  const rows = extra.filter((e) => e.label.trim() || e.value.trim());
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (e) =>
        `<tr><th style="text-align:left;width:30%;border:1px solid #d4d4d4;padding:8px;background:#fafafa">${escapeHtml(
          e.label.trim() || "-"
        )}</th><td style="border:1px solid #d4d4d4;padding:8px">${escapeHtml(e.value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");
  return `<h3 style="margin-top:24px">추가 기재 사항</h3><table style="width:100%;border-collapse:collapse">${body}</table>`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function DocumentIssuePanel({
  employee,
  company,
  labels,
  today,
  templates,
  issues,
  companyId,
  actions,
  canIssue = true,
  title = "📄 서류 발행·보관",
  unsignedFirst = false,
}: {
  employee: Partial<EmployeeRow> & { id: string; name: string };
  company: VarCompany | null;
  labels: VarLabels;
  today: string;
  templates: DocumentTemplateRow[];
  issues: DocumentIssueRow[];
  companyId: string | null;
  actions: IssueActions;
  canIssue?: boolean;
  title?: string;
  unsignedFirst?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const refresh = () => router.refresh();

  const ctx = useMemo(() => ({ employee, company, labels, today }), [employee, company, labels, today]);

  // 서명 대기(서명본 미첨부) 건수 — 강사 화면에서 강조
  const unsignedCount = issues.filter((i) => !i.signed_file).length;
  const sortedIssues = unsignedFirst
    ? [...issues].sort((a, b) => (a.signed_file ? 1 : 0) - (b.signed_file ? 1 : 0))
    : issues;

  function uploadSigned(id: string, file: File) {
    startTransition(async () => {
      const dataUrl = await fileToDataUrl(file);
      await actions.saveSigned(id, dataUrl);
      refresh();
    });
  }
  function remove(id: string) {
    if (!confirm("이 발행 서류를 삭제할까요?")) return;
    startTransition(async () => {
      await actions.remove(id);
      refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-800">
          {title}
          {unsignedCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">서명 필요 {unsignedCount}</span>
          )}
        </h3>
        {canIssue && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
          >
            + 서류 발행
          </button>
        )}
      </div>

      {issues.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-400">발행된 서류가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {sortedIssues.map((it) => {
            const st = STATUS[it.status] ?? STATUS.ISSUED;
            const needSign = !it.signed_file;
            return (
              <li
                key={it.id}
                className={`flex flex-wrap items-center gap-2 px-5 py-3 text-sm ${
                  unsignedFirst && needSign ? "border-l-4 border-amber-400 bg-amber-50/40" : ""
                }`}
              >
                <span className="font-medium text-neutral-800">{it.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                <span className="text-xs text-neutral-400">{it.issued_on}</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => window.open(`/documents/print/${it.id}`, "_blank")}
                    className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
                  >
                    🖨 인쇄·PDF
                  </button>
                  {it.signed_file ? (
                    <a
                      href={it.signed_file}
                      download={`${it.title}-서명본`}
                      className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      ✅ 서명본
                    </a>
                  ) : (
                    <label className="cursor-pointer rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
                      ⬆ 서명본 업로드
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadSigned(it.id, e.target.files[0])}
                      />
                    </label>
                  )}
                  <button onClick={() => remove(it.id)} className="text-xs text-rose-500 hover:text-rose-700">
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <IssueModal
          ctx={ctx}
          templates={templates}
          companyId={companyId}
          employeeId={employee.id}
          onClose={() => setOpen(false)}
          onIssue={(input) =>
            startTransition(async () => {
              const res = await actions.create(input);
              if (res.ok) {
                setOpen(false);
                refresh();
              } else alert(res.error ?? "발행 실패");
            })
          }
        />
      )}
    </section>
  );
}

function IssueModal({
  ctx,
  templates,
  companyId,
  employeeId,
  onClose,
  onIssue,
}: {
  ctx: { employee: Partial<EmployeeRow>; company: VarCompany | null; labels: VarLabels; today: string };
  templates: DocumentTemplateRow[];
  companyId: string | null;
  employeeId: string;
  onClose: () => void;
  onIssue: (input: IssueActionInput) => void;
}) {
  const [tid, setTid] = useState(templates[0]?.id ?? "");
  const tpl = templates.find((t) => t.id === tid) ?? null;
  const [values, setValues] = useState<Record<string, string>>({});
  // 양식 외에 자유롭게 덧붙이는 추가 입력 항목 (항목명 + 내용) — 문서 하단 '추가 기재 사항'으로 첨부
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);
  // 미리보기 배율(%)
  const [zoomPct, setZoomPct] = useState(50);
  const changeZoom = (d: number) => setZoomPct((z) => Math.min(150, Math.max(20, z + d)));
  // 포커스된 입력 항목 → 미리보기에서 강조
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const manuals = tpl ? manualTokens(tpl.body) : [];
  const extraHtml = buildExtraHtml(extra);
  const preview = tpl ? renderBody(tpl.body, ctx, values, activeToken ?? undefined) + extraHtml : "";

  // 포커스(강조 항목)가 바뀌면 미리보기에서 해당 위치로 부드럽게 스크롤
  useEffect(() => {
    if (!activeToken) return;
    const el = previewRef.current?.querySelector("[data-hl]");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeToken]);

  function issue() {
    if (!tpl) return;
    onIssue({
      employee_id: employeeId,
      template_id: tpl.id,
      company_id: companyId,
      title: tpl.name,
      rendered_body: renderBody(tpl.body, ctx, values) + extraHtml,
      field_values: { ...values, ...Object.fromEntries(extra.filter((e) => e.label.trim()).map((e) => [e.label.trim(), e.value])) },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-8 w-full max-w-[1165px] rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">서류 발행 — {ctx.employee.name}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
          {/* 좌: 양식 선택 + 빈칸 입력 */}
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">양식</span>
              <select
                value={tid}
                onChange={(e) => {
                  setTid(e.target.value);
                  setValues({});
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {templates.length === 0 && <option value="">등록된 양식 없음</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.category ? ` · ${t.category}` : ""}</option>
                ))}
              </select>
            </label>

            {manuals.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-500">직접 입력 항목</p>
                {manuals.map((m) => {
                  const focused = activeToken === m;
                  return (
                    <label key={m} className="flex flex-col gap-1 text-sm">
                      <span className={focused ? "font-semibold text-amber-700" : "text-neutral-600"}>{m}</span>
                      <input
                        value={values[m] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
                        onFocus={() => setActiveToken(m)}
                        placeholder={`${m} 입력`}
                        className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                          focused ? "border-amber-400 ring-2 ring-amber-200" : "border-neutral-300"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">직접 입력할 빈칸이 없습니다(자동변수만 사용).</p>
            )}

            {/* 추가 입력 항목 — 양식에 없는 내용을 자유롭게 덧붙임 (문서 하단 '추가 기재 사항') */}
            <div className="space-y-2 border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-500">추가 입력 항목</p>
                <button
                  type="button"
                  onClick={() => setExtra((x) => [...x, { label: "", value: "" }])}
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                >
                  + 항목 추가
                </button>
              </div>
              {extra.length === 0 ? (
                <p className="text-xs text-neutral-400">필요 시 항목명과 내용을 추가하면 문서 하단에 표로 들어갑니다.</p>
              ) : (
                extra.map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <input
                      value={row.label}
                      onChange={(e) => setExtra((x) => x.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="항목명 (예: 특약사항)"
                      className="w-1/3 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={row.value}
                      onChange={(e) => setExtra((x) => x.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))}
                      placeholder="내용 입력"
                      rows={1}
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setExtra((x) => x.filter((_, idx) => idx !== i))}
                      title="삭제"
                      className="mt-1 rounded-md px-2 py-1 text-sm text-rose-500 hover:bg-rose-50"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 우: 미리보기 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-500">미리보기</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => changeZoom(-5)}
                  title="5% 축소"
                  className="h-6 w-6 rounded-md border border-neutral-300 text-sm leading-none text-neutral-600 hover:bg-neutral-100"
                >
                  −
                </button>
                <span className="w-10 text-center text-xs tabular text-neutral-500">{zoomPct}%</span>
                <button
                  type="button"
                  onClick={() => changeZoom(5)}
                  title="5% 확대"
                  className="h-6 w-6 rounded-md border border-neutral-300 text-sm leading-none text-neutral-600 hover:bg-neutral-100"
                >
                  ＋
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPct(50)}
                  title="기본 배율(50%)"
                  className="ml-1 rounded-md border border-neutral-300 px-1.5 text-[11px] text-neutral-500 hover:bg-neutral-100"
                >
                  기본
                </button>
              </div>
            </div>
            <div ref={previewRef} className="max-h-[60vh] overflow-auto rounded-lg border border-neutral-200 bg-white p-4">
              {tpl ? (
                <div className="doc-content" style={{ zoom: `${zoomPct}%` }} dangerouslySetInnerHTML={{ __html: ensureHtml(preview) }} />
              ) : (
                <p className="text-sm text-neutral-400">양식을 선택하세요.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button
            onClick={issue}
            disabled={!tpl}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            발행
          </button>
        </div>
      </div>
    </div>
  );
}
