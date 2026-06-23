"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin, ensureUser, ensureSelf } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

// ---------------- 양식(템플릿) — 관리자 ----------------

export async function createTemplate(input: { name: string; category?: string | null; body?: string }): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (!input.name.trim()) return { ok: false, error: "양식 이름을 입력하세요." };
  const db = createAdminClient();
  const { data, error } = await db
    .from("document_templates")
    .insert({ name: input.name.trim(), category: input.category ?? null, body: input.body ?? "" } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documents");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateTemplate(id: string, patch: Record<string, unknown>): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("document_templates")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("document_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documents");
  return { ok: true };
}

// ---------------- 발행본 — 관리자/직원 ----------------

interface IssueInput {
  employee_id: string;
  template_id: string | null;
  company_id: string | null;
  title: string;
  rendered_body: string;
  field_values: Record<string, string>;
}

async function insertIssue(input: IssueInput, createdBy: string | null): Promise<Result> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("document_issues")
    .insert({
      employee_id: input.employee_id,
      template_id: input.template_id,
      company_id: input.company_id,
      title: input.title,
      rendered_body: input.rendered_body,
      field_values: input.field_values,
      status: "ISSUED",
      issued_on: todayStr(),
      created_by: createdBy,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** 관리자/직원이 특정 직원에게 서류 발행. */
export async function createIssue(input: IssueInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const res = await insertIssue(input, g.profile!.id);
  if (res.ok) revalidatePath("/documents");
  return res;
}

/** 발행본 서명본 첨부(상태 SIGNED). */
export async function saveSignedFile(id: string, dataUrl: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("document_issues")
    .update({ signed_file: dataUrl, status: "SIGNED", signed_on: todayStr() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteIssue(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("document_issues").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/documents");
  return { ok: true };
}

// ---------------- 발행본 — 강사 본인(/me) ----------------

/** 강사 본인이 자기 앞으로 서류 발행/작성. */
export async function createMyIssue(input: Omit<IssueInput, "employee_id">): Promise<Result> {
  const g = await ensureSelf();
  if (g.error || !g.employee) return { ok: false, error: g.error ?? "직원 정보 없음" };
  const res = await insertIssue({ ...input, employee_id: g.employee.id }, g.profile?.id ?? null);
  if (res.ok) revalidatePath("/me");
  return res;
}

/** 강사 본인 발행본에만 서명본 첨부. */
export async function saveMySignedFile(id: string, dataUrl: string): Promise<Result> {
  const g = await ensureSelf();
  if (g.error || !g.employee) return { ok: false, error: g.error ?? "직원 정보 없음" };
  const db = createAdminClient();
  const { data: row } = await db.from("document_issues").select("employee_id").eq("id", id).maybeSingle();
  if (!row || (row as { employee_id: string }).employee_id !== g.employee.id)
    return { ok: false, error: "본인 서류만 첨부할 수 있습니다." };
  const { error } = await db
    .from("document_issues")
    .update({ signed_file: dataUrl, status: "SIGNED", signed_on: todayStr() } as never)
    .eq("id", id)
    .eq("employee_id", g.employee.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}

/** 강사 본인 발행본만 삭제. */
export async function deleteMyIssue(id: string): Promise<Result> {
  const g = await ensureSelf();
  if (g.error || !g.employee) return { ok: false, error: g.error ?? "직원 정보 없음" };
  const db = createAdminClient();
  const { error } = await db.from("document_issues").delete().eq("id", id).eq("employee_id", g.employee.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true };
}
