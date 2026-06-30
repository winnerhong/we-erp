import { createClient } from "@/lib/supabase/server";
import { getImportCtx } from "@/lib/queries";
import { getCompanyContext, companyFilter } from "@/lib/active-company";
import { PartnersClient, type LedgerEntry } from "./partners-client";
import { toPaybackBrief, type PaybackBrief } from "@/components/payback-list";
import type { PartnerRow, FieldOptionRow, PaybackRow, ContractRow, TransactionRow, SettlementRow, PartnerAttachmentRow } from "@/lib/supabase/database.types";

export const metadata = { title: "거래처" };

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const ctxCompany = await getCompanyContext();
  const filter = companyFilter(ctxCompany);

  let query = supabase.from("partners").select("*").order("name");
  // 특정 사업자 선택 시: 해당 사업자 전용 + 공용(company_id IS NULL) 함께 표시
  if (filter) query = query.or(`company_id.eq.${filter},company_id.is.null`);

  const [{ data, error }, ctx, { data: opts }, { data: empData }] = await Promise.all([
    query,
    getImportCtx(),
    supabase.from("field_options").select("*").eq("category", "partner_category").order("sort_order"),
    supabase.from("employees").select("id, name").eq("is_active", true).order("name"),
  ]);
  const employees = (empData ?? []) as { id: string; name: string }[];
  if (error) {
    return <p className="text-sm text-red-600">데이터를 불러오지 못했습니다: {error.message}</p>;
  }
  const rows = (data ?? []) as PartnerRow[];
  const selectedId = sp.p && rows.some((r) => r.id === sp.p) ? sp.p : rows[0]?.id ?? null;

  // 선택 거래처의 거래원장(통장·계산서·영수증·구매) — 선택된 것만 로드
  let entries: LedgerEntry[] = [];
  let paybacks: PaybackBrief[] = [];
  let contracts: ContractRow[] = [];
  let transactions: TransactionRow[] = [];
  let settlements: SettlementRow[] = [];
  let attachments: PartnerAttachmentRow[] = [];
  let receivable = 0;
  let payable = 0;
  if (selectedId) {
    const [{ data: cData }, { data: tData }, { data: sData }, { data: atData }] = await Promise.all([
      supabase.from("contracts").select("*").eq("partner_id", selectedId).order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").eq("partner_id", selectedId).order("txn_date", { ascending: false }),
      supabase.from("settlements").select("*").eq("partner_id", selectedId).order("created_at", { ascending: false }),
      supabase.from("partner_attachments").select("*").eq("partner_id", selectedId).order("created_at", { ascending: false }),
    ]);
    contracts = (cData ?? []) as ContractRow[];
    transactions = (tData ?? []) as TransactionRow[];
    settlements = (sData ?? []) as SettlementRow[];
    attachments = (atData ?? []) as PartnerAttachmentRow[];
    const [{ data: tax }, { data: rcpt }, { data: bank }, { data: buy }] = await Promise.all([
      supabase.from("tax_invoices").select("id, type, total_amount, status, doc_date, memo").eq("partner_id", selectedId),
      supabase.from("receipts").select("id, total_amount, status, doc_date, vendor_name, memo").eq("partner_id", selectedId),
      supabase
        .from("bank_transactions")
        .select("id, txn_date, direction, amount, description, counterparty, memo")
        .eq("partner_id", selectedId),
      supabase
        .from("purchase_requests")
        .select("id, amount, status, product_name, paid_at, created_at")
        .eq("partner_id", selectedId),
    ]);

    type Tax = { id: string; type: string; total_amount: number; status: string; doc_date: string | null; memo: string | null };
    type Rcpt = { id: string; total_amount: number | null; status: string; doc_date: string | null; vendor_name: string | null; memo: string | null };
    type Bank = { id: string; txn_date: string; direction: string; amount: number; description: string | null; counterparty: string | null; memo: string | null };
    type Buy = { id: string; amount: number; status: string; product_name: string | null; paid_at: string | null; created_at: string };
    const taxRows = (tax ?? []) as Tax[];

    const invoiceIds = taxRows.map((t) => t.id);
    if (invoiceIds.length > 0) {
      const { data: links } = await supabase
        .from("bank_transactions")
        .select("tax_invoice_id")
        .in("tax_invoice_id", invoiceIds);
      const settled = new Set(((links ?? []) as { tax_invoice_id: string }[]).map((l) => l.tax_invoice_id));
      for (const t of taxRows) {
        if (settled.has(t.id)) continue;
        if (t.type === "SALES") receivable += t.total_amount;
        else payable += t.total_amount;
      }
    }

    entries = [
      ...taxRows.map((t) => ({
        id: `tax:${t.id}`,
        date: t.doc_date ?? "",
        source: "세금계산서" as const,
        direction: (t.type === "SALES" ? "IN" : "OUT") as "IN" | "OUT",
        amount: t.total_amount,
        status: t.status === "DONE" ? (t.type === "SALES" ? "발행완료" : "수취완료") : "미완료",
        pending: t.status !== "DONE",
        note: t.memo ?? "",
      })),
      ...((rcpt ?? []) as Rcpt[]).map((r) => ({
        id: `rcpt:${r.id}`,
        date: r.doc_date ?? "",
        source: "영수증" as const,
        direction: "OUT" as const,
        amount: r.total_amount ?? 0,
        status: r.status === "CONFIRMED" ? "검수완료" : "검수전",
        pending: r.status !== "CONFIRMED",
        note: r.vendor_name ?? r.memo ?? "",
      })),
      ...((bank ?? []) as Bank[]).map((b) => ({
        id: `bank:${b.id}`,
        date: b.txn_date,
        source: "통장" as const,
        direction: b.direction as "IN" | "OUT",
        amount: b.amount,
        status: "",
        pending: false,
        note: b.description || b.counterparty || b.memo || "",
      })),
      ...((buy ?? []) as Buy[]).map((p) => ({
        id: `buy:${p.id}`,
        date: (p.paid_at ?? p.created_at ?? "").slice(0, 10),
        source: "구매" as const,
        direction: "OUT" as const,
        amount: p.amount,
        status: p.status === "PURCHASED" ? "결제완료" : "미결제",
        pending: p.status !== "PURCHASED",
        note: p.product_name ?? "",
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // 페이백 — 이 거래처가 받는(또는 받을) 페이백
    const { data: pb } = await supabase
      .from("paybacks")
      .select("*")
      .eq("partner_id", selectedId)
      .order("created_at", { ascending: false });
    const pbRows = (pb ?? []) as PaybackRow[];
    const pbTxnIds = [...new Set(pbRows.map((p) => p.bank_transaction_id).filter((v): v is string => !!v))];
    const pbDate = new Map<string, string>();
    const pbDesc = new Map<string, string>();
    if (pbTxnIds.length > 0) {
      const { data: t } = await supabase
        .from("bank_transactions")
        .select("id, txn_date, description")
        .in("id", pbTxnIds);
      for (const r of (t ?? []) as { id: string; txn_date: string; description: string | null }[]) {
        pbDate.set(r.id, r.txn_date);
        pbDesc.set(r.id, r.description ?? "");
      }
    }
    paybacks = pbRows.map((p) => toPaybackBrief(p, pbDate, pbDesc));
  }

  return (
    <PartnersClient
      rows={rows}
      ctx={ctx}
      activeCompanyId={filter}
      options={(opts ?? []) as FieldOptionRow[]}
      selectedId={selectedId}
      entries={entries}
      paybacks={paybacks}
      contracts={contracts}
      transactions={transactions}
      settlements={settlements}
      attachments={attachments}
      employees={employees}
      receivable={receivable}
      payable={payable}
    />
  );
}
