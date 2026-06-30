// winner-kids(이벤트 Supabase) → 거래처 동기화 코어.
// 서버 액션과 크론 API 라우트가 공유. (인증은 호출부에서 처리)
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { normalizeBizNo } from "./validation";

export type SyncKind = "협력사" | "기관" | "장소";
export const ALL_KINDS: SyncKind[] = ["협력사", "기관", "장소"];

/** 종류 → 소스 테이블 */
const SOURCE_TABLE: Record<SyncKind, string> = {
  협력사: "partners",
  기관: "schools",
  장소: "locations",
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? null : String(v));
const biz = (v: unknown) => (v ? normalizeBizNo(String(v)) : null);
const clean = (parts: (string | null)[], sep = " / ") =>
  parts.map((p) => (p ?? "").toString().trim()).filter(Boolean).join(sep) || null;

/** 소스 한 행 → 거래처 행 매핑 (종류별) */
function mapRow(kind: SyncKind, r: Row): Row {
  const base = { category: kind, company_id: null, is_active: true, source_ref: "" };
  if (kind === "협력사") {
    return {
      ...base,
      name: s(r.company_name) ?? "(이름없음)",
      contact_name: s(r.representative),
      phone: s(r.phone),
      biz_no: biz(r.business_number),
      email: s(r.email),
      memo: clean([s(r.specialty), s(r.activity_region), s(r.note)]),
      source_ref: `wks:partners:${r.id}`,
    };
  }
  if (kind === "기관") {
    return {
      ...base,
      name: s(r.name) ?? "(이름없음)",
      contact_name: s(r.representative),
      phone: s(r.phone),
      biz_no: biz(r.business_number),
      email: null,
      memo: clean([s(r.district), s(r.address), s(r.note)], " "),
      source_ref: `wks:schools:${r.id}`,
    };
  }
  // 장소 (locations)
  return {
    ...base,
    name: s(r.name) ?? "(이름없음)",
    contact_name: s(r.manager_name),
    phone: s(r.phone),
    biz_no: biz(r.business_number),
    email: s(r.manager_email),
    memo: clean([s(r.district), s(r.address), s(r.note)], " "),
    source_ref: `wks:locations:${r.id}`,
  };
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  counts: Record<string, number>;
  total: number;
  skipped: string[];
}

/** 지정한 종류들을 소스에서 가져와 거래처로 upsert. */
export async function runWksSync(kinds: SyncKind[] = ALL_KINDS): Promise<SyncResult> {
  const url = process.env.WKS_SUPABASE_URL;
  const key = process.env.WKS_SUPABASE_SERVICE_KEY;
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  if (!url || !key)
    return { ok: false, error: "WKS_SUPABASE_URL/KEY 미설정", counts, total: 0, skipped };

  const src = createSbClient(url, key, { auth: { persistSession: false } });

  // 종류별 조회 (없는 테이블/권한오류는 건너뜀)
  const results = await Promise.all(
    kinds.map(async (k) => {
      const { data, error } = await src.from(SOURCE_TABLE[k]).select("*");
      return { kind: k, data: (data ?? []) as Row[], error };
    })
  );

  const mapped: Row[] = [];
  for (const { kind, data, error } of results) {
    if (error) {
      skipped.push(kind);
      counts[kind] = 0;
      continue;
    }
    counts[kind] = data.length;
    for (const r of data) mapped.push(mapRow(kind, r));
  }

  if (mapped.length === 0) return { ok: true, counts, total: 0, skipped };

  const db = createAdminClient();
  const { error } = await db
    .from("partners")
    .upsert(mapped as never[], { onConflict: "source_ref" });
  if (error) return { ok: false, error: `저장 실패: ${error.message}`, counts, total: 0, skipped };

  return { ok: true, counts, total: mapped.length, skipped };
}

// 양방향 동기화 대상 공통 필드 (winner-kids teachers 에 실제 존재하는 칸만)
const SHARED_FIELDS = ["name", "phone", "email"] as const;

