// 직원·거래처 상세에서 공용으로 쓰는 페이백 내역 표시.
// 페이백은 통장원장에서 생성·지불 처리되므로 여기서는 읽기 전용으로 보여준다.
import Link from "next/link";
import { krw, PAYBACK_STATUS_LABEL } from "@/lib/labels";

export interface PaybackBrief {
  id: string;
  date: string | null; // 출처 입금(통장) 거래일 — 없으면 null
  source: string; // 통장 적요 등
  gross_amount: number;
  tax_rate: number;
  tax_amount: number;
  net_amount: number;
  status: string; // PENDING | PAID
  paid_at: string | null;
}

export function PaybackList({
  rows,
  title,
  term = "페이백",
}: {
  rows: PaybackBrief[];
  title?: string;
  /** 화면 용어. 직원 화면은 "포인트", 거래처는 "페이백". */
  term?: string;
}) {
  const gross = rows.reduce((s, p) => s + p.gross_amount, 0);
  const tax = rows.reduce((s, p) => s + p.tax_amount, 0);
  const net = rows.reduce((s, p) => s + p.net_amount, 0);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">
          {title ?? `💸 ${term}`} <span className="ml-1 text-xs font-normal text-neutral-400">{rows.length}건</span>
        </h3>
        <Link href="/paybacks" className="text-xs text-neutral-500 hover:text-neutral-800">
          {term} 관리 →
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutral-400">
          {term} 내역이 없습니다. 통장원장 입금 건에서 추가할 수 있습니다.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                <tr>
                  <th className="px-5 py-2">거래일</th>
                  <th className="px-3 py-2">출처</th>
                  <th className="px-3 py-2 text-right">총액</th>
                  <th className="px-3 py-2 text-right">원천징수</th>
                  <th className="px-3 py-2 text-right">실지급</th>
                  <th className="px-5 py-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2 text-neutral-600">{p.date ?? "-"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-neutral-500" title={p.source}>
                      {p.source || "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{krw(p.gross_amount)}</td>
                    <td className="px-3 py-2 text-right tabular text-rose-600">
                      {p.tax_rate}% −{krw(p.tax_amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular font-semibold">{krw(p.net_amount)}</td>
                    <td className="px-5 py-2 text-center">
                      {p.status === "PAID" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          {PAYBACK_STATUS_LABEL.PAID} {p.paid_at ?? ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {PAYBACK_STATUS_LABEL.PENDING}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-semibold">
                <tr>
                  <td className="px-5 py-2" colSpan={2}>
                    합계
                  </td>
                  <td className="px-3 py-2 text-right tabular">{krw(gross)}</td>
                  <td className="px-3 py-2 text-right tabular text-rose-600">−{krw(tax)}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(net)}</td>
                  <td className="px-5 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** 페이백 원본 행 → 표시용 brief 매핑(거래일·출처는 통장거래에서 보강). */
export function toPaybackBrief(
  p: {
    id: string;
    bank_transaction_id: string | null;
    gross_amount: number;
    tax_rate: number;
    tax_amount: number;
    net_amount: number;
    status: string;
    paid_at: string | null;
  },
  txnDate: Map<string, string>,
  txnDesc: Map<string, string>
): PaybackBrief {
  return {
    id: p.id,
    date: p.bank_transaction_id ? txnDate.get(p.bank_transaction_id) ?? null : null,
    source: p.bank_transaction_id ? txnDesc.get(p.bank_transaction_id) ?? "" : "",
    gross_amount: p.gross_amount,
    tax_rate: p.tax_rate,
    tax_amount: p.tax_amount,
    net_amount: p.net_amount,
    status: p.status,
    paid_at: p.paid_at,
  };
}
