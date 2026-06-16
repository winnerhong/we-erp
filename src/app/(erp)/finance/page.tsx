import { createClient } from "@/lib/supabase/server";
import { FinanceClient, type DueItem } from "./finance-client";

export const metadata = { title: "받을돈·줄돈" };

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  // 전 사업자 한눈에 (활성 사업자 필터 무시)
  const supabase = await createClient();
  const [{ data: companies }, { data: partners }, { data: inv }, { data: linked }] = await Promise.all([
    supabase.from("companies").select("id, name"),
    supabase.from("partners").select("id, name"),
    supabase
      .from("tax_invoices")
      .select("id, company_id, type, total_amount, partner_id, doc_date, due_date, settled_at")
      .gte("doc_date", first)
      .lt("doc_date", next),
    supabase.from("bank_transactions").select("tax_invoice_id").not("tax_invoice_id", "is", null),
  ]);

  const cName = new Map(((companies ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pName = new Map(((partners ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const bankLinked = new Set(((linked ?? []) as { tax_invoice_id: string }[]).map((b) => b.tax_invoice_id));

  type Inv = {
    id: string; company_id: string; type: string; total_amount: number;
    partner_id: string | null; doc_date: string | null; due_date: string | null; settled_at: string | null;
  };

  const receivables: DueItem[] = [];
  const payables: DueItem[] = [];
  const settledManual: DueItem[] = [];

  for (const i of (inv ?? []) as Inv[]) {
    const settled = bankLinked.has(i.id) || !!i.settled_at;
    const item: DueItem = {
      id: i.id,
      type: i.type === "SALES" ? "SALES" : "PURCHASE",
      company: cName.get(i.company_id) ?? "?",
      partner: i.partner_id ? pName.get(i.partner_id) ?? "거래처" : "미지정",
      date: i.doc_date ?? "",
      due: i.due_date,
      amount: i.total_amount,
      overdue: !settled && !!i.due_date && i.due_date < today,
      manual: !!i.settled_at && !bankLinked.has(i.id),
    };
    if (!settled) {
      if (i.type === "SALES") receivables.push(item);
      else payables.push(item);
    } else if (item.manual) {
      settledManual.push(item);
    }
  }

  const byPriority = (a: DueItem, b: DueItem) =>
    Number(b.overdue) - Number(a.overdue) || (a.due ?? a.date).localeCompare(b.due ?? b.date);
  receivables.sort(byPriority);
  payables.sort(byPriority);

  return <FinanceClient receivables={receivables} payables={payables} settledManual={settledManual} month={month} />;
}
