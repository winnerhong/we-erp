"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import { clusterTxns, type ClusterSuggestion } from "@/lib/bank-groups";
import type { BankTxnGroupRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  count?: number;
}

export interface GroupInput {
  name: string;
  match_keys: string[];
  direction: string | null;
  default_partner_id: string | null;
  default_account_id: string | null;
  default_category: string | null;
  color?: string | null;
}

/** id 배열을 청크로 나눠 group_id/기본값 업데이트(.in URL 길이 한도 회피). */
async function updateTxnsInChunks(
  db: ReturnType<typeof createAdminClient>,
  ids: string[],
  patch: Record<string, unknown>
): Promise<string | null> {
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { error } = await db.from("bank_transactions").update(patch as never).in("id", chunk);
    if (error) return error.message;
  }
  return null;
}

export async function createBankGroup(companyId: string | null, input: GroupInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!companyId) return { ok: false, error: "사업자를 먼저 선택하세요 (전체 상태에서는 그룹 생성 불가)" };
  if (!input.name.trim()) return { ok: false, error: "그룹명을 입력하세요" };
  const db = createAdminClient();
  const { data, error } = await db
    .from("bank_txn_groups")
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      match_keys: input.match_keys.map((k) => k.trim()).filter(Boolean),
      direction: input.direction,
      default_partner_id: input.default_partner_id,
      default_account_id: input.default_account_id,
      default_category: input.default_category,
      color: input.color ?? null,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateBankGroup(id: string, input: GroupInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db
    .from("bank_txn_groups")
    .update({
      name: input.name.trim(),
      match_keys: input.match_keys.map((k) => k.trim()).filter(Boolean),
      direction: input.direction,
      default_partner_id: input.default_partner_id,
      default_account_id: input.default_account_id,
      default_category: input.default_category,
      color: input.color ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // 그룹 설정이 바뀌었으니 소속 거래에 재적용
  await applyGroupToMembers(id);
  revalidatePath("/bank");
  return { ok: true };
}

export async function deleteBankGroup(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // group_id 는 FK on delete set null → 거래는 미분류로 돌아감
  const { error } = await db.from("bank_txn_groups").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/** 거래 하나를 그룹에 배정(또는 해제). 배정 시 그룹 기본값(거래처·계정·구분) 자동 채움. */
export async function setTxnGroup(txnId: string, groupId: string | null): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const patch: Record<string, unknown> = { group_id: groupId };
  if (groupId) {
    const { data: grp } = await db
      .from("bank_txn_groups")
      .select("default_partner_id, default_account_id, default_category")
      .eq("id", groupId)
      .maybeSingle();
    const gr = grp as { default_partner_id: string | null; default_account_id: string | null; default_category: string | null } | null;
    if (gr) {
      if (gr.default_partner_id) patch.partner_id = gr.default_partner_id;
      if (gr.default_account_id) patch.account_id = gr.default_account_id;
      if (gr.default_category) patch.category = gr.default_category;
    }
  }
  const { error } = await db.from("bank_transactions").update(patch as never).eq("id", txnId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bank");
  return { ok: true };
}

/**
 * 그룹 기본값을 소속 거래 중 **아직 값이 비어있는(null)** 것에만 채운다.
 * 사용자가 개별 지정한 거래처·계정·구분은 덮어쓰지 않는다(수동 오버라이드 보존).
 */
export async function applyGroupToMembers(groupId: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: grp } = await db.from("bank_txn_groups").select("*").eq("id", groupId).maybeSingle();
  const gr = grp as BankTxnGroupRow | null;
  if (!gr) return { ok: false, error: "그룹을 찾을 수 없습니다" };
  // 필드별로 '비어있는 것만' 채움(.is(field, null))
  const fills: [string, string | null][] = [
    ["partner_id", gr.default_partner_id],
    ["account_id", gr.default_account_id],
    ["category", gr.default_category],
  ];
  for (const [field, value] of fills) {
    if (!value) continue;
    const { error } = await db
      .from("bank_transactions")
      .update({ [field]: value } as never)
      .eq("group_id", groupId)
      .is(field, null);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/bank");
  return { ok: true };
}

/** 미분류 거래를 스캔해 '자동 묶기' 후보(정규화 이름 2건+)를 만든다. */
export async function suggestGroups(
  companyId: string | null
): Promise<{ ok: boolean; error?: string; suggestions?: ClusterSuggestion[] }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const rows: { id: string; description: string | null; counterparty: string | null; direction: string; company_id: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    let q = db
      .from("bank_transactions")
      .select("id, description, counterparty, direction, company_id")
      .is("group_id", null);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  // 상위 80개 후보만(모달 과부하 방지). 사업자별로 분리해 클러스터링.
  const suggestions = clusterTxns(
    rows.map((r) => ({ id: r.id, description: r.description, counterparty: r.counterparty, direction: r.direction, companyId: r.company_id }))
  ).slice(0, 80);
  return { ok: true, suggestions };
}

/** 그룹별 전체 소속 거래 수(관리 모달용, 지연 로드). */
export async function getGroupCounts(ids: string[]): Promise<Record<string, number>> {
  const g = await ensureUser();
  if (g.error || ids.length === 0) return {};
  const db = createAdminClient();
  const out: Record<string, number> = {};
  await Promise.all(
    ids.map(async (id) => {
      const { count } = await db.from("bank_transactions").select("*", { count: "exact", head: true }).eq("group_id", id);
      out[id] = count ?? 0;
    })
  );
  return out;
}

export interface NewGroupFromSuggestion {
  name: string;
  key: string;
  direction: string | null;
  txnIds: string[];
  companyId?: string | null; // 후보의 사업자(clusterTxns가 사업자별로 분리해 채워줌)
}

/**
 * 자동 묶기 후보들을 그룹으로 생성하고 **같은 사업자 거래만** 배정.
 * 부분 실패 시: 방금 만든 빈 그룹은 롤백하고, 그때까지 성공분은 유지 + 재검증 후 오류 반환.
 */
export async function createGroupsFromSuggestions(
  companyId: string | null,
  items: NewGroupFromSuggestion[]
): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  let count = 0;
  for (const it of items) {
    if (!it.name.trim() || it.txnIds.length === 0) continue;
    // 그룹 사업자 = 후보의 사업자 우선(단일 사업자 클러스터), 없으면 활성 사업자, 없으면 첫 거래
    let cid = it.companyId ?? companyId ?? null;
    if (!cid) {
      const { data: first } = await db.from("bank_transactions").select("company_id").eq("id", it.txnIds[0]).maybeSingle();
      cid = (first as { company_id: string } | null)?.company_id ?? null;
    }
    if (!cid) continue;
    const { data: grp, error: gErr } = await db
      .from("bank_txn_groups")
      .insert({ company_id: cid, name: it.name.trim(), match_keys: [it.key], direction: it.direction } as never)
      .select("id")
      .single();
    if (gErr) {
      revalidatePath("/bank");
      return { ok: false, error: gErr.message, count };
    }
    const gid = (grp as { id: string }).id;
    // 클러스터가 사업자별로 분리돼 txnIds 는 모두 cid 사업자 — 그대로 배정
    const uErr = await updateTxnsInChunks(db, it.txnIds, { group_id: gid });
    if (uErr) {
      await db.from("bank_txn_groups").delete().eq("id", gid); // 방금 만든 빈 그룹 롤백
      revalidatePath("/bank");
      return { ok: false, error: uErr, count };
    }
    count++;
  }
  revalidatePath("/bank");
  return { ok: true, count };
}
