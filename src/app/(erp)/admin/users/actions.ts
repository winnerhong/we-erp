"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdmin } from "@/lib/auth-guard";
import type { AppRole } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
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
