"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureCompanyAccess } from "@/lib/auth-guard";
import { availableDelta, totalDelta } from "@/lib/assets";
import type { AssetRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

const int = (v: unknown, def = 0): number => {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : def;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface AssetInput {
  company_id: string | null;
  code?: string | null;
  name: string;
  category?: string | null;
  total_qty?: string | number | null;
  location?: string | null;
  purchase_price?: string | number | null;
  purchase_date?: string | null;
  memo?: string | null;
  // 감가상각(20260729)
  useful_life_months?: string | number | null;
  salvage_value?: string | number | null;
  depreciation_method?: string | null;
}

export async function createAsset(input: AssetInput): Promise<Result> {
  const g = await ensureCompanyAccess(input.company_id ?? null);
  if (g.error) return { ok: false, error: g.error };
  if (!input.name.trim()) return { ok: false, error: "교구명을 입력하세요" };
  const total = Math.max(0, int(input.total_qty, 1));
  const db = createAdminClient();
  const { data, error } = await db.from("assets").insert({
    company_id: input.company_id ?? null,
    code: input.code?.trim() || null,
    name: input.name.trim(),
    category: input.category || null,
    total_qty: total,
    available_qty: total,
    status: "AVAILABLE",
    location: input.location?.trim() || null,
    purchase_price: numOrNull(input.purchase_price),
    purchase_date: input.purchase_date || null,
    memo: input.memo?.trim() || null,
    useful_life_months: numOrNull(input.useful_life_months),
    salvage_value: numOrNull(input.salvage_value),
    depreciation_method: input.depreciation_method || "STRAIGHT",
  } as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateAsset(id: string, input: AssetInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 보유수량 변경 시 가용수량도 차이만큼 보정
  const { data: cur } = await db.from("assets").select("total_qty, available_qty, status").eq("id", id).maybeSingle();
  const c = cur as { total_qty: number; available_qty: number; status: string } | null;
  const newTotal = Math.max(0, int(input.total_qty, c?.total_qty ?? 1));
  const diff = newTotal - (c?.total_qty ?? newTotal);
  const newAvail = Math.max(0, (c?.available_qty ?? newTotal) + diff);
  // 가용 0이어도 '수리중(REPAIR)'은 대여중으로 뒤집지 않고 보존
  const newStatus = newAvail > 0 ? "AVAILABLE" : newTotal <= 0 ? "LOST" : c?.status === "REPAIR" ? "REPAIR" : "RENTED";
  const { error } = await db.from("assets").update({
    code: input.code?.trim() || null,
    name: input.name.trim(),
    category: input.category || null,
    total_qty: newTotal,
    available_qty: newAvail,
    location: input.location?.trim() || null,
    purchase_price: numOrNull(input.purchase_price),
    purchase_date: input.purchase_date || null,
    memo: input.memo?.trim() || null,
    useful_life_months: numOrNull(input.useful_life_months),
    salvage_value: numOrNull(input.salvage_value),
    depreciation_method: input.depreciation_method || "STRAIGHT",
    status: newStatus,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  revalidatePath(`/assets/${id}`);
  return { ok: true };
}

export async function deleteAsset(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

export interface MovementInput {
  asset_id: string;
  type: string;
  qty?: string | number | null;
  partner_id?: string | null;
  employee_id?: string | null;
  txn_date: string;
  due_date?: string | null;
  memo?: string | null;
}

/** 입출고·대여·반납·수리·폐기 기록 → 자산 수량·상태 자동 반영. */
export async function logMovement(input: MovementInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: a } = await db.from("assets").select("*").eq("id", input.asset_id).maybeSingle();
  const asset = a as AssetRow | null;
  if (!asset) return { ok: false, error: "자산을 찾을 수 없습니다" };
  const qty = Math.max(1, int(input.qty, 1));

  const newAvail = Math.max(0, asset.available_qty + availableDelta(input.type, qty));
  const newTotal = Math.max(0, asset.total_qty + totalDelta(input.type, qty));
  let status = "AVAILABLE";
  if (newTotal <= 0) status = "LOST";
  else if (newAvail <= 0) status = input.type === "REPAIR" ? "REPAIR" : "RENTED";

  const { error: mErr } = await db.from("asset_movements").insert({
    company_id: asset.company_id, asset_id: asset.id, type: input.type, qty,
    partner_id: input.partner_id || null, employee_id: input.employee_id || null,
    txn_date: input.txn_date, due_date: input.due_date || null,
    status: input.type === "RENT" ? "OPEN" : "CLOSED", memo: input.memo?.trim() || null,
  } as never);
  if (mErr) return { ok: false, error: mErr.message };

  const { error: uErr } = await db.from("assets").update({
    available_qty: newAvail, total_qty: newTotal, status, updated_at: new Date().toISOString(),
  } as never).eq("id", asset.id);
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  return { ok: true };
}

export async function deleteMovement(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 이동 삭제 시 자산 수량 원복
  const { data: m } = await db.from("asset_movements").select("asset_id, type, qty").eq("id", id).maybeSingle();
  const mv = m as { asset_id: string; type: string; qty: number } | null;
  if (mv) {
    const { data: a } = await db.from("assets").select("total_qty, available_qty").eq("id", mv.asset_id).maybeSingle();
    const asset = a as { total_qty: number; available_qty: number } | null;
    if (asset) {
      const avail = Math.max(0, asset.available_qty - availableDelta(mv.type, mv.qty));
      const total = Math.max(0, asset.total_qty - totalDelta(mv.type, mv.qty));
      const status = total <= 0 ? "LOST" : avail <= 0 ? "RENTED" : "AVAILABLE";
      await db.from("assets").update({ available_qty: avail, total_qty: total, status } as never).eq("id", mv.asset_id);
    }
  }
  const { error } = await db.from("asset_movements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  if (mv) revalidatePath(`/assets/${mv.asset_id}`);
  return { ok: true };
}
