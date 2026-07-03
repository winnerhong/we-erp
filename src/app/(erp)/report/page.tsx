import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { Card } from "@/components/ui";
import { krw } from "@/lib/labels";
import { MonthNav } from "./month-nav";

export const metadata = { title: "손익 리포트" };

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const first = `${m}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return { first, next };
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { first, next } = monthRange(month);

  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);
  const scopeName = ctx.activeId === ALL_COMPANIES ? "전체 사업자" : ctx.companies.find((c) => c.id === ctx.activeId)?.name ?? "";

  let taxQ = supabase.from("tax_invoices").select("type, supply_amount, vat_amount, receipt_id, account_id").gte("doc_date", first).lt("doc_date", next);
  let rcptQ = supabase.from("receipts").select("id, supply_amount, total_amount, account_id, status").eq("status", "CONFIRMED").gte("doc_date", first).lt("doc_date", next);
  let payQ = supabase.from("payrolls").select("base_pay, allowance, nontax_allowance").eq("year_month", month);
  let buyQ = supabase.from("purchase_requests").select("amount, receipt_id, account_id").eq("status", "PURCHASED").gte("paid_at", `${first}T00:00:00`).lt("paid_at", `${next}T00:00:00`);
  const acctQ = supabase.from("accounts").select("id, code, name");
  // 부문별 매출(거래 기준) — 원가배분 기준
  let txnQ = supabase.from("transactions").select("type, amount, status").neq("status", "CANCELED").gte("txn_date", first).lt("txn_date", next);
  if (filter) {
    taxQ = taxQ.eq("company_id", filter);
    rcptQ = rcptQ.eq("company_id", filter);
    payQ = payQ.eq("company_id", filter);
    buyQ = buyQ.eq("company_id", filter);
    txnQ = txnQ.eq("company_id", filter);
  }
  const [{ data: tax }, { data: rcpt }, { data: pay }, { data: buy }, { data: accts }, { data: txnData }] = await Promise.all([
    taxQ, rcptQ, payQ, buyQ, acctQ, txnQ,
  ]);

  type Tax = { type: string; supply_amount: number; vat_amount: number; receipt_id: string | null; account_id: string | null };
  type Rcpt = { id: string; supply_amount: number | null; total_amount: number | null; account_id: string | null; status: string };
  type Pay = { base_pay: number; allowance: number; nontax_allowance: number };
  type Buy = { amount: number; receipt_id: string | null; account_id: string | null };

  const taxRows = (tax ?? []) as Tax[];
  const rcptRows = (rcpt ?? []) as Rcpt[];
  const acctName = new Map(((accts ?? []) as { id: string; code: string; name: string }[]).map((a) => [a.id, `${a.code} ${a.name}`]));

  // 매출(공급가) / 매입(공급가)
  const salesSupply = taxRows.filter((t) => t.type === "SALES").reduce((s, t) => s + t.supply_amount, 0);
  const salesVat = taxRows.filter((t) => t.type === "SALES").reduce((s, t) => s + t.vat_amount, 0);
  const purchaseSupply = taxRows.filter((t) => t.type === "PURCHASE").reduce((s, t) => s + t.supply_amount, 0);
  const purchaseVat = taxRows.filter((t) => t.type === "PURCHASE").reduce((s, t) => s + t.vat_amount, 0);

  // 영수증: 매입세금계산서로 이미 잡힌 건(연결된 receipt_id) 제외 → 중복 방지
  const linkedReceiptIds = new Set(taxRows.map((t) => t.receipt_id).filter(Boolean) as string[]);
  const receiptRowsCounted = rcptRows.filter((r) => !linkedReceiptIds.has(r.id));
  const receiptExpense = receiptRowsCounted.reduce((s, r) => s + (r.supply_amount ?? r.total_amount ?? 0), 0);

  // 급여(총지급 = 기본급+수당+비과세)
  const payrollCost = ((pay ?? []) as Pay[]).reduce((s, p) => s + p.base_pay + p.allowance + p.nontax_allowance, 0);

  // 구매: 증빙(영수증) 미연결분만(중복 방지)
  const purchaseUnevidenced = ((buy ?? []) as Buy[]).filter((b) => !b.receipt_id).reduce((s, b) => s + b.amount, 0);

  const expenseTotal = purchaseSupply + receiptExpense + payrollCost + purchaseUnevidenced;
  const profit = salesSupply - expenseTotal;
  const payableVat = salesVat - purchaseVat;

  // 계정과목별 경비(전체: 매입 세금계산서 + 영수증 + 구매)
  const byAccount = new Map<string, number>();
  const addAcc = (accId: string | null, amt: number) => {
    if (!amt) return;
    const key = accId ? acctName.get(accId) ?? "(알 수 없음)" : "(미분류)";
    byAccount.set(key, (byAccount.get(key) ?? 0) + amt);
  };
  for (const t of taxRows) if (t.type === "PURCHASE") addAcc(t.account_id, t.supply_amount);
  for (const r of receiptRowsCounted) addAcc(r.account_id, r.supply_amount ?? r.total_amount ?? 0);
  for (const b of (buy ?? []) as Buy[]) if (!b.receipt_id) addAcc(b.account_id, b.amount);
  const accountRows = [...byAccount.entries()].sort((a, b) => b[1] - a[1]);

  const expenseParts = [
    { label: "매입 (세금계산서)", amount: purchaseSupply },
    { label: "경비 (영수증)", amount: receiptExpense },
    { label: "급여", amount: payrollCost },
    { label: "구매 (증빙 미연결)", amount: purchaseUnevidenced },
  ].filter((p) => p.amount !== 0);

  // ----- 부문별 원가배분(공통비를 거래 매출 비중으로 배분) -----
  const deptRev: Record<string, number> = { CLASS: 0, EVENT: 0, RENTAL: 0, ETC: 0 };
  for (const t of (txnData ?? []) as { type: string; amount: number }[]) {
    const k = t.type === "CLASS" || t.type === "EVENT" || t.type === "RENTAL" ? t.type : "ETC";
    deptRev[k] += t.amount ?? 0;
  }
  const deptTotal = deptRev.CLASS + deptRev.EVENT + deptRev.RENTAL + deptRev.ETC;
  const deptMeta = [
    { key: "CLASS", label: "수업" },
    { key: "EVENT", label: "행사" },
    { key: "RENTAL", label: "렌탈" },
    { key: "ETC", label: "기타" },
  ];
  const allocation = deptMeta
    .map((d) => {
      const rev = deptRev[d.key];
      const share = deptTotal > 0 ? rev / deptTotal : 0;
      const cost = Math.round(expenseTotal * share);
      return { label: d.label, rev, share, cost, profit: rev - cost };
    })
    .filter((d) => d.rev !== 0 || d.cost !== 0);

  // ----- 올해 월별 순이익 추이 -----
  const year = Number(month.slice(0, 4));
  const yStart = `${year}-01-01`;
  const yEnd = `${year + 1}-01-01`;
  const mIdx = (d: string | null) => (d ? Number(d.slice(5, 7)) - 1 : -1);

  let yTaxQ = supabase.from("tax_invoices").select("type, supply_amount, doc_date, receipt_id").gte("doc_date", yStart).lt("doc_date", yEnd);
  let yRcptQ = supabase.from("receipts").select("id, supply_amount, total_amount, doc_date, status").eq("status", "CONFIRMED").gte("doc_date", yStart).lt("doc_date", yEnd);
  let yPayQ = supabase.from("payrolls").select("base_pay, allowance, nontax_allowance, year_month").gte("year_month", `${year}-01`).lte("year_month", `${year}-12`);
  let yBuyQ = supabase.from("purchase_requests").select("amount, paid_at, receipt_id").eq("status", "PURCHASED").gte("paid_at", `${yStart}T00:00:00`).lt("paid_at", `${yEnd}T00:00:00`);
  if (filter) {
    yTaxQ = yTaxQ.eq("company_id", filter);
    yRcptQ = yRcptQ.eq("company_id", filter);
    yPayQ = yPayQ.eq("company_id", filter);
    yBuyQ = yBuyQ.eq("company_id", filter);
  }
  const [{ data: yTax }, { data: yRcpt }, { data: yPay }, { data: yBuy }] = await Promise.all([yTaxQ, yRcptQ, yPayQ, yBuyQ]);

  type YTax = { type: string; supply_amount: number; doc_date: string | null; receipt_id: string | null };
  type YRcpt = { id: string; supply_amount: number | null; total_amount: number | null; doc_date: string | null };
  type YPay = { base_pay: number; allowance: number; nontax_allowance: number; year_month: string };
  type YBuy = { amount: number; paid_at: string | null; receipt_id: string | null };

  const ySales = Array(12).fill(0);
  const yExp = Array(12).fill(0);
  const yTaxRows = (yTax ?? []) as YTax[];
  const yLinked = new Set(yTaxRows.map((t) => t.receipt_id).filter(Boolean) as string[]);
  for (const t of yTaxRows) {
    const i = mIdx(t.doc_date);
    if (i < 0) continue;
    if (t.type === "SALES") ySales[i] += t.supply_amount;
    else yExp[i] += t.supply_amount;
  }
  for (const r of (yRcpt ?? []) as YRcpt[]) {
    if (yLinked.has(r.id)) continue;
    const i = mIdx(r.doc_date);
    if (i >= 0) yExp[i] += r.supply_amount ?? r.total_amount ?? 0;
  }
  for (const p of (yPay ?? []) as YPay[]) {
    const i = Number(p.year_month.slice(5, 7)) - 1;
    if (i >= 0 && i < 12) yExp[i] += p.base_pay + p.allowance + p.nontax_allowance;
  }
  for (const b of (yBuy ?? []) as YBuy[]) {
    if (b.receipt_id) continue;
    const i = mIdx(b.paid_at);
    if (i >= 0) yExp[i] += b.amount;
  }
  const yearNet = ySales.map((s, i) => ({ label: `${i + 1}월`, net: s - yExp[i], isCurrent: i + 1 === Number(month.slice(5, 7)) }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">손익 리포트</h1>
          <p className="mt-1 text-sm text-neutral-500">{scopeName} · {month} · 매출 − 비용 = 순이익 (부가세 제외 기준)</p>
        </div>
        <MonthNav month={month} />
      </div>

      {/* 요약 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">매출 (공급가)</p>
          <p className="mt-1 text-lg font-bold tabular text-emerald-600">{krw(salesSupply)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">비용 합계</p>
          <p className="mt-1 text-lg font-bold tabular text-rose-600">{krw(expenseTotal)}</p>
        </Card>
        <Card className={`p-4 ${profit >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
          <p className="text-xs text-neutral-500">순이익</p>
          <p className={`mt-1 text-xl font-bold tabular ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{krw(profit)}</p>
        </Card>
        <Card className="bg-indigo-500 p-4 text-white">
          <p className="text-xs text-neutral-300">예상 부가세 (참고)</p>
          <p className="mt-1 text-lg font-bold tabular">
            {payableVat >= 0 ? "납부 " : "환급 "}
            {krw(Math.abs(payableVat))}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 비용 구성 */}
        <Card>
          <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">비용 구성</div>
          {expenseParts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">이번 달 비용이 없습니다.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-neutral-100">
                {expenseParts.map((p) => (
                  <tr key={p.label}>
                    <td className="px-4 py-2.5">{p.label}</td>
                    <td className="px-4 py-2.5 text-right tabular">{krw(p.amount)}</td>
                    <td className="w-16 px-4 py-2.5 text-right text-xs text-neutral-400">
                      {expenseTotal > 0 ? Math.round((p.amount / expenseTotal) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-2.5">합계</td>
                  <td className="px-4 py-2.5 text-right tabular">{krw(expenseTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        {/* 계정과목별 경비 */}
        <Card>
          <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">계정과목별 경비 (전체)</div>
          {accountRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">분류할 경비가 없습니다.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-neutral-100">
                {accountRows.map(([name, amt]) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5">{name}</td>
                    <td className="px-4 py-2.5 text-right tabular">{krw(amt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* 부문별 원가배분 손익 */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-neutral-700">
        부문별 손익 <span className="text-xs font-normal text-neutral-400">공통비를 거래 매출 비중으로 배분</span>
      </h2>
      <Card className="overflow-hidden">
        {allocation.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">이 달 부문 거래가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">부문</th>
                  <th className="px-4 py-2.5 font-medium">매출(거래)</th>
                  <th className="px-4 py-2.5 font-medium">매출 비중</th>
                  <th className="px-4 py-2.5 font-medium">배분 공통비</th>
                  <th className="px-4 py-2.5 font-medium">부문 순이익</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {allocation.map((d) => (
                  <tr key={d.label}>
                    <td className="px-4 py-2.5 text-left font-medium text-neutral-800">{d.label}</td>
                    <td className="px-4 py-2.5 tabular text-neutral-700">{krw(d.rev)}</td>
                    <td className="px-4 py-2.5 tabular text-neutral-500">{Math.round(d.share * 100)}%</td>
                    <td className="px-4 py-2.5 tabular text-rose-600">−{krw(d.cost)}</td>
                    <td className={`px-4 py-2.5 tabular font-semibold ${d.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{krw(d.profit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 bg-neutral-50 text-xs">
                <tr>
                  <td className="px-4 py-2 text-left font-semibold text-neutral-600">합계</td>
                  <td className="px-4 py-2 tabular font-semibold">{krw(deptTotal)}</td>
                  <td className="px-4 py-2 tabular text-neutral-400">100%</td>
                  <td className="px-4 py-2 tabular font-semibold text-rose-600">−{krw(expenseTotal)}</td>
                  <td className="px-4 py-2 tabular font-semibold">{krw(deptTotal - expenseTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* 올해 월별 순이익 추이 */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-neutral-700">{year}년 월별 순이익</h2>
      <Card className="p-4">
        <YearChart data={yearNet} />
      </Card>

      <p className="mt-3 text-xs text-neutral-400">
        ※ 부가세 제외(공급가액) 기준. 영수증↔매입세금계산서, 구매↔증빙 중복은 제외해 집계합니다. 급여는 총지급액(기본급+수당) 기준.
      </p>
    </div>
  );
}

function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 100000000) return `${sign}${(a / 100000000).toFixed(1)}억`;
  if (a >= 10000) return `${sign}${Math.round(a / 10000)}만`;
  return `${sign}${a.toLocaleString("ko-KR")}`;
}

function YearChart({ data }: { data: { label: string; net: number; isCurrent: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.net)));
  const has = data.some((d) => d.net !== 0);
  if (!has) return <p className="py-6 text-center text-sm text-neutral-400">올해 손익 데이터가 없습니다.</p>;
  return (
    <div className="flex items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className={`text-[10px] tabular ${d.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {d.net !== 0 ? compact(d.net) : ""}
          </span>
          <div className="flex h-24 w-full items-end justify-center">
            <div
              title={`${d.label} ${d.net.toLocaleString("ko-KR")}원`}
              style={{ height: `${(Math.abs(d.net) / max) * 100}%` }}
              className={`w-4/5 rounded-t ${d.net >= 0 ? "bg-emerald-400" : "bg-rose-400"} ${d.isCurrent ? "ring-2 ring-neutral-900" : ""}`}
            />
          </div>
          <span className={`text-[10px] ${d.isCurrent ? "font-bold text-neutral-900" : "text-neutral-400"}`}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
