import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import {
  BankClient,
  type TxnWithBalance,
  type ReceiptOption,
  type AccountBalance,
  type TradeInvoiceView,
} from "./bank-client";
import type { BankAccountRow, BankTransactionRow, PaybackRow, BankTxnGroupRow } from "@/lib/supabase/database.types";

export const metadata = { title: "통장원장" };

/** 'YYYY-MM' → [이번달 1일, 다음달 1일). */
function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

const signed = (t: { direction: string; amount: number }) =>
  t.direction === "IN" ? t.amount : -t.amount;

/** Supabase 기본 1000행 한도 우회 — 1000건씩 끝까지 가져온다. */
async function pageAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null }> }
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 500000; from += PAGE) {
    const { data } = await build().range(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);
  const activeCompanyId = ctx.activeId === ALL_COMPANIES ? null : ctx.activeId;

  let acctQuery = supabase
    .from("bank_accounts")
    .select("*")
    .eq("is_active", true)
    .order("alias");
  if (filter) acctQuery = acctQuery.eq("company_id", filter);
  const { data: acctData, error: acctErr } = await acctQuery;
  if (acctErr) {
    return <p className="text-sm text-red-600">통장을 불러오지 못했습니다: {acctErr.message}</p>;
  }
  const accounts = (acctData ?? []) as BankAccountRow[];

  const selectedId =
    sp.a && accounts.some((a) => a.id === sp.a) ? sp.a : accounts[0]?.id ?? null;
  const account = accounts.find((a) => a.id === selectedId) ?? null;

  // 이 통장의 전체 거래 건수 + 가장 최근 거래일(빈 달 안내·최신 달 시작용)
  let accountTxnCount = 0;
  let accountLatestDate: string | null = null;
  if (account) {
    const [{ count }, { data: latest }] = await Promise.all([
      supabase.from("bank_transactions").select("*", { count: "exact", head: true }).eq("bank_account_id", account.id),
      supabase.from("bank_transactions").select("txn_date").eq("bank_account_id", account.id).order("txn_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    accountTxnCount = count ?? 0;
    accountLatestDate = (latest as { txn_date: string } | null)?.txn_date ?? null;
  }

  // 월 미지정으로 처음 열면 거래가 있는 최신 달로 시작(빈 달에 안 떨어지게)
  const month =
    sp.m ?? accountLatestDate?.slice(0, 7) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  // 세금계산서 등록 시 거래처 자동매칭용 목록(활성 사업자 + 공용)
  type PartnerOpt = { id: string; name: string; default_tax_rate: number | null };
  const partnerScope = (cols: string) => {
    let q = supabase.from("partners").select(cols).eq("is_active", true).order("name");
    if (filter) q = q.or(`company_id.eq.${filter},company_id.is.null`);
    return q;
  };
  // 직원/카드/영수증 — 사업자 스코프 빌더
  let empQuery = supabase.from("employees").select("id, name, company_id").eq("is_active", true).order("name");
  if (filter) empQuery = empQuery.eq("company_id", filter);
  let cardQ = supabase.from("cards").select("id, alias");
  if (filter) cardQ = cardQ.eq("company_id", filter);
  let receiptQuery = supabase.from("receipts").select("id, vendor_name, total_amount, doc_date, company_id").eq("status", "CONFIRMED").order("doc_date", { ascending: false });
  if (filter) receiptQuery = receiptQuery.eq("company_id", filter);
  let groupQ = supabase.from("bank_txn_groups").select("*").order("name");
  if (filter) groupQ = groupQ.eq("company_id", filter);

  // ---- 독립 목록 쿼리 일괄 병렬 ----
  const [
    { data: partnerData, error: partnerErr },
    { data: accountData },
    { data: catData },
    { data: empData },
    { data: cardData },
    { data: receiptData },
    { data: groupData },
  ] = await Promise.all([
    partnerScope("id, name, default_tax_rate"),
    supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("field_options").select("*").eq("category", "bank_category").order("sort_order"),
    empQuery,
    cardQ,
    receiptQuery,
    groupQ,
  ]);
  const groups = (groupData ?? []) as BankTxnGroupRow[];

  let partners: PartnerOpt[];
  if (partnerErr) {
    // default_tax_rate 마이그레이션 미적용 시 폴백(세율 자동화 없이 동작)
    const { data: basic } = await partnerScope("id, name");
    partners = ((basic ?? []) as unknown as { id: string; name: string }[]).map((p) => ({ ...p, default_tax_rate: null }));
  } else {
    partners = (partnerData ?? []) as unknown as PartnerOpt[];
  }
  const accountOptions = (accountData ?? []) as { id: string; code: string; name: string }[];
  const categoryOptions = (catData ?? []) as import("@/lib/supabase/database.types").FieldOptionRow[];
  const employees = (empData ?? []) as { id: string; name: string; company_id: string | null }[];
  const cardAlias: Record<string, string> = Object.fromEntries(
    ((cardData ?? []) as { id: string; alias: string }[]).map((c) => [c.id, c.alias])
  );
  const receipts = (receiptData ?? []) as ReceiptOption[];

  // 통장별 현재 잔액(전 기간) — 통합 수지 요약용
  const balByAcct = new Map<string, number>(accounts.map((a) => [a.id, a.opening_balance]));
  // 각 통장 현재 잔액 = 가장 최근 거래의 업로드 잔액(balance_after). 없으면 기초잔액.
  // (전 거래를 합산하지 않아 빠름)
  await Promise.all(
    accounts.map(async (a) => {
      const { data } = await supabase
        .from("bank_transactions")
        .select("balance_after")
        .eq("bank_account_id", a.id)
        .not("balance_after", "is", null)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const b = (data as { balance_after: number } | null)?.balance_after;
      if (b != null) balByAcct.set(a.id, b);
    })
  );
  const accountBalances: AccountBalance[] = accounts.map((a) => ({
    id: a.id,
    alias: a.alias,
    bank_name: a.bank_name,
    balance: balByAcct.get(a.id) ?? a.opening_balance,
  }));
  const grandBalance = accountBalances.reduce((s, a) => s + a.balance, 0);

  // 미수금/미지급 — 통장 매칭(tax_invoice_id)도 settled_at도 없는 세금계산서
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  let invQuery = supabase
    .from("tax_invoices")
    .select("id, type, status, total_amount, due_date, doc_date, settled_at, partner_id, evidence")
    .is("settled_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (filter) invQuery = invQuery.eq("company_id", filter);
  let linkQuery = supabase
    .from("bank_transactions")
    .select("tax_invoice_id")
    .not("tax_invoice_id", "is", null);
  if (filter) linkQuery = linkQuery.eq("company_id", filter);
  const [{ data: invData }, { data: linkData }] = await Promise.all([invQuery, linkQuery]);
  type RawInv = {
    id: string;
    type: string;
    status: string;
    total_amount: number;
    due_date: string | null;
    doc_date: string | null;
    settled_at: string | null;
    partner_id: string | null;
    evidence: string | null;
  };
  const rawInvs = (invData ?? []) as RawInv[];
  const linkedIds = new Set((linkData ?? []).map((r) => (r as { tax_invoice_id: string }).tax_invoice_id));

  const toView = (i: RawInv): TradeInvoiceView => ({
    id: i.id,
    type: i.type as "SALES" | "PURCHASE",
    partnerName: i.partner_id ? partnerName.get(i.partner_id) ?? null : null,
    total_amount: i.total_amount,
    due_date: i.due_date,
    doc_date: i.doc_date,
    evidence: i.evidence,
  });
  const unsettled = rawInvs.filter((i) => !linkedIds.has(i.id));
  const receivables = unsettled.filter((i) => i.type === "SALES").map(toView);
  const payables = unsettled.filter((i) => i.type === "PURCHASE").map(toView);

  let monthTxns: TxnWithBalance[] = [];
  let priorBalance = 0;
  let monthEndBalance = 0;

  if (account) {
    // 해당 월 거래만 조회(전 기간을 안 불러와서 빠름)
    // 해당 월 거래 + 월초 잔액(직전 거래) 병렬 조회
    const [monthRows, { data: prevRow }] = await Promise.all([
      pageAll<BankTransactionRow>(() =>
        supabase
          .from("bank_transactions")
          .select("*")
          .eq("bank_account_id", account.id)
          .gte("txn_date", first)
          .lt("txn_date", next)
          .order("txn_date", { ascending: true })
          .order("created_at", { ascending: true })
      ),
      supabase
        .from("bank_transactions")
        .select("balance_after")
        .eq("bank_account_id", account.id)
        .lt("txn_date", first)
        .not("balance_after", "is", null)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const txnsAsc = monthRows.slice().sort(
      (a, b) =>
        a.txn_date.localeCompare(b.txn_date) ||
        (a.txn_time ?? "").localeCompare(b.txn_time ?? "") ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );
    priorBalance = (prevRow as { balance_after: number } | null)?.balance_after ?? account.opening_balance;

    const withRun = txnsAsc.reduce<TxnWithBalance[]>((acc, t) => {
      const prev = acc.length ? acc[acc.length - 1].running_balance : priorBalance;
      acc.push({ ...t, running_balance: prev + signed(t) });
      return acc;
    }, []);
    monthEndBalance = withRun.length ? withRun[withRun.length - 1].running_balance : priorBalance;
    // 시간순(오래된→최신): 새로 추가한 거래가 맨 아래로 가고 잔액이 위→아래로 누적됨
    monthTxns = withRun;
  }

  // 이번달 거래에 달린 페이백 — 거래ID별로 묶어 전달
  const paybacksByTxn: Record<string, PaybackRow[]> = {};
  if (monthTxns.length > 0) {
    const txnIds = monthTxns.map((t) => t.id);
    const { data: pbData } = await supabase
      .from("paybacks")
      .select("*")
      .in("bank_transaction_id", txnIds)
      .order("created_at", { ascending: true });
    for (const pb of (pbData ?? []) as PaybackRow[]) {
      if (!pb.bank_transaction_id) continue;
      (paybacksByTxn[pb.bank_transaction_id] ??= []).push(pb);
    }
  }

  return (
    <BankClient
      accounts={accounts}
      companyNames={ctx.companies.map((c) => ({ id: c.id, name: c.name }))}
      selectedId={selectedId}
      activeCompanyId={activeCompanyId}
      month={month}
      monthTxns={monthTxns}
      priorBalance={priorBalance}
      monthEndBalance={monthEndBalance}
      partners={partners}
      receipts={receipts}
      accountBalances={accountBalances}
      grandBalance={grandBalance}
      receivables={receivables}
      payables={payables}
      accountTxnCount={accountTxnCount}
      accountLatestDate={accountLatestDate}
      accountOptions={accountOptions}
      categoryOptions={categoryOptions}
      employees={employees}
      paybacksByTxn={paybacksByTxn}
      cardAlias={cardAlias}
      groups={groups}
    />
  );
}
