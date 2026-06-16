"use client";

import { useTransition } from "react";
import { setActiveCompany } from "@/app/actions/set-company";
import { ALL_COMPANIES } from "@/lib/company-constants";

interface Props {
  activeId: string;
  companies: { id: string; name: string }[];
}

export function CompanySelector({ activeId, companies }: Props) {
  const [pending, startTransition] = useTransition();

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
      <option value={ALL_COMPANIES}>전체 사업자 (합산)</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
