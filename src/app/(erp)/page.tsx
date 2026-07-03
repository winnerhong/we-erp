import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext, companyFilter, ALL_COMPANIES } from "@/lib/active-company";
import { Card, Badge } from "@/components/ui";
import { krw } from "@/lib/labels";
import { summarizeAging, type AgingItem } from "@/lib/aging";

export const metadata = { title: "대시보드" };

interface Agg {
  spend: number; // 이번 달 영수증 확정 지출
  salesVat: number;
  purchaseVat: number;
  receivable: number; // 미수금(매출 미정산)
  payable: number; // 미지급(매입 미정산)
  overdue: number; // 정산 연체 건수(결제예정일 경과·미정산)
  receiptPending: number;
  salesPending: number;
  purchasePending: number;
  purchaseReqPending: number;
  leavePending: number;
}
const emptyAgg = (): Agg => ({
  spend: 0, salesVat: 0, purchaseVat: 0,
  receivable: 0, payable: 0, overdue: 0,
  receiptPending: 0, salesPending: 0, purchasePending: 0,
  purchaseReqPending: 0, leavePending: 0,
});

export default async function DashboardPage() {
  const ctx = await getCompanyContext();
  const filter = companyFilter(ctx);
  const supabase = await createClient();

  // KST 기준(서버 TZ 무관) — UTC 게터로 한국 벽시계 날짜를 계산
  const now = new Date(new Date().getTime() + 9 * 3600 * 1000);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const first = `${month}-01`;
  const nextMo = now.getUTCMonth() === 11 ? 1 : now.getUTCMonth() + 2;
  const nextY = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const next = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  const inMonth = (d: string | null) => !!d && d >= first && d < next;
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  // ---- 기간 prep(순수 계산) ----
  const trendMonths: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    trendMonths.push({ key: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`, label: `${dt.getUTCMonth() + 1}월` });
  }
  const sixStart = `${trendMonths[0].key}-01`;
  const d30 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30));
  const d30s = `${d30.getUTCFullYear()}-${String(d30.getUTCMonth() + 1).padStart(2, "0")}-${String(d30.getUTCDate()).padStart(2, "0")}`;
  const d7 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
  const d7s = `${d7.getUTCFullYear()}-${String(d7.getUTCMonth() + 1).padStart(2, "0")}-${String(d7.getUTCDate()).padStart(2, "0")}`;

  // ---- 쿼리 빌더(사업자 스코프) ----
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T): T => (filter ? q.eq("company_id", filter) : q);
  const rcptQ = scope(supabase.from("receipts").select("status,total_amount,doc_date,company_id"));
  const taxQ = scope(supabase.from("tax_invoices").select("id,type,status,vat_amount,total_amount,doc_date,due_date,settled_at,company_id"));
  const purQ = scope(supabase.from("purchase_requests").select("status,company_id"));
  const lvQ = scope(supabase.from("leave_requests").select("status,company_id"));
  const attTodayQ = scope(supabase.from("attendance").select("status, check_in, check_out").eq("work_date", today));
  const taskQ = scope(supabase.from("tasks").select("status, due_date").neq("status", "DONE"));
  const txnQ = scope(supabase.from("transactions").select("amount, status, settlement_id, txn_date, type").neq("status", "CANCELED"));
  const setQ = scope(supabase.from("settlements").select("total, status"));
  const openRentQ = scope(supabase.from("asset_movements").select("id", { count: "exact", head: true }).eq("status", "OPEN"));
  const expireQ = scope(supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "ACTIVE").gte("end_date", today).lte("end_date", d30s));
  const eventQ = scope(supabase.from("contracts").select("detail, status").eq("type", "EVENT").neq("status", "ENDED"));
  const tTrendQ = scope(supabase.from("tax_invoices").select("type,total_amount,doc_date").gte("doc_date", sixStart).lt("doc_date", next));
  const rTrendQ = scope(supabase.from("receipts").select("total_amount,doc_date,status").eq("status", "CONFIRMED").gte("doc_date", sixStart).lt("doc_date", next));

  // ---- 단일 병렬 로드(독립 쿼리 전부 한 번에) ----
  const [
    companiesRes, rcpt, tax, pur, lv, partnerCnt, empCnt, acctCnt,
    attRes, taskRes, txnRes, setRes, openRentRes, expireRes, eventRes, tTrend, rTrend,
  ] = await Promise.all([
    supabase.from("companies").select("id,name").eq("is_active", true).order("name"),
    rcptQ, taxQ, purQ, lvQ,
    filter
      ? supabase.from("partners").select("*", { count: "exact", head: true }).or(`company_id.eq.${filter},company_id.is.null`)
      : supabase.from("partners").select("*", { count: "exact", head: true }),
    filter
      ? supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true).eq("company_id", filter)
      : supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("accounts").select("*", { count: "exact", head: true }).eq("is_active", true),
    attTodayQ, taskQ, txnQ, setQ, openRentQ, expireQ, eventQ, tTrendQ, rTrendQ,
  ]);

  const companies = (companiesRes.data ?? []) as { id: string; name: string }[];

  // 오늘 근태 요약
  const attRows = (attRes.data ?? []) as { status: string; check_in: string | null; check_out: string | null }[];
  const attWorked = attRows.filter((a) => a.check_in).length;
  const attLate = attRows.filter((a) => a.status === "LATE" || a.status === "LATE_EARLY").length;
  const attOut = attRows.filter((a) => a.check_out).length;

  // 업무 요약(미완료 중 지연·오늘 마감)
  const openTasks = (taskRes.data ?? []) as { status: string; due_date: string | null }[];
  const taskOverdue = openTasks.filter((t) => t.due_date && t.due_date < today).length;
  const taskToday = openTasks.filter((t) => t.due_date === today).length;

  // 거래/정산 요약(거래처 CRM)
  const txnRows = (txnRes.data ?? []) as { amount: number; status: string; settlement_id: string | null; txn_date: string; type: string }[];
  const setRows = (setRes.data ?? []) as { total: number; status: string }[];
  const todaySessions = txnRows.filter((t) => t.type === "CLASS" && t.txn_date === today);
  const sessionsDone = todaySessions.filter((t) => t.status === "DONE").length;
  const txnThisMonth = txnRows.filter((t) => inMonth(t.txn_date)).reduce((s, t) => s + t.amount, 0);
  const unsettledAmount = txnRows.filter((t) => !t.settlement_id).reduce((s, t) => s + t.amount, 0);
  const draftSettleAmount = setRows.filter((s) => s.status === "DRAFT").reduce((s2, s) => s2 + s.total, 0);
  const hasCrm = txnRows.length > 0 || setRows.length > 0;

  // 운영 알림(미반납 교구·만료 임박 계약·임박 행사)
  const openRentals = openRentRes.count;
  const expiringContracts = expireRes.count;
  const upcomingEvents = ((eventRes.data ?? []) as { detail: Record<string, unknown> }[]).filter((e) => {
    const ed = e.detail?.event_date;
    return typeof ed === "string" && ed >= today && ed <= d7s;
  }).length;
  const hasOps = (openRentals ?? 0) > 0 || (expiringContracts ?? 0) > 0 || upcomingEvents > 0;

  // 정산(통장 연결) 완료된 세금계산서 id — 미수금/미지급 계산용.
  // 이미 로드한 tax_invoices id 로만 역조회(.in) → bank_transactions 전량 스캔 회피.
  // settledIds 는 tax.data 의 id 에 대해서만 조회되므로 결과가 동일하다.
  const settledIds = new Set<string>();
  const taxIdList = ((tax.data ?? []) as { id: string }[]).map((t) => t.id);
  if (taxIdList.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < taxIdList.length; i += 200) chunks.push(taxIdList.slice(i, i + 200));
    const linkResults = await Promise.all(
      chunks.map((chunk) => scope(supabase.from("bank_transactions").select("tax_invoice_id").in("tax_invoice_id", chunk)))
    );
    for (const { data } of linkResults) {
      for (const b of (data ?? []) as { tax_invoice_id: string }[]) settledIds.add(b.tax_invoice_id);
    }
  }

  // ----- 최근 6개월 추세(매출 vs 지출) -----
  const salesBy: Record<string, number> = {};
  const spendBy: Record<string, number> = {};
  for (const t of (tTrend.data ?? []) as { type: string; total_amount: number; doc_date: string | null }[]) {
    const k = t.doc_date?.slice(0, 7);
    if (!k) continue;
    if (t.type === "SALES") salesBy[k] = (salesBy[k] ?? 0) + t.total_amount;
    else spendBy[k] = (spendBy[k] ?? 0) + t.total_amount;
  }
  for (const r of (rTrend.data ?? []) as { total_amount: number | null; doc_date: string | null }[]) {
    const k = r.doc_date?.slice(0, 7);
    if (!k) continue;
    spendBy[k] = (spendBy[k] ?? 0) + (r.total_amount ?? 0);
  }
  const trend = trendMonths.map((m) => ({ label: m.label, sales: salesBy[m.key] ?? 0, spend: spendBy[m.key] ?? 0 }));

  // 집계 (전체 + 사업자별)
  const total = emptyAgg();
  const byCompany = new Map<string, Agg>();
  const bump = (cid: string | null, fn: (a: Agg) => void) => {
    fn(total);
    if (cid) {
      if (!byCompany.has(cid)) byCompany.set(cid, emptyAgg());
      fn(byCompany.get(cid)!);
    }
  };

  type R = { status: string; total_amount: number | null; doc_date: string | null; company_id: string };
  for (const r of (rcpt.data ?? []) as R[]) {
    if (r.status === "PENDING") bump(r.company_id, (a) => (a.receiptPending += 1));
    if (r.status === "CONFIRMED" && inMonth(r.doc_date))
      bump(r.company_id, (a) => (a.spend += r.total_amount ?? 0));
  }
  type T = { id: string; type: string; status: string; vat_amount: number; total_amount: number; doc_date: string | null; due_date: string | null; settled_at: string | null; company_id: string };
  for (const t of (tax.data ?? []) as T[]) {
    if (t.status === "PENDING") {
      if (t.type === "SALES") bump(t.company_id, (a) => (a.salesPending += 1));
      else bump(t.company_id, (a) => (a.purchasePending += 1));
    }
    if (inMonth(t.doc_date)) {
      const settled = settledIds.has(t.id) || !!t.settled_at;
      if (t.type === "SALES") {
        bump(t.company_id, (a) => (a.salesVat += t.vat_amount));
        if (!settled) bump(t.company_id, (a) => (a.receivable += t.total_amount));
      } else {
        bump(t.company_id, (a) => (a.purchaseVat += t.vat_amount));
        if (!settled) bump(t.company_id, (a) => (a.payable += t.total_amount));
      }
      if (!settled && t.due_date && t.due_date < today) bump(t.company_id, (a) => (a.overdue += 1));
    }
  }
  for (const p of (pur.data ?? []) as { status: string; company_id: string }[]) {
    if (p.status === "PENDING") bump(p.company_id, (a) => (a.purchaseReqPending += 1));
  }
  for (const l of (lv.data ?? []) as { status: string; company_id: string }[]) {
    if (l.status === "PENDING") bump(l.company_id, (a) => (a.leavePending += 1));
  }

  const scopeName = ctx.activeId === ALL_COMPANIES
    ? "전체 사업자"
    : companies.find((c) => c.id === ctx.activeId)?.name ?? "사업자";
  const payable = total.salesVat - total.purchaseVat;
  const pendingTotal =
    total.receiptPending + total.salesPending + total.purchasePending +
    total.purchaseReqPending + total.leavePending + total.overdue;

  // 연령분석(전체 미결제) — tax.data 재사용(추가 쿼리 없음)
  const agingItems: AgingItem[] = [];
  for (const t of (tax.data ?? []) as T[]) {
    if (settledIds.has(t.id) || t.settled_at) continue;
    agingItems.push({
      amount: t.total_amount,
      ref: t.due_date ?? t.doc_date ?? null,
      type: t.type === "SALES" ? "SALES" : "PURCHASE",
    });
  }
  const aging = summarizeAging(agingItems, today);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-neutral-900">대시보드</h1>
        <p className="text-sm text-neutral-500">
          {scopeName} · {month}
        </p>
      </div>

      {companies.length === 0 ? (
        <Card className="p-6">
          <h2 className="font-semibold">시작하기</h2>
          <p className="mt-2 text-sm text-neutral-600">
            <Link href="/companies" className="text-blue-600 underline">사업자</Link>부터 등록하세요. 모든 데이터의 기준입니다.
          </p>
        </Card>
      ) : (
        <>
          {/* 이번 달 핵심 지표 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="이번 달 지출(영수증)" value={krw(total.spend)} href="/receipts" />
            <Kpi label="매출세액" value={krw(total.salesVat)} href="/tax-invoices" />
            <Kpi label="매입세액" value={krw(total.purchaseVat)} href="/tax-invoices" />
            <Kpi
              label="예상 부가세"
              value={`${payable >= 0 ? "납부 " : "환급 "}${krw(Math.abs(payable))}`}
              href="/tax-invoices"
              tone={payable >= 0 ? "red" : "green"}
            />
          </div>

          {/* 정산 현황(이번 달) */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Kpi
              label="미수금 (이번 달 매출 미입금)"
              value={krw(total.receivable)}
              href="/trade"
              tone={total.receivable > 0 ? "red" : undefined}
            />
            <Kpi
              label="미지급금 (이번 달 매입 미지급)"
              value={krw(total.payable)}
              href="/trade"
              tone={total.payable > 0 ? "red" : undefined}
            />
          </div>

          {/* 연령분석 요약 — 전체 미결제(월 무관) */}
          {aging.recvCount + aging.payCount > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-700">연령분석 · 전체 미결제</h2>
                <Link href="/finance" className="text-xs font-medium text-indigo-500 hover:underline">받을돈·줄돈 →</Link>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AgingMini
                  title="받을 돈"
                  total={aging.recvTotal}
                  overdue={aging.recvOverdue}
                  tone="emerald"
                  buckets={aging.buckets.map((b) => ({ label: b.label, amt: b.recv, over: b.key !== "notdue" }))}
                />
                <AgingMini
                  title="줄 돈"
                  total={aging.payTotal}
                  overdue={aging.payOverdue}
                  tone="rose"
                  buckets={aging.buckets.map((b) => ({ label: b.label, amt: b.pay, over: b.key !== "notdue" }))}
                />
              </div>
            </div>
          )}

          {/* 오늘 근태 */}
          <div className="mt-7 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">오늘 근태</h2>
            <Link href="/attendance" className="text-xs text-indigo-600 hover:underline">근태현황 전체 →</Link>
          </div>
          <Link href="/attendance" className="mt-2 block">
            <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4 hover:bg-neutral-50">
              <div>
                <p className="text-xs text-neutral-500">출근</p>
                <p className="mt-0.5 text-lg font-bold tabular text-emerald-600">{attWorked}<span className="text-sm font-normal text-neutral-400">/{empCnt.count ?? 0}명</span></p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">퇴근</p>
                <p className="mt-0.5 text-lg font-bold tabular text-neutral-800">{attOut}명</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">지각</p>
                <p className="mt-0.5 text-lg font-bold tabular text-amber-600">{attLate}명</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">미출근</p>
                <p className="mt-0.5 text-lg font-bold tabular text-rose-500">{Math.max(0, (empCnt.count ?? 0) - attWorked)}명</p>
              </div>
            </Card>
          </Link>

          {/* 오늘 업무 */}
          <div className="mt-7 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">업무</h2>
            <Link href="/calendar" className="text-xs text-indigo-600 hover:underline">업무캘린더 →</Link>
          </div>
          <Link href="/calendar" className="mt-2 block">
            <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4 hover:bg-neutral-50">
              <div>
                <p className="text-xs text-neutral-500">미완료</p>
                <p className="mt-0.5 text-lg font-bold tabular text-neutral-800">{openTasks.length}건</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">오늘 마감</p>
                <p className="mt-0.5 text-lg font-bold tabular text-amber-600">{taskToday}건</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">지연</p>
                <p className="mt-0.5 text-lg font-bold tabular text-rose-500">{taskOverdue}건</p>
              </div>
            </Card>
          </Link>

          {/* 거래처 거래·정산 */}
          {hasCrm && (
            <>
              <div className="mt-7 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-700">거래처 거래·정산</h2>
                <Link href="/partners" className="text-xs text-indigo-600 hover:underline">거래처 →</Link>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="이번 달 거래액" value={krw(txnThisMonth)} href="/partners" small />
                <Kpi label="정산 대기(미정산 거래)" value={krw(unsettledAmount)} href="/partners" small tone={unsettledAmount > 0 ? "red" : undefined} />
                <Kpi label="발행 대기(미발행 정산)" value={krw(draftSettleAmount)} href="/partners" small tone={draftSettleAmount > 0 ? "red" : undefined} />
                {todaySessions.length > 0 && <Kpi label="오늘 수업(완료/총)" value={`${sessionsDone}/${todaySessions.length}`} href="/sessions" small tone={sessionsDone < todaySessions.length ? "red" : "green"} />}
              </div>
            </>
          )}

          {/* 운영 알림 */}
          {hasOps && (
            <>
              <h2 className="mb-2 mt-7 text-sm font-semibold text-neutral-700">🔔 운영 알림</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Todo label="미반납 교구" n={openRentals ?? 0} href="/assets" />
                <Todo label="만료 임박 계약(30일)" n={expiringContracts ?? 0} href="/partners" />
                <Todo label="임박 행사(7일)" n={upcomingEvents} href="/events" />
              </div>
            </>
          )}

          {/* 최근 6개월 추세 */}
          <h2 className="mb-2 mt-7 text-sm font-semibold text-neutral-700">최근 6개월 추세</h2>
          <TrendChart data={trend} />

          {/* 미처리 */}
          <h2 className="mb-2 mt-7 text-sm font-semibold text-neutral-700">
            미처리 {pendingTotal > 0 && <Badge tone="red">{pendingTotal}</Badge>}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Todo label="정산 연체" n={total.overdue} href="/trade" />
            <Todo label="영수증 검수대기" n={total.receiptPending} href="/receipts" />
            <Todo label="세금계산서 미발행" n={total.salesPending} href="/tax-invoices" />
            <Todo label="세금계산서 미수취" n={total.purchasePending} href="/tax-invoices" />
            <Todo label="구매 승인대기" n={total.purchaseReqPending} href="/purchases" />
            <Todo label="휴가 승인대기" n={total.leavePending} href="/hr" />
          </div>

          {/* 기초 현황 */}
          <h2 className="mb-2 mt-7 text-sm font-semibold text-neutral-700">기초 현황</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="사업자" value={`${companies.length}곳`} href="/companies" small />
            <Kpi label="거래처" value={`${partnerCnt.count ?? 0}곳`} href="/partners" small />
            <Kpi label="직원" value={`${empCnt.count ?? 0}명`} href="/employees" small />
            <Kpi label="계정과목" value={`${acctCnt.count ?? 0}개`} href="/accounts" small />
          </div>

          {/* 전체보기: 사업자별 분해 */}
          {ctx.activeId === ALL_COMPANIES && companies.length > 0 && (
            <>
              <h2 className="mb-2 mt-7 text-sm font-semibold text-neutral-700">사업자별 ({month})</h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm tabular">
                  <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-2">사업자</th>
                      <th className="px-4 py-2 text-right">지출</th>
                      <th className="px-4 py-2 text-right">매출세액</th>
                      <th className="px-4 py-2 text-right">매입세액</th>
                      <th className="px-4 py-2 text-right">예상부가세</th>
                      <th className="px-4 py-2 text-right">미처리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {companies.map((c) => {
                      const a = byCompany.get(c.id) ?? emptyAgg();
                      const pay = a.salesVat - a.purchaseVat;
                      const pend = a.receiptPending + a.salesPending + a.purchasePending + a.purchaseReqPending + a.leavePending;
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-2 font-medium">{c.name}</td>
                          <td className="px-4 py-2 text-right">{krw(a.spend)}</td>
                          <td className="px-4 py-2 text-right">{krw(a.salesVat)}</td>
                          <td className="px-4 py-2 text-right">{krw(a.purchaseVat)}</td>
                          <td className="px-4 py-2 text-right">{krw(pay)}</td>
                          <td className="px-4 py-2 text-right">{pend > 0 ? <Badge tone="red">{pend}</Badge> : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TrendChart({ data }: { data: { label: string; sales: number; spend: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.sales, d.spend]));
  const hasData = data.some((d) => d.sales > 0 || d.spend > 0);
  return (
    <Card className="p-4">
      {!hasData ? (
        <p className="py-8 text-center text-sm text-neutral-400">최근 6개월 거래 데이터가 없습니다.</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            {data.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    title={`매출 ${krw(d.sales)}`}
                    style={{ height: `${(d.sales / max) * 100}%` }}
                    className="w-3.5 rounded-t bg-emerald-400 transition-all hover:bg-emerald-500"
                  />
                  <div
                    title={`지출 ${krw(d.spend)}`}
                    style={{ height: `${(d.spend / max) * 100}%` }}
                    className="w-3.5 rounded-t bg-rose-400 transition-all hover:bg-rose-500"
                  />
                </div>
                <span className="text-xs text-neutral-400">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" /> 매출(세금계산서)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" /> 지출(매입+영수증)
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function Kpi({
  label, value, href, tone, small,
}: {
  label: string; value: string; href: string;
  tone?: "red" | "green"; small?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={`p-4 transition-shadow hover:shadow-sm ${tone === "red" ? "bg-red-50" : tone === "green" ? "bg-green-50" : ""}`}>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className={`mt-1 font-bold tabular ${small ? "text-lg" : "text-xl"}`}>{value}</p>
      </Card>
    </Link>
  );
}

function Todo({ label, n, href }: { label: string; n: number; href: string }) {
  return (
    <Link href={href}>
      <Card className={`p-3 transition-shadow hover:shadow-sm ${n > 0 ? "border-red-200 bg-red-50" : ""}`}>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className={`mt-1 text-lg font-bold tabular ${n > 0 ? "text-red-600" : "text-neutral-300"}`}>{n}</p>
      </Card>
    </Link>
  );
}

function AgingMini({
  title, total, overdue, tone, buckets,
}: {
  title: string; total: number; overdue: number; tone: "emerald" | "rose";
  buckets: { label: string; amt: number; over: boolean }[];
}) {
  const color = tone === "emerald" ? "text-emerald-700" : "text-rose-700";
  const shown = buckets.filter((b) => b.amt > 0);
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">{title} · 미결제</p>
        {overdue > 0 && <span className="text-[11px] font-medium text-rose-600">연체 {krw(overdue)}</span>}
      </div>
      <p className={`mt-1 text-lg font-bold tabular ${color}`}>{krw(total)}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {shown.length === 0 ? (
          <span className="text-[11px] text-neutral-400">없음</span>
        ) : (
          shown.map((b, i) => (
            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] tabular ${b.over ? "bg-rose-50 text-rose-600" : "bg-neutral-100 text-neutral-500"}`}>
              {b.label} {krw(b.amt)}
            </span>
          ))
        )}
      </div>
    </Card>
  );
}
