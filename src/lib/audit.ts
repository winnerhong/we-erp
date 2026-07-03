// 감사추적(Audit Trail) — 쓰기 액션에서 변경이력을 best-effort 로 기록.
// 실패해도(테이블 미적용 등) 본 작업에 영향을 주지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditActor {
  id: string | null;
  name: string | null;
}

/** ensureUser/ensureAdmin 가드 결과의 profile 로 감사 작성자 구성. */
export function auditActor(profile: { id?: string; username?: string | null; email?: string | null } | null | undefined): AuditActor {
  return { id: profile?.id ?? null, name: profile?.username ?? profile?.email ?? "관리자" };
}

/** 감사 로그 비대화 방지 — data URL(사진 등)·초장문 값은 축약. */
export function redact(v: unknown): unknown {
  if (typeof v === "string") {
    if (v.startsWith("data:")) return "[이미지]";
    if (v.length > 300) return v.slice(0, 300) + "…";
  }
  return v;
}

/** 스냅샷(create/delete)의 값들을 redact 처리한 얕은 복사본. */
export function redactRow(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) out[k] = redact(obj[k]);
  return out;
}

/** 키 순서에 무관한 안정 직렬화 — jsonb 필드(키 순서 다름)의 유령 변경 방지. */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}";
}

/** 수정 전(before) 대비 patch 의 실제 변경 필드만 {from,to} 로 추린다. */
export function diffPatch(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const from = before ? before[k] : undefined;
    const to = patch[k];
    if (stableStringify(from ?? null) !== stableStringify(to ?? null)) {
      out[k] = { from: redact(from ?? null), to: redact(to ?? null) };
    }
  }
  return out;
}

export interface AuditEntry {
  companyId?: string | null;
  actor: AuditActor;
  table: string;
  entityId?: string | null;
  action: AuditAction;
  label?: string | null;
  changes?: unknown;
}

/** 감사 로그 1건 기록(best-effort — 오류는 삼킨다). */
export async function writeAudit(db: Db, e: AuditEntry): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      company_id: e.companyId ?? null,
      actor_id: e.actor.id,
      actor_name: e.actor.name,
      entity_table: e.table,
      entity_id: e.entityId ?? null,
      action: e.action,
      label: e.label ?? null,
      changes: (e.changes ?? null) as never,
    } as never);
  } catch {
    /* best-effort: 감사 실패가 본 작업을 막지 않는다 */
  }
}

/** 값 객체에서 사람이 읽는 라벨 후보를 뽑는다(이름/상호/제목 등). */
export function guessLabel(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  for (const k of ["name", "title", "alias", "product_name", "label"]) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
