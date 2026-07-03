"use client";

import { useTransition } from "react";
import { setActiveCompany } from "@/app/actions/set-company";
import { ALL_COMPANIES } from "@/lib/company-constants";

interface Props {
  activeId: string;
  companies: { id: string; name: string; relation_type?: string }[];
  restricted?: boolean;
}

export function CompanySelector({ activeId, companies, restricted }: Props) {
  const [pending, startTransition] = useTransition();
  const owned = companies.filter((c) => c.relation_type !== "MANAGED");
  const managed = companies.filter((c) => c.relation_type === "MANAGED");

  return (
    <select
      value={activeId}
      disabled={pending}
      onChange={(e) =>
        startTransition(() => {
          void setActiveCompany(e.target.value);
        })
      }
      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm focus:border-neutral-500 focus:outline-none disabled:opacity-60"
    >
      {/* 제한 사용자는 전체보기 불가(전 회사 데이터 노출 방지) */}
      {!restricted && <option value={ALL_COMPANIES}>전체 사업자 (합산)</option>}
      {managed.length === 0 ? (
        companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))
      ) : (
        <>
          <optgroup label="자사">
            {owned.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label="수임업체 (대리)">
            {managed.map((c) => <option key={c.id} value={c.id}>🤝 {c.name}</option>)}
          </optgroup>
        </>
      )}
    </select>
  );
}
