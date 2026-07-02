"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { krw, PAYBACK_STATUS_LABEL } from "@/lib/labels";
import { downloadXlsx } from "@/lib/sheet";
import type { PaybackRow } from "@/lib/supabase/database.types";
import { payPayback, unpayPayback, deletePayback } from "@/app/(erp)/bank/actions";

// 원천징수율 → 소득구분 추정
function incomeTypeOf(rate: number): string {
  if (rate === 3.3) return "사업소득";
  if (rate === 8.8) return "기타소득";
  return "기타";
}
// 합계 원천세 → 소득세 / 지방소득세 분리(지방세 = 소득세 × 10% → 합계 = 소득세 × 1.1)
function splitTax(tax: number): { income: number; local: number } {
  const income = Math.round(tax / 1.1);
  return { income, local: tax - income };
}

export interface PaybackView extends PaybackRow {
  recipientName: string;
  sourceDate: string | null;
  sourceDesc: string;
}

type Tab = "ALL" | "PENDING" | "PAID";

export function PaybacksClient({ rows }: { rows: PaybackView[] }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "report">("list");
  const [tab, setTab] = useState<Tab>("ALL");
  const [recipType, setRecipType] = useState<"ALL" | "EMPLOYEE" | "PARTNER">("ALL");
  const [q, setQ] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [pending, startTransition] = useTransition();

  const sumGross = (xs: PaybackView[]) => xs.reduce((s, p) => s + p.gross_amount, 0);
  const sumTax = (xs: PaybackView[]) => xs.reduce((s, p) => s + p.tax_amount, 0);
  const sumNet = (xs: PaybackView[]) => xs.reduce((s, p) => s + p.net_amount, 0);

  // 대상유형·이름 필터(상태와 무관) → 요약카드·탭의 모집단
  const query = q.trim().toLowerCase();
  const scopeRows = rows.filter(
    (r) =>
      (recipType === "ALL" || r.recipient_type === recipType) &&
      (!query || r.recipientName.toLowerCase().includes(query))
  );
  const pendingRows = scopeRows.filter((r) => r.status === "PENDING");
  const paidRows = scopeRows.filter((r) => r.status === "PAID");
  const filtered = scopeRows.filter((r) => (tab === "ALL" ? true : r.status === tab));

  // 대상별 묶어보기 집계
  const groupKey = (r: PaybackView) => `${r.recipient_type}:${r.employee_id ?? r.partner_id ?? r.recipientName}`;
  const groupMap = new Map<
    string,
    { name: string; type: string; count: number; gross: number; tax: number; net: number; pending: number }
  >();
  for (const r of filtered) {
    const k = groupKey(r);
    const g =
      groupMap.get(k) ??
      { name: r.recipientName, type: r.recipient_type === "EMPLOYEE" ? "직원" : "거래처", count: 0, gross: 0, tax: 0, net: 0, pending: 0 };
    g.count += 1;
    g.gross += r.gross_amount;
    g.tax += r.tax_amount;
    g.net += r.net_amount;
    if (r.status === "PENDING") g.pending += 1;
    groupMap.set(k, g);
  }
  const groupList = [...groupMap.values()].sort((a, b) => b.gross - a.gross);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-neutral-900">💸 페이백</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-neutral-200 p-0.5 text-sm">
            {([
              ["list", "목록"],
              ["report", "원천세 신고자료"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`rounded-md px-3 py-1 font-medium ${
                  view === k ? "bg-indigo-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link href="/bank" className="text-sm text-neutral-500 hover:text-neutral-800">
            통장원장에서 추가 →
          </Link>
        </div>
      </div>

      {view === "report" ? (
        <ReportView rows={rows} />
      ) : (
        <>
      {/* 요약 카드 (현재 필터 기준) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="요청받음" value={krw(sumNet(pendingRows))} sub={`${pendingRows.length}건 · 총 ${krw(sumGross(pendingRows))}`} tone="amber" />
        <Card label="지불완료" value={krw(sumNet(paidRows))} sub={`${paidRows.length}건 · 총 ${krw(sumGross(paidRows))}`} tone="emerald" />
        <Card label="원천징수세액" value={krw(sumTax(scopeRows))} sub="원천세 신고 참고" tone="rose" />
        <Card label="페이백 총액" value={krw(sumGross(scopeRows))} sub={`${scopeRows.length}건`} tone="neutral" />
      </div>

      {/* 필터 바 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-neutral-200 p-0.5 text-sm">
          {([
            ["ALL", "전체"],
            ["EMPLOYEE", "💼 직원"],
            ["PARTNER", "🏢 거래처"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRecipType(k)}
              className={`rounded-md px-3 py-1 font-medium ${
                recipType === k ? "bg-indigo-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 대상 이름 검색"
          className="w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <label className="ml-auto flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          대상별 묶어보기
        </label>
      </div>

      {/* 상태 탭 */}
      <div className="mb-3 flex gap-1 border-b border-neutral-200">
        {([
          ["ALL", `전체 ${scopeRows.length}`],
          ["PENDING", `요청받음 ${pendingRows.length}`],
          ["PAID", `지불완료 ${paidRows.length}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {grouped ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-2">대상</th>
                <th className="px-3 py-2 text-right">건수</th>
                <th className="px-3 py-2 text-right">총액</th>
                <th className="px-3 py-2 text-right">원천징수</th>
                <th className="px-4 py-2 text-right">실지급</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {groupList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-400">
                    해당 조건의 페이백이 없습니다.
                  </td>
                </tr>
              ) : (
                groupList.map((g, i) => (
                  <tr
                    key={i}
                    onClick={() => {
                      setGrouped(false);
                      setQ(g.name);
                    }}
                    className="cursor-pointer hover:bg-neutral-50"
                    title="클릭하면 이 대상만 펼쳐봅니다"
                  >
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">{g.type}</span>
                      <span className="ml-2 font-medium">{g.name}</span>
                      {g.pending > 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">요청받음 {g.pending}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{g.count}</td>
                    <td className="px-3 py-2.5 text-right tabular">{krw(g.gross)}</td>
                    <td className="px-3 py-2.5 text-right tabular text-rose-600">−{krw(g.tax)}</td>
                    <td className="px-4 py-2.5 text-right tabular font-semibold">{krw(g.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {groupList.length > 0 && (
              <tfoot className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
                <tr>
                  <td className="px-4 py-2">합계 ({groupList.length}명/곳)</td>
                  <td className="px-3 py-2 text-right tabular">{filtered.length}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(sumGross(filtered))}</td>
                  <td className="px-3 py-2 text-right tabular text-rose-600">−{krw(sumTax(filtered))}</td>
                  <td className="px-4 py-2 text-right tabular">{krw(sumNet(filtered))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">거래일</th>
              <th className="px-3 py-2">대상</th>
              <th className="px-3 py-2">출처</th>
              <th className="px-3 py-2 text-right">총액</th>
              <th className="px-3 py-2 text-right">원천징수</th>
              <th className="px-3 py-2 text-right">실지급</th>
              <th className="px-3 py-2 text-center">상태</th>
              <th className="px-4 py-2 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-neutral-400">
                  페이백이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-600">{p.sourceDate ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                      {p.recipient_type === "EMPLOYEE" ? "직원" : "거래처"}
                    </span>
                    <span className="ml-2 font-medium">{p.recipientName}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-neutral-500" title={p.sourceDesc}>
                    {p.sourceDesc || "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{krw(p.gross_amount)}</td>
                  <td className="px-3 py-2 text-right tabular text-rose-600">
                    {p.tax_rate}% −{krw(p.tax_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular font-semibold">{krw(p.net_amount)}</td>
                  <td className="px-3 py-2 text-center">
                    {p.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        {PAYBACK_STATUS_LABEL.PAID} {p.paid_at ?? ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{PAYBACK_STATUS_LABEL.PENDING}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      {p.status === "PAID" ? (
                        <button
                          onClick={() => act(() => unpayPayback(p.id))}
                          disabled={pending}
                          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                        >
                          지불취소
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm(`${p.recipientName} 에게 ${krw(p.net_amount)} 지불 처리할까요?\n통장에 출금거래가 자동 생성됩니다.`))
                              act(() => payPayback(p.id));
                          }}
                          disabled={pending}
                          className="rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-indigo-500"
                        >
                          지불완료
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("이 페이백을 삭제할까요?" + (p.status === "PAID" ? "\n(자동 생성된 출금거래도 삭제됩니다)" : "")))
                            act(() => deletePayback(p.id));
                        }}
                        disabled={pending}
                        className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
        </>
      )}
    </div>
  );
}

// ---------- 원천세 신고자료 · 지급명세서 ----------
function ReportView({ rows }: { rows: PaybackView[] }) {
  // 신고는 '지급'시 발생 → 지급완료(paid_at) 기준
  const paid = rows.filter((r) => r.status === "PAID" && r.paid_at);
  const months = [...new Set(paid.map((r) => (r.paid_at ?? "").slice(0, 7)))].sort().reverse();
  const [month, setMonth] = useState(months[0] ?? "");

  const monthRows = paid.filter((r) => (r.paid_at ?? "").slice(0, 7) === month);

  // 대상별 집계
  const key = (r: PaybackView) => `${r.recipient_type}:${r.employee_id ?? r.partner_id ?? r.recipientName}`;
  const groups = new Map<
    string,
    {
      name: string;
      type: string;
      incomeType: string;
      count: number;
      gross: number;
      tax: number;
      net: number;
    }
  >();
  for (const r of monthRows) {
    const k = key(r);
    const g = groups.get(k) ?? {
      name: r.recipientName,
      type: r.recipient_type === "EMPLOYEE" ? "직원" : "거래처",
      incomeType: incomeTypeOf(r.tax_rate),
      count: 0,
      gross: 0,
      tax: 0,
      net: 0,
    };
    g.count += 1;
    g.gross += r.gross_amount;
    g.tax += r.tax_amount;
    g.net += r.net_amount;
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.gross - a.gross);

  const totGross = list.reduce((s, g) => s + g.gross, 0);
  const totTax = list.reduce((s, g) => s + g.tax, 0);
  const totNet = list.reduce((s, g) => s + g.net, 0);
  const totSplit = splitTax(totTax);

  function exportXlsx() {
    const headers = ["대상구분", "이름", "소득구분", "지급건수", "지급총액", "소득세", "지방소득세", "원천세 계", "실지급액"];
    const body = list.map((g) => {
      const s = splitTax(g.tax);
      return [g.type, g.name, g.incomeType, g.count, g.gross, s.income, s.local, g.tax, g.net];
    });
    body.push(["", "합계", "", monthRows.length, totGross, totSplit.income, totSplit.local, totTax, totNet]);
    downloadXlsx(`페이백_원천세_지급명세서_${month}`, headers, body, month);
  }

  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
        지불완료된 페이백이 없습니다. 페이백을 ‘지불완료’ 처리하면 원천세 신고자료가 집계됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-600">지급월</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <button
          onClick={exportXlsx}
          disabled={list.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-40"
        >
          ⬇ 엑셀(지급명세서)
        </button>
      </div>

      {/* 월 집계 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="지급총액" value={krw(totGross)} sub={`${monthRows.length}건`} tone="neutral" />
        <Card label="소득세" value={krw(totSplit.income)} sub="원천징수" tone="rose" />
        <Card label="지방소득세" value={krw(totSplit.local)} sub="소득세 × 10%" tone="amber" />
        <Card label="실지급액" value={krw(totNet)} sub="세후 지급" tone="emerald" />
      </div>

      {/* 지급명세서(대상별) */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">대상</th>
              <th className="px-3 py-2">소득구분</th>
              <th className="px-3 py-2 text-right">건수</th>
              <th className="px-3 py-2 text-right">지급총액</th>
              <th className="px-3 py-2 text-right">소득세</th>
              <th className="px-3 py-2 text-right">지방소득세</th>
              <th className="px-3 py-2 text-right">원천세 계</th>
              <th className="px-4 py-2 text-right">실지급액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-neutral-400">
                  해당 월 지급 내역이 없습니다.
                </td>
              </tr>
            ) : (
              list.map((g, i) => {
                const s = splitTax(g.tax);
                return (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">{g.type}</span>
                      <span className="ml-2 font-medium">{g.name}</span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{g.incomeType}</td>
                    <td className="px-3 py-2 text-right tabular">{g.count}</td>
                    <td className="px-3 py-2 text-right tabular">{krw(g.gross)}</td>
                    <td className="px-3 py-2 text-right tabular text-rose-600">{krw(s.income)}</td>
                    <td className="px-3 py-2 text-right tabular text-amber-600">{krw(s.local)}</td>
                    <td className="px-3 py-2 text-right tabular font-medium">{krw(g.tax)}</td>
                    <td className="px-4 py-2 text-right tabular font-semibold">{krw(g.net)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {list.length > 0 && (
            <tfoot className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={2}>합계</td>
                <td className="px-3 py-2 text-right tabular">{monthRows.length}</td>
                <td className="px-3 py-2 text-right tabular">{krw(totGross)}</td>
                <td className="px-3 py-2 text-right tabular text-rose-600">{krw(totSplit.income)}</td>
                <td className="px-3 py-2 text-right tabular text-amber-600">{krw(totSplit.local)}</td>
                <td className="px-3 py-2 text-right tabular">{krw(totTax)}</td>
                <td className="px-4 py-2 text-right tabular">{krw(totNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        ※ 소득세·지방소득세는 원천세 합계를 1:0.1 비율로 분리한 추정치입니다. 실제 신고(원천징수이행상황신고서·지급명세서)는 세무 검토 후 사용하세요.
      </p>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "amber" | "emerald" | "rose" | "neutral";
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50",
    emerald: "border-emerald-200 bg-emerald-50",
    rose: "border-rose-200 bg-rose-50",
    neutral: "border-neutral-200 bg-white",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-400">{sub}</p>
    </div>
  );
}
