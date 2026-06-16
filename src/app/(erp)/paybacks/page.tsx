import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { PaybacksClient, type PaybackView } from "./paybacks-client";
import type { PaybackRow } from "@/lib/supabase/database.types";

export const metadata = { title: "페이백" };

export default async function PaybacksPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);

  let pbQuery = supabase.from("paybacks").select("*").order("created_at", { ascending: false });
  if (filter) pbQuery = pbQuery.eq("company_id", filter);
  const { data: pbData, error } = await pbQuery;
  if (error) {
    return <p className="text-sm text-red-600">페이백을 불러오지 못했습니다: {error.message}</p>;
  }
  const paybacks = (pbData ?? []) as PaybackRow[];

  // 이름·거래일 보강
  const [{ data: parts }, { data: emps }] = await Promise.all([
    supabase.from("partners").select("id, name"),
    supabase.from("employees").select("id, name"),
  ]);
  const pName = new Map(((parts ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const eName = new Map(((emps ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));

  const txnIds = [...new Set(paybacks.map((p) => p.bank_transaction_id).filter((v): v is string => !!v))];
  const txnDate = new Map<string, string>();
  const txnDesc = new Map<string, string>();
  if (txnIds.length > 0) {
    const { data: txns } = await supabase
      .from("bank_transactions")
      .select("id, txn_date, description")
      .in("id", txnIds);
    for (const t of (txns ?? []) as { id: string; txn_date: string; description: string | null }[]) {
      txnDate.set(t.id, t.txn_date);
      txnDesc.set(t.id, t.description ?? "");
    }
  }

  const views: PaybackView[] = paybacks.map((p) => ({
    ...p,
    recipientName:
      p.recipient_type === "EMPLOYEE"
        ? eName.get(p.employee_id ?? "") ?? "(직원)"
        : pName.get(p.partner_id ?? "") ?? "(거래처)",
    sourceDate: p.bank_transaction_id ? txnDate.get(p.bank_transaction_id) ?? null : null,
    sourceDesc: p.bank_transaction_id ? txnDesc.get(p.bank_transaction_id) ?? "" : "",
  }));

  return <PaybacksClient rows={views} />;
}