/**
 * winner-kids `teachers`(강사) ↔ 직원(employees) **양방향** 동기화.
 *  - 공통 필드(이름·연락처·이메일): 3-way 병합. ERP/원본 어느 쪽이 바뀌었는지
 *    마지막 스냅샷과 비교 → 바뀐 쪽 값을 반대편에 반영. 양쪽 다 바뀌면 ERP 우선.
 *  - ERP 전용(소속·고용형태·권한·급여·입사일·메모): 원본에 없는 칸 → 동기화가 건드리지 않음.
 *  - 신규 강사: 직원으로 생성(미배정/프리랜서/직원).
 *  - 어느 쪽에서도 삭제는 하지 않음.
 */
export async function runTeacherSync(): Promise<SyncResult> {
  const url = process.env.WKS_SUPABASE_URL;
  const key = process.env.WKS_SUPABASE_SERVICE_KEY;
  const counts: Record<string, number> = { 생성: 0, "원본→ERP": 0, "ERP→원본": 0, 충돌: 0 };
  const skipped: string[] = [];
  if (!url || !key)
    return { ok: false, error: "WKS_SUPABASE_URL/KEY 미설정", counts, total: 0, skipped };

  const src = createSbClient(url, key, { auth: { persistSession: false } });
  const db = createAdminClient();

  const [{ data: teachers, error: tErr }, { data: emps, error: eErr }] = await Promise.all([
    src.from("teachers").select("*"),
    db.from("employees").select("*").like("source_ref", "wks:teachers:%"),
  ]);
  if (tErr) return { ok: false, error: `강사 조회 실패: ${tErr.message}`, counts, total: 0, skipped };
  if (eErr) return { ok: false, error: `직원 조회 실패: ${eErr.message}`, counts, total: 0, skipped };

  const empBySrc = new Map<string, Row>();
  for (const e of (emps ?? []) as Row[]) empBySrc.set(String(e.source_ref), e);

  let processed = 0;
  for (const t of (teachers ?? []) as Row[]) {
    processed++;
    const srcRef = `wks:teachers:${t.id}`;
    const emp = empBySrc.get(srcRef);

    // 신규 → 직원 생성
    if (!emp) {
      const snapshot: Record<string, string | null> = {};
      for (const f of SHARED_FIELDS) snapshot[f] = s(t[f]);
      const ins = await db.from("employees").insert({
        company_id: null,
        name: s(t.name) ?? "(이름없음)",
        phone: s(t.phone),
        email: s(t.email),
        employment_type: "FREELANCER",
        role: "STAFF",
        memo: clean([s(t.specialty), s(t.note)]),
        is_active: true,
        source_ref: srcRef,
        sync_snapshot: snapshot,
      } as never);
      if (!ins.error) counts.생성++;
      continue;
    }

    // 기존 → 공통 필드 3-way 병합
    const snap = (emp.sync_snapshot as Record<string, string | null> | null) ?? {};
    const erpPatch: Record<string, string | null> = {};
    const wksPatch: Record<string, string | null> = {};
    const newSnap: Record<string, string | null> = {};
    let pulled = false, pushed = false, conflict = false;

    const hasSnap = emp.sync_snapshot != null;
    for (const f of SHARED_FIELDS) {
      const e = s(emp[f]);
      const w = s(t[f]);
      const sv = snap[f] ?? null;
      if (e === w) { newSnap[f] = e; continue; }
      if (!hasSnap) {
        // 첫 동기화: 기준 스냅샷이 없으므로 원본(winner-kids)을 기준으로 맞춤
        erpPatch[f] = w; newSnap[f] = w; pulled = true;
        continue;
      }
      const eChanged = e !== sv;
      const wChanged = w !== sv;
      if (eChanged && !wChanged) {
        wksPatch[f] = e; newSnap[f] = e; pushed = true;        // ERP→원본
      } else if (!eChanged && wChanged) {
        erpPatch[f] = w; newSnap[f] = w; pulled = true;        // 원본→ERP
      } else {
        // 양쪽 다 변경 → ERP 우선
        wksPatch[f] = e; newSnap[f] = e; conflict = true;
      }
    }

    if (Object.keys(wksPatch).length > 0) {
      await src.from("teachers").update(wksPatch as never).eq("id", t.id);
    }
    // 스냅샷은 항상 최신값으로 갱신
    erpPatch.sync_snapshot = newSnap as never;
    await db.from("employees").update(erpPatch as never).eq("id", emp.id as string);

    if (conflict) counts.충돌++;
    else if (pulled) counts["원본→ERP"]++;
    else if (pushed) counts["ERP→원본"]++;
  }

  return { ok: true, counts, total: processed, skipped };
}

