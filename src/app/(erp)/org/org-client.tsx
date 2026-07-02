"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { OrgChart, type OrgEmployee, type OrgCompany } from "@/components/org-chart";
import { ALL_COMPANIES } from "@/lib/company-constants";

export function OrgClient({
  companies,
  employees,
  activeId,
}: {
  companies: OrgCompany[];
  employees: OrgEmployee[];
  activeId: string;
}) {
  const [mode, setMode] = useState<"group" | "single">(activeId === ALL_COMPANIES ? "group" : "single");
  const [single, setSingle] = useState<string>(
    activeId !== ALL_COMPANIES ? activeId : companies[0]?.id ?? ""
  );
  const [search, setSearch] = useState("");

  const shown: OrgCompany[] = mode === "group" ? companies : companies.filter((c) => c.id === single);

  return (
    <div>
      <PageHeader
        title="🏢 조직도"
        description="사업자 · 부서 · 직급별 인원 현황"
        actions={
          <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 print:hidden">
            🖨 인쇄
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex rounded-lg border border-neutral-200 bg-white p-1 text-sm">
          {([["group", "🌐 전체 그룹"], ["single", "🏢 사업자별"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1.5 font-medium ${mode === k ? "bg-indigo-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{lbl}</button>
          ))}
        </div>
        {mode === "single" && (
          <select value={single} onChange={(e) => setSingle(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 이름·부서·직책 검색"
          className="ml-auto w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {employees.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">등록된 직원이 없습니다.</p>
      ) : (
        <OrgChart companies={shown} employees={employees} search={search} />
      )}
    </div>
  );
}
