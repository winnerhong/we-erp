"use server";

import { revalidatePath } from "next/cache";
import { ensureAdmin } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
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

// 직원 전환 로그인(임퍼소네이트)은 새 탭에서 열기 위해 GET 라우트로 이동:
//   src/app/(erp)/employees/impersonate/[id]/route.ts

/** 직원 매니저(부서장) 지정/해제 — 업무 배정 권한. */
export async function setEmployeeManager(employeeId: string, isManager: boolean): Promise<AccountResult> {
  const g = await ensureAdmin();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("employees").update({ is_manager: isManager } as never).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/calendar");
  return { ok: true };
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
