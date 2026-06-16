import { createClient } from "./supabase/server";
import type { ImportCtx } from "./import-specs";
import type { FieldOptionRow } from "./supabase/database.types";

export interface FieldOption {
  value: string;
  label: string;
  color: string | null;
}

/** 관리형 드롭다운 옵션(고용형태·권한 등)을 카테고리별로. */
export async function getFieldOptions(): Promise<Record<string, FieldOption[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("field_options")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  const out: Record<string, FieldOption[]> = { employment_type: [], role: [] };
  for (const o of (data ?? []) as FieldOptionRow[]) {
    (out[o.category] ??= []).push({ value: o.value, label: o.label, color: o.color });
  }
  return out;
}

/** CSV 일괄등록·폼 셀렉트용 컨텍스트(사업자·계정과목 목록). */
export async function getImportCtx(): Promise<ImportCtx> {
  const supabase = await createClient();
  const [{ data: companies }, { data: accounts }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("is_active", true).order("name"),
    supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code"),
  ]);
  return {
    companies: (companies ?? []) as ImportCtx["companies"],
    accounts: (accounts ?? []) as ImportCtx["accounts"],
  };
}
