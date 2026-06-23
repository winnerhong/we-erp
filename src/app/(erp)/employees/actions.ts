"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureAdmin } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runTeacherSync, type SyncResult } from "@/lib/wks-sync";
import { importTeacherAccounts, empEmail, type AccountImportResult } from "@/lib/account-sync";
import type { AppRole } from "@/lib/supabase/database.types";

export type { SyncResult } from "@/lib/wks-sync";
export type { AccountImportResult } from "@/lib/account-sync";

/** winner-kids 강사 → 직원 동기화(관리자). 미배정(공용)으로 들어옴. */
export async function importTeachersFromWks(): Promise<SyncResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error, counts: {}, total: 0, skipped: [] };
  const res = await runTeacherSync();
  if (res.ok) {
    revalidatePath("/employees");
    revalidatePath("/");
  }
  return res;
}

/** winner-kids 강사 로그인 계정(아이디/비번) → 직원 계정으로 가져오기(관리자). */
export async function importTeacherAccountsFromWks(): Promise<AccountImportResult> {
  const g = await ensureAdmin();
  if (g.error)
    return { ok: false, error: g.error, created: 0, linked: 0, skipped: 0, failed: [] };
  const res = await importTeacherAccounts();
  if (res.ok) revalidatePath("/employees");
  return res;
}

export interface AccountResult {
  ok: boolean;
  error?: string;
}

/**
 * 직원 계정으로 전환 로그인(관리자 임퍼소네이트).
 * 매직링크 토큰을 생성해 현재 세션을 그 직원으로 교체 → /me 로 이동.
 * 관리자 화면으로 돌아가려면 로그아웃 후 본인 계정으로 다시 로그인.
 */
export async function loginAsEmployee(employeeId: string): Promise<{ error?: string }> {
  const g = await ensureAdmin();
  if (g.error) return { error: g.error };
  const admin = createAdminClient();

  const { data: emp } = await admin.from("employees").select("profile_id").eq("id", employeeId).maybeSingle();
  const profileId = (emp as { profile_id: string | null } | null)?.profile_id;
  if (!profileId) return { error: "이 직원은 로그인 계정이 없습니다. 먼저 ‘계정·비번’으로 발급하세요." };

  const { data: prof } = await admin.from("profiles").select("email").eq("id", profileId).maybeSingle();
  const email = (prof as { email: string | null } | null)?.email;
  if (!email) return { error: "계정 이메일을 찾을 수 없습니다." };

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (lErr || !tokenHash) return { error: lErr?.message ?? "로그인 토큰 생성 실패" };

  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (vErr) return { error: vErr.message };

  redirect("/me");
}

/** 직원에게 로그인 계정 발급(아이디·비번). 가상 이메일로 합성. */
export async function issueEmployeeAccount(
  employeeId: string,
  username: string,
  password: string,
  role: AppRole
): Promise<AccountResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const uname = username.trim();
  if (!uname) return { ok: false, error: "아이디를 입력하세요" };
  if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다" };

  const db = createAdminClient();

  // 직원 확인 + 이미 계정 있는지
  const { data: emp } = await db
    .from("employees")
    .select("id, profile_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "직원을 찾을 수 없습니다" };
  if ((emp as { profile_id: string | null }).profile_id)
    return { ok: false, error: "이미 계정이 있는 직원입니다" };

  // 아이디 중복 확인
  const { data: dup } = await db.from("profiles").select("id").eq("username", uname).maybeSingle();
  if (dup) return { ok: false, error: "이미 사용 중인 아이디입니다" };

  const email = empEmail(employeeId);
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created?.user) return { ok: false, error: cErr?.message ?? "계정 생성 실패" };
  const uid = created.user.id;

  const { error: pErr } = await db.from("profiles").insert({
    id: uid,
    email,
    username: uname,
    role,
    is_active: true,
  } as never);
  if (pErr) {
    await db.auth.admin.deleteUser(uid);
    return { ok: false, error: pErr.message };
  }
  await db.from("employees").update({ profile_id: uid } as never).eq("id", employeeId);
  revalidatePath("/employees");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 직원 계정 비밀번호 재설정(관리자). */
export async function resetEmployeePassword(profileId: string, password: string): Promise<AccountResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상이어야 합니다" };
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(profileId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 직원 계정 권한 변경(관리자). */
export async function setEmployeeAccountRole(profileId: string, role: AppRole): Promise<AccountResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role } as never).eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** 직원 계정 해제(계정 삭제 — 직원 정보는 유지). */
export async function revokeEmployeeAccount(profileId: string): Promise<AccountResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  if (g.profile!.id === profileId) return { ok: false, error: "본인 계정은 해제할 수 없습니다" };
  const db = createAdminClient();
  // 계정 삭제 → employees.profile_id 는 FK(on delete set null)로 자동 해제
  const { error } = await db.auth.admin.deleteUser(profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/admin/users");
  return { ok: true };
}
