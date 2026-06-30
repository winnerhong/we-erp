"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";

export interface Result {
  ok: boolean;
  error?: string;
}

export async function assignStaff(contractId: string, employeeId: string, role: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!employeeId) return { ok: false, error: "직원을 선택하세요" };
  const db = createAdminClient();
  const { error } = await db.from("event_staff").upsert({
    contract_id: contractId, employee_id: employeeId, role: role.trim() || null,
  } as never, { onConflict: "contract_id,employee_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events");
  return { ok: true };
}

export async function removeStaff(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("event_staff").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events");
  return { ok: true };
}

/** 행사 진행상태 변경(준비/진행/완료 = contracts.status). */
export async function setEventStatus(contractId: string, status: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("contracts").update({ status, updated_at: new Date().toISOString() } as never).eq("id", contractId).eq("type", "EVENT");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events");
  revalidatePath("/partners");
  return { ok: true };
}
