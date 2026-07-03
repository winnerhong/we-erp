import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureAdmin } from "@/lib/auth-guard";
import { CloseClient, type LockInfo } from "./close-client";
import type { PeriodLockRow } from "@/lib/supabase/database.types";

export const metadata = { title: "결산 마감" };

export default async function ClosePage() {
  const g = await ensureAdmin();
  if (g.error) redirect("/");

  const supabase = await createClient();
  const [{ data: companyData }, { data: lockData }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("is_active", true).order("name"),
    supabase.from("period_locks").select("*"),
  ]);
  const companies = (companyData ?? []) as { id: string; name: string }[];

  // 최근 12개월(현재월 → 과거)
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const locks: Record<string, LockInfo> = {};
  for (const l of (lockData ?? []) as PeriodLockRow[]) {
    locks[`${l.company_id}:${l.period}`] = { by: l.locked_by_name, at: l.created_at };
  }

  return <CloseClient companies={companies} months={months} locks={locks} />;
}
