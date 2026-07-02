"use client";

import { useState } from "react";
import { DocumentTemplateEditor } from "@/components/document-template-editor";
import type { DocumentTemplateRow } from "@/lib/supabase/database.types";
import type { IssueOverview } from "./page";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "작성중", cls: "bg-neutral-100 text-neutral-600" },
  ISSUED: { label: "발행", cls: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "서명완료", cls: "bg-emerald-100 text-emerald-700" },
};

export function DocumentsClient({ templates, issues }: { templates: DocumentTemplateRow[]; issues: IssueOverview[] }) {
  // sel: 템플릿 id | "new" | "issues"
  const [sel, setSel] = useState<string>(templates[0]?.id ?? "new");
  const current = templates.find((t) => t.id === sel) ?? null;
  const showEditor = sel !== "issues";

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-neutral-900">서류관리</h1>
        <p className="mt-1 text-sm text-neutral-500">워드처럼 양식을 만들고, 직원·강사에게 발행해 서명본까지 보관합니다.</p>
      </div>

      {/* 양식 탭 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-neutral-200 pb-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setSel(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${sel === t.id ? "bg-indigo-500 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
          >
            {t.name}
          </button>
        ))}
        <button
          onClick={() => setSel("new")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${sel === "new" ? "bg-indigo-500 text-white" : "border border-dashed border-neutral-400 bg-white text-neutral-600 hover:bg-neutral-50"}`}
        >
          ＋ 새 양식
        </button>
        <button
          onClick={() => setSel("issues")}
          className={`ml-auto rounded-lg px-3 py-1.5 text-sm font-medium ${sel === "issues" ? "bg-indigo-500 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
        >
          📋 발행이력 <span className="text-xs opacity-70">{issues.length}</span>
        </button>
      </div>

      {showEditor ? (
        <DocumentTemplateEditor
          key={sel}
          template={sel === "new" ? null : current}
          onSavedNew={(id) => setSel(id)}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {issues.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutral-400">발행된 서류가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">직원</th>
                  <th className="px-4 py-2.5">서류</th>
                  <th className="px-4 py-2.5">상태</th>
                  <th className="px-4 py-2.5">발행일</th>
                  <th className="px-4 py-2.5 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {issues.map((it) => {
                  const st = STATUS[it.status] ?? STATUS.ISSUED;
                  return (
                    <tr key={it.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-medium text-neutral-800">{it.employee_name}</td>
                      <td className="px-4 py-2.5 text-neutral-700">{it.title}</td>
                      <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-2.5 text-neutral-500">{it.issued_on}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => window.open(`/print/document/${it.id}`, "_blank")} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100">
                          🖨 인쇄·PDF
                        </button>
                        {it.signed_file && (
                          <a href={it.signed_file} download={`${it.title}-서명본`} className="ml-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                            ✅ 서명본
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
