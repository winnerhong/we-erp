import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { kstToday } from "@/lib/attendance";
import { SessionsClient, type SessionItem } from "./sessions-client";
import type { TransactionRow } from "@/lib/supabase/database.types";

export const metadata = { title: "수업 현황" };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : kstToday();

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let q = supabase.from("transactions").select("*").eq("type", "CLASS").eq("txn_date", date);
  if (filter) q = q.eq("company_id", filter);
  const { data: tData } = await q;
  const txns = (tData ?? []) as TransactionRow[];

  // 기관·강사 이름
  const partnerIds = [...new Set(txns.map((t) => t.partner_id))];
  const empIds = [...new Set(txns.map((t) => t.instructor_id).filter((v): v is string => !!v))];
  const [{ data: pData }, { data: eData }] = await Promise.all([
    partnerIds.length ? supabase.from("partners").select("id, name").in("id", partnerIds) : Promise.resolve({ data: [] }),
    empIds.length ? supabase.from("employees").select("id, name").in("id", empIds) : Promise.resolve({ data: [] }),
  ]);
  const pName = new Map(((pData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const eName = new Map(((eData ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));

  const sessions: SessionItem[] = txns
    .map((t) => ({
      id: t.id, partnerName: pName.get(t.partner_id) ?? "", title: t.title,
      instructorName: t.instructor_id ? eName.get(t.instructor_id) ?? null : null,
      status: t.status, presentCount: t.present_count, progressNote: t.progress_note,
      completedAt: t.completed_at,
    }))
    .sort((a, b) => (a.instructorName ?? "").localeCompare(b.instructorName ?? "") || a.partnerName.localeCompare(b.partnerName));

  return <SessionsClient date={date} sessions={sessions} />;
}
