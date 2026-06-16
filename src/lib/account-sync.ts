// 직원 로그인 계정 — 가상 이메일 합성 + winner-kids 강사 계정(username/password) 가져오기.
// 서버 전용(service-role). 호출부에서 권한 검증.
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";

/** 아이디 로그인을 위해 합성하는 가상 이메일 도메인(실제 메일 발송 안 함). */
export const SYNTH_DOMAIN = "winner-erp.local";
export const wksEmail = (teacherId: string | number) => `wks_${teacherId}@${SYNTH_DOMAIN}`;
export const empEmail = (employeeId: string) => `emp_${employeeId}@${SYNTH_DOMAIN}`;

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? null : String(v));

export interface AccountImportResult {
  ok: boolean;
  error?: string;
  created: number; // 신규 계정 생성
  linked: number; // 기존 계정에 연결만
  skipped: number; // 이미 계정 있음/아이디·비번 없음/직원 미존재
  failed: { name: string; error: string }[];
}

const empty = (over: Partial<AccountImportResult> = {}): AccountImportResult => ({
  ok: true,
  created: 0,
  linked: 0,
  skipped: 0,
  failed: [],
  ...over,
});

/**
 * winner-kids `teachers`(username/password) → 직원 로그인 계정 일괄 생성.
 *  - 직원(employees, source_ref=wks:teachers:<id>)이 이미 있어야 연결됨(없으면 건너뜀 — 먼저 강사 가져오기).
 *  - 이메일은 가상(wks_<id>@도메인), 아이디=username, 비번=winner-kids 비번 그대로.
 *  - 이미 계정이 연결된 직원/아이디 중복은 건너뜀. 어느 쪽도 삭제하지 않음.
 */
export async function importTeacherAccounts(): Promise<AccountImportResult> {
  const url = process.env.WKS_SUPABASE_URL;
  const key = process.env.WKS_SUPABASE_SERVICE_KEY;
  if (!url || !key) return { ...empty(), ok: false, error: "WKS_SUPABASE_URL/KEY 미설정" };

  const src = createSbClient(url, key, { auth: { persistSession: false } });
  const db = createAdminClient();

  const [{ data: teachers, error: tErr }, { data: emps, error: eErr }] = await Promise.all([
    src.from("teachers").select("id, name, username, password"),
    db.from("employees").select("id, name, profile_id, source_ref").like("source_ref", "wks:teachers:%"),
  ]);
  if (tErr) return { ...empty(), ok: false, error: `강사 조회 실패: ${tErr.message}` };
  if (eErr) return { ...empty(), ok: false, error: `직원 조회 실패: ${eErr.message}` };

  const empBySrc = new Map<string, Row>();
  for (const e of (emps ?? []) as Row[]) empBySrc.set(String(e.source_ref), e);

  const res = empty();
  for (const t of (teachers ?? []) as Row[]) {
    const name = s(t.name) ?? "(이름없음)";
    const username = s(t.username);
    const password = s(t.password);
    const emp = empBySrc.get(`wks:teachers:${t.id}`);

    if (!emp) {
      res.skipped++; // 직원으로 아직 안 들어온 강사 — 먼저 ‘강사 가져오기’ 필요
      continue;
    }
    if (emp.profile_id) {
      res.skipped++; // 이미 계정 연결됨
      continue;
    }
    if (!username || !password) {
      res.skipped++; // winner-kids 에 아이디/비번이 없음
      continue;
    }

    const email = wksEmail(t.id as number);

    // 이미 같은 아이디(username)로 만든 계정이 있으면 연결만
    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) {
      await db.from("employees").update({ profile_id: (existing as { id: string }).id } as never).eq("id", emp.id as string);
      res.linked++;
      continue;
    }

    // 계정 생성
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created?.user) {
      res.failed.push({ name, error: cErr?.message ?? "계정 생성 실패" });
      continue;
    }
    const uid = created.user.id;
    const { error: pErr } = await db.from("profiles").insert({
      id: uid,
      email,
      username,
      name,
      role: "MEMBER",
      is_active: true,
    } as never);
    if (pErr) {
      await db.auth.admin.deleteUser(uid); // 롤백
      res.failed.push({ name, error: pErr.message });
      continue;
    }
    await db.from("employees").update({ profile_id: uid } as never).eq("id", emp.id as string);
    res.created++;
  }

  return res;
}