/** winner-kids `members`(원생) → students upsert (단방향, source_ref 멱등). */
export async function runStudentSync(): Promise<SyncResult> {
  const url = process.env.WKS_SUPABASE_URL;
  const key = process.env.WKS_SUPABASE_SERVICE_KEY;
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  if (!url || !key)
    return { ok: false, error: "WKS_SUPABASE_URL/KEY 미설정", counts, total: 0, skipped };

  const src = createSbClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await src.from("members").select("*");
  if (error) return { ok: false, error: `원생 조회 실패: ${error.message}`, counts, total: 0, skipped };

  const rows = (data ?? []) as Row[];
  const mapped = rows.map((m) => {
    const status = m.is_on_leave
      ? "휴원"
      : m.is_enrolled === false || m.withdrawal_date
        ? "퇴원"
        : "재원";
    return {
      source_ref: `wks:members:${m.id}`,
      company_id: null,
      is_active: true,
      name: s(m.name) ?? "(이름없음)",
      gender: s(m.gender),
      birthday: m.birthday ?? null,
      school: s(m.school),
      grade: s(m.grade),
      class_name: s(m.class_name),
      guardian_name: s(m.guardian_name),
      guardian_phone: s(m.guardian_phone),
      student_phone: s(m.student_phone),
      address: clean([s(m.address1), s(m.address2)], " "),
      status,
      enrollment_date: m.enrollment_date ?? null,
      homeroom_teacher: s(m.homeroom_teacher),
      memo: s(m.memo),
    };
  });
  counts["원생"] = mapped.length;
  if (mapped.length === 0) return { ok: true, counts, total: 0, skipped };

  const db = createAdminClient();
  const { error: upErr } = await db
    .from("students")
    .upsert(mapped as never[], { onConflict: "source_ref" });
  if (upErr) return { ok: false, error: `저장 실패: ${upErr.message}`, counts, total: 0, skipped };

  return { ok: true, counts, total: mapped.length, skipped };
}

const DRIVER_EMP_LABEL: Record<string, string> = {
  full: "정규직",
  contract: "계약직",
  freelance: "프리랜서",
  part: "파트",
};
const DRIVER_STATUS_LABEL: Record<string, string> = {
  active: "근무중",
  leave: "휴직",
  retired: "퇴사",
};

/** winner-kids `drivers`(기사) → drivers upsert (단방향). soft-delete 제외. */
export async function runDriverSync(): Promise<SyncResult> {
  const url = process.env.WKS_SUPABASE_URL;
  const key = process.env.WKS_SUPABASE_SERVICE_KEY;
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  if (!url || !key)
    return { ok: false, error: "WKS_SUPABASE_URL/KEY 미설정", counts, total: 0, skipped };

  const src = createSbClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await src.from("drivers").select("*");
  if (error) return { ok: false, error: `기사 조회 실패: ${error.message}`, counts, total: 0, skipped };

  const rows = (data ?? []) as Row[];
  const mapped = rows
    .filter((d) => !d.deleted_at)
    .map((d) => ({
      source_ref: `wks:drivers:${d.id}`,
      company_id: null,
      is_active: true,
      name: s(d.name) ?? "(이름없음)",
      phone: s(d.phone),
      email: s(d.email),
      birth_date: d.birth_date ?? null,
      address: s(d.address),
      license_number: s(d.license_number),
      license_type: s(d.license_type),
      license_expiry: d.license_expiry ?? null,
      hire_date: d.hire_date ?? null,
      employment_type: DRIVER_EMP_LABEL[String(d.employment_type)] ?? s(d.employment_type),
      status: DRIVER_STATUS_LABEL[String(d.status)] ?? "근무중",
      bank_name: s(d.bank_name),
      bank_account: s(d.bank_account),
      memo: s(d.memo),
    }));
  counts["기사"] = mapped.length;
  if (mapped.length === 0) return { ok: true, counts, total: 0, skipped };

  const db = createAdminClient();
  const { error: upErr } = await db
    .from("drivers")
    .upsert(mapped as never[], { onConflict: "source_ref" });
  if (upErr) return { ok: false, error: `저장 실패: ${upErr.message}`, counts, total: 0, skipped };

  return { ok: true, counts, total: mapped.length, skipped };
}
