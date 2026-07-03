import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { ProfileRow, EmployeeRow } from "./supabase/database.types";

/** 현재 로그인 사용자의 프로필(없으면 null). */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export interface Guard {
  profile?: ProfileRow;
  error?: string;
}

/** 로그인 + 활성 사용자 보장. 서버액션 맨 앞에서 호출. */
export async function ensureUser(): Promise<Guard> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "로그인이 필요합니다" };
  if (!profile.is_active) return { error: "비활성화된 계정입니다" };
  return { profile };
}

/** 관리자(ADMIN) 보장. */
export async function ensureAdmin(): Promise<Guard> {
  const g = await ensureUser();
  if (g.error) return g;
  if (g.profile!.role !== "ADMIN") return { error: "관리자 권한이 필요합니다" };
  return g;
}

/** 회사 접근 권한 보장(쓰기 심층방어).
 *  ADMIN·공용(null)은 통과. 배정이 하나도 없는 사용자도 통과(하위호환). 배정이 있으면 해당 회사 멤버여야. */
export async function ensureCompanyAccess(companyId: string | null | undefined): Promise<Guard> {
  const g = await ensureUser();
  if (g.error) return g;
  if (g.profile!.role === "ADMIN" || !companyId) return g;
  const db = createAdminClient();
  const { count } = await db.from("user_companies").select("id", { count: "exact", head: true }).eq("user_id", g.profile!.id);
  if ((count ?? 0) === 0) return g; // 미배정 → 하위호환(제한 없음)
  const { data: member } = await db
    .from("user_companies")
    .select("id")
    .eq("user_id", g.profile!.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!member) return { error: "이 사업자에 대한 접근 권한이 없습니다." };
  return g;
}

export interface SelfGuard {
  profile?: ProfileRow;
  employee?: EmployeeRow;
  error?: string;
}

/** 로그인 사용자 ↔ 본인 직원 레코드 해소. 직원 셀프 서비스(/me) 액션·페이지 전용.
 *  본인 employee 가 없으면 error. 반환된 employee.id 로만 데이터를 다뤄 남의 정보 접근을 막는다. */
export async function ensureSelf(): Promise<SelfGuard> {
  const g = await ensureUser();
  if (g.error) return { error: g.error };
  const db = createAdminClient();
  const { data } = await db
    .from("employees")
    .select("*")
    .eq("profile_id", g.profile!.id)
    .maybeSingle();
  const employee = data as EmployeeRow | null;
  if (!employee) return { profile: g.profile, error: "연결된 직원 정보가 없습니다. 관리자에게 문의하세요." };
  return { profile: g.profile, employee };
}
