"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";
import type { AppRole } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
}

/** 사용자의 담당 사업자(회사 멤버십) 설정. 기존 배정을 교체. 빈 배열=전체 접근(하위호환).
 *  원자성 근사: 새 멤버십을 먼저 upsert 하고, 성공한 뒤에만 목록에 없는 기존 것을 삭제한다.
 *  (insert 실패로 0건이 되어 '전체 접근'으로 오히려 권한이 넓어지는 것을 방지) */
export async function setUserCompanies(userId: string, companyIds: string[]): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (ids.length > 0) {
    const rows = ids.map((cid) => ({ user_id: userId, company_id: cid }));
    const { error } = await db.from("user_companies").upsert(rows as never[], { onConflict: "user_id,company_id" });
    if (error) return { ok: false, error: error.message };
    // 새 목록에 없는 기존 배정만 삭제
    const { error: dErr } = await db.from("user_companies").delete().eq("user_id", userId).not("company_id", "in", `(${ids.join(",")})`);
    if (dErr) return { ok: false, error: dErr.message };
  } else {
    // 전체 접근으로 되돌림(명시적 초기화)
    const { error } = await db.from("user_companies").delete().eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 직원 계정 발급(관리자). */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: AppRole
): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (!email.trim() || password.length < 6)
    return { ok: false, error: "이메일과 6자 이상 비밀번호를 입력하세요" };

  const db = createAdminClient();
  const { data, error } = await db.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  const { error: pErr } = await db.from("profiles").insert({
    id: data.user.id,
    email: email.trim(),
    name: name.trim() || null,
    role,
  } as never);
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRole(id: string, role: AppRole): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(id: string, isActive: boolean): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ is_active: isActive } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 계정 완전 삭제(인증 + 프로필). */
export async function deleteUser(id: string): Promise<Result> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (g.profile!.id === id) return { ok: false, error: "본인 계정은 삭제할 수 없습니다" };
  const db = createAdminClient();
  const { error } = await db.auth.admin.deleteUser(id); // 프로필은 FK cascade
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
