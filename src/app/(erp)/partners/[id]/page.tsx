import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PartnerDetailClient, type LedgerEntry } from "./detail-client";
import type { PartnerRow } from "@/lib/supabase/database.types";

export const metadata = { title: "거래처 상세" };

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: partner }, { data: companies }, { data: tax }, { data: rcpt }, { data: bank }, { data: buy }] =
    await Promise.all([
      supabase.from("partners").select("*").eq("id", id).maybeSingle(),
      supabase.from("companies").select("id, name"),
      supabase
        .from("tax_invoices")
        .select("id, type, total_amount, status, doc_date, memo")
        .eq("partner_id", id),
      supabase
        .from("receipts")
        .select("id, total_amount, status, doc_date, vendor_name, memo")
        .eq("partner_id", id),
      supabase
        .from("bank_transactions")
        .select("id, txn_date, direction, amount, description, counterparty, memo")
        .eq("partner_id", id),
      supabase
        .from("purchase_requests")
        .select("id, amount, status, product_name, paid_at, created_at")
        .eq("partner_id", id),
    ]);

  if (!partner) notFound();

  type Tax = { id: string; type: string; total_amount: number; status: string; doc_date: string | null; memo: string | null };
  type Rcpt = { id: string; total_amount: number | null; status: string; doc_date: string | null; vendor_name: string | null; memo: string | null };
  type Bank = { id: string; txn_date: string; direction: string; amount: number; description: string | null; counterparty: string | null; memo: string | null };
  type Buy = { id: string; amount: number; status: string; product_name: string | null; paid_at: string | null; created_at: string };

  const taxRows = (tax ?? []) as Tax[];

  // 미수금/미지급: 이 거래처의 세금계산서 중 통장 정산이 안 된 금액
  let receivable = 0;
  let payable = 0;
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

  const entries: LedgerEntry[] = [
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

  return (
    <PartnerDetailClient
      partner={partner as PartnerRow}
      companies={(companies ?? []) as { id: string; name: string }[]}
      entries={entries}
      receivable={receivable}
      payable={payable}
    />
  );
}
