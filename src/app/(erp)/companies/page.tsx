import { createClient } from "@/lib/supabase/server";
import { getImportCtx } from "@/lib/queries";
import { CompaniesClient, type ClientActivity } from "./companies-client";
import type { CompanyRow } from "@/lib/supabase/database.types";

export const metadata = { title: "사업자" };

export default async function CompaniesPage() {
  const supabase = await createClient();
  const [{ data, error }, ctx] = await Promise.all([
    supabase.from("companies").select("*").order("created_at", { ascending: false }),
    getImportCtx(),
  ]);

  if (error) {
    return (
      <p className="text-sm text-red-600">
        데이터를 불러오지 못했습니다: {error.message}
        <br />
        Supabase 환경변수와 마이그레이션 적용 여부를 확인하세요.
      </p>
    );
  }

  const rows = (data ?? []) as CompanyRow[];

  // 수임업체 이번 달 처리 건수(대리 수수료 근거) — 계산서·거래
  const managedIds = rows.filter((r) => r.relation_type === "MANAGED").map((r) => r.id);
  const activity: Record<string, ClientActivity> = {};
  if (managedIds.length > 0) {
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const next = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}-01`;
    for (const id of managedIds) activity[id] = { tax: 0, txn: 0 };
    const [{ data: taxA }, { data: txnA }] = await Promise.all([
      supabase.from("tax_invoices").select("company_id").in("company_id", managedIds).gte("doc_date", first).lt("doc_date", next),
      supabase.from("transactions").select("company_id").in("company_id", managedIds).neq("status", "CANCELED").gte("txn_date", first).lt("txn_date", next),
    ]);
    for (const r of (taxA ?? []) as { company_id: string }[]) if (activity[r.company_id]) activity[r.company_id].tax += 1;
    for (const r of (txnA ?? []) as { company_id: string }[]) if (activity[r.company_id]) activity[r.company_id].txn += 1;
  }

  return <CompaniesClient rows={rows} ctx={ctx} activity={activity} />;
}
