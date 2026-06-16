"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRow } from "@/app/(erp)/actions";
import type { ImportKind } from "@/lib/import-specs";

/** 목록에서 바로 수정하는 인라인 셀렉트 (값별 색상 알약). */
export function InlineSelect({
  kind,
  id,
  field,
  value,
  options,
  placeholder,
  tone,
}: {
  kind: ImportKind;
  id: string;
  field: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  tone?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          await updateRow(kind, id, { [field]: v || null });
          router.refresh();
        });
      }}
      className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-medium shadow-sm transition hover:brightness-95 focus:outline-none ${
        tone ?? "border-neutral-200 bg-white text-neutral-700"
      } ${pending ? "opacity-50" : ""}`}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
