"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { IMPORT_SPECS, type ImportKind, type ImportCtx } from "@/lib/import-specs";

const PATH: Record<ImportKind, string> = {
  companies: "/companies",
  partners: "/partners",
  employees: "/employees",
  accounts: "/accounts",
};

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** 단건 생성. */
export async function createRow(
  kind: ImportKind,
  value: Record<string, unknown>
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from(IMPORT_SPECS[kind].table).insert(value as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH[kind]);
  revalidatePath("/");
  return { ok: true };
}

/** 단건 수정. */
export async function updateRow(
  kind: ImportKind,
  id: string,
  value: Record<string, unknown>
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from(IMPORT_SPECS[kind].table)
    .update(value as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH[kind]);
  return { ok: true };
}

/** 활성/비활성 토글 (soft). */
export async function setRowActive(
  kind: ImportKind,
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  return updateRow(kind, id, { is_active: isActive });
}

/** 완전 삭제 (참조 무결성은 FK에 위임). */
export async function deleteRow(
  kind: ImportKind,
  id: string
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from(IMPORT_SPECS[kind].table).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH[kind]);
  revalidatePath("/");
  return { ok: true };
}

export interface BulkResult {
  inserted: number;
  failed: { row: number; error: string }[];
}

/**
 * CSV 일괄등록. 클라이언트 미리보기를 신뢰하지 않고 서버에서 재검증한다.
 * rawRows = CSV 파싱된 원본 행(헤더→값 맵) 배열.
 */
export async function bulkImport(
  kind: ImportKind,
  rawRows: Record<string, string>[]
): Promise<BulkResult> {
  const g = await ensureAdmin();
  if (g.error) return { inserted: 0, failed: [{ row: 0, error: g.error }] };
  const spec = IMPORT_SPECS[kind];

  // 검증용 컨텍스트 (사업자명→id, 계정코드→id 해소)
  const supabase = await createClient();
  const [{ data: companies }, { data: accounts }] = await Promise.all([
    supabase.from("companies").select("id, name"),
    supabase.from("accounts").select("id, code, name"),
  ]);
  const ctx: ImportCtx = {
    companies: (companies ?? []) as ImportCtx["companies"],
    accounts: (accounts ?? []) as ImportCtx["accounts"],
  };

  const toInsert: Record<string, unknown>[] = [];
  const failed: { row: number; error: string }[] = [];
  rawRows.forEach((raw, i) => {
    const res = spec.validate(raw, ctx);
    if (res.ok) toInsert.push(res.value);
    else failed.push({ row: i + 2, error: res.error }); // +2: 헤더(1) + 1-base
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const db = createAdminClient();
    const { error, count } = await db
      .from(spec.table)
      .insert(toInsert as never[], { count: "exact" });
    if (error) {
      // 일괄 실패 시 전부 실패로 보고
      rawRows.forEach((_, i) => failed.push({ row: i + 2, error: error.message }));
    } else {
      inserted = count ?? toInsert.length;
    }
  }

  revalidatePath(PATH[kind]);
  revalidatePath("/");
  return { inserted, failed };
}

// ---------- 관리형 드롭다운 옵션(고용형태·권한·거래처 구분 등) ----------
export interface OptResult {
  ok: boolean;
  error?: string;
}

/** 옵션 추가. value 는 label 로 자동 생성. */
export async function addFieldOption(
  category: string,
  label: string,
  color: string
): Promise<OptResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const value = label.trim();
  if (!value) return { ok: false, error: "이름을 입력하세요" };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("field_options")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;

  const db = createAdminClient();
  const { error } = await db.from("field_options").insert({
    category,
    value,
    label: value,
    color,
    sort_order: nextOrder,
  } as never);
  if (error)
    return { ok: false, error: /duplicate|unique/i.test(error.message) ? "이미 있는 항목입니다" : error.message };
  revalidatePath("/employees");
  revalidatePath("/partners");
  return { ok: true };
}

export async function updateFieldOption(
  id: string,
  patch: { label?: string; color?: string; is_active?: boolean; link_type?: string | null }
): Promise<OptResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("field_options").update(patch as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/partners");
  revalidatePath("/bank");
  return { ok: true };
}

/** 카테고리 내 옵션 순서 재정렬. orderedIds 순서대로 sort_order(1..n) 부여. */
export async function reorderFieldOptions(
  category: string,
  orderedIds: string[]
): Promise<OptResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 같은 카테고리 항목만 차례대로 갱신
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from("field_options")
      .update({ sort_order: i + 1 } as never)
      .eq("id", orderedIds[i])
      .eq("category", category);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/employees");
  revalidatePath("/partners");
  return { ok: true };
}

export async function deleteFieldOption(id: string): Promise<OptResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("field_options").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/partners");
  return { ok: true };
}
