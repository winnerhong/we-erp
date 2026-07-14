"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { krw } from "@/lib/labels";

interface Session { id: string; date: string | null; title: string | null; instructor: string | null; present: number | null; note: string | null; done: boolean }
interface Ledger { id: string; date: string | null; type: string; title: string | null; qty: number; amount: number; status: string; settled: boolean }
interface Settle { id: string; title: string; period: string | null; total: number; status: string; issuedAt: string | null; paidAt: string | null }
interface Tax { id: string; type: string; docDate: string | null; supply: number; vat: number; total: number; status: string; settled: boolean }
interface Rcpt { id: string; vendor: string | null; date: string | null; total: number | null; status: string; evidence: string | null }
interface FileItem { id: string; title: string; fileName: string; category: string | null; sizeBytes: number | null; createdAt: string; url: string | null }
interface Notice { id: string; title: string; body: string | null; publishedAt: string | null; pinned: boolean }

interface Props {
  partner: { name: string; category: string | null; contact_name: string | null; phone: string | null; photo_url: string | null };
  supplier: { name: string; biz_no: string | null; ceo_name: string | null } | null;
  userName: string | null;
  summary: { receivable: number; thisMonthTotal: number; month: string };
  sessions: Session[];
  ledger: Ledger[];
  settlements: Settle[];
  taxInvoices: Tax[];
  receipts: Rcpt[];
  files: FileItem[];
  notices: Notice[];
}

const TABS = [
  { key: "sessions", label: "🤸 수업 일정·진도" },
  { key: "finance", label: "📊 거래·정산" },
  { key: "docs", label: "🧾 세금계산서·영수증" },
  { key: "files", label: "📎 문서·공지" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TXN_TYPE: Record<string, string> = { CLASS: "수업", EVENT: "행사", RENTAL: "렌탈", ETC: "기타" };
const SETTLE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "미발행", cls: "bg-neutral-100 text-neutral-600" },
  ISSUED: { label: "발행", cls: "bg-blue-100 text-blue-700" },
  PAID: { label: "입금완료", cls: "bg-emerald-100 text-emerald-700" },
};

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function PortalClient(props: Props) {
  const { partner, supplier, userName, summary } = props;
  const [tab, setTab] = useState<TabKey>("sessions");

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base">🏫</span>
            <span className="font-bold text-neutral-900">거래처 포털</span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">{supplier?.name ?? "위너"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span>{userName ?? partner.name} 님</span>
            <form action={logout}>
              <button className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">로그아웃</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {/* 헤더 카드 */}
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-5 text-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 text-2xl font-bold backdrop-blur">
                {partner.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={partner.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  partner.name.slice(0, 1)
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold">{partner.name}</h1>
                <p className="mt-0.5 text-sm text-white/80">
                  {partner.category ?? "거래처"}
                  {partner.contact_name && ` · 담당 ${partner.contact_name}`}
                  {partner.phone && ` · ${partner.phone}`}
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <p className="text-xs text-white/70">미납액(미수금)</p>
                <p className="text-lg font-bold tabular-nums">{krw(summary.receivable)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/70">이번달 거래({summary.month.slice(5)}월)</p>
                <p className="text-lg font-bold tabular-nums">{krw(summary.thisMonthTotal)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-emerald-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "sessions" && <SessionsTab sessions={props.sessions} />}
        {tab === "finance" && <FinanceTab ledger={props.ledger} settlements={props.settlements} />}
        {tab === "docs" && <DocsTab taxInvoices={props.taxInvoices} receipts={props.receipts} />}
        {tab === "files" && <FilesTab files={props.files} notices={props.notices} />}

        <p className="mt-6 text-center text-xs text-neutral-400">
          이 페이지는 조회 전용입니다. 문의는 담당자에게 연락해주세요.
        </p>
      </main>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-neutral-200 bg-white p-1">{children}</div>;
}
function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-16 text-center text-sm text-neutral-400">{msg}</p>;
}

function SessionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return <Panel><Empty msg="등록된 수업이 없습니다." /></Panel>;
  const done = sessions.filter((s) => s.done).length;
  const present = sessions.reduce((a, s) => a + (s.present ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Stat label="총 수업" value={`${sessions.length}회`} />
        <Stat label="완료" value={`${done}회`} tone="emerald" />
        <Stat label="누적 출석" value={`${present}명`} tone="blue" />
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">일자</th>
                <th className="px-4 py-2.5">반·수업</th>
                <th className="px-4 py-2.5">강사</th>
                <th className="px-4 py-2.5 text-right">출석</th>
                <th className="px-4 py-2.5">진도·특이사항</th>
                <th className="px-4 py-2.5 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {sessions.map((s) => (
                <tr key={s.id} className={s.done ? "" : "bg-amber-50/30"}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-neutral-500 tabular-nums">{s.date ?? "-"}</td>
                  <td className="px-4 py-2.5 font-medium text-neutral-800">{s.title || "수업"}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{s.instructor ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{s.present != null ? `${s.present}명` : "-"}</td>
                  <td className="max-w-[280px] truncate px-4 py-2.5 text-neutral-500" title={s.note ?? ""}>{s.note || "-"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {s.done ? "완료" : "예정"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FinanceTab({ ledger, settlements }: { ledger: Ledger[]; settlements: Settle[] }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">정산 내역</h3>
        <Panel>
          {settlements.length === 0 ? (
            <Empty msg="정산 내역이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5">정산명</th>
                    <th className="px-4 py-2.5">기간</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-4 py-2.5 text-center">상태</th>
                    <th className="px-4 py-2.5 text-center">명세서</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {settlements.map((s) => {
                    const st = SETTLE_STATUS[s.status] ?? { label: s.status, cls: "bg-neutral-100 text-neutral-600" };
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-medium text-neutral-800">{s.title}</td>
                        <td className="px-4 py-2.5 text-neutral-500">{s.period ?? "-"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{krw(s.total)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <a
                            href={`/portal/statement/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            🧾 명세서
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">거래 내역</h3>
        <Panel>
          {ledger.length === 0 ? (
            <Empty msg="거래 내역이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5">일자</th>
                    <th className="px-4 py-2.5">구분</th>
                    <th className="px-4 py-2.5">내용</th>
                    <th className="px-4 py-2.5 text-right">수량</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-4 py-2.5 text-center">정산</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {ledger.slice(0, 300).map((t) => (
                    <tr key={t.id} className={t.status === "CANCELED" ? "text-neutral-400 line-through" : ""}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-neutral-500 tabular-nums">{t.date ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{TXN_TYPE[t.type] ?? t.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700">{t.title || "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">{t.qty}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{krw(t.amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {t.settled ? <span className="text-[11px] text-emerald-600">정산완료</span> : <span className="text-[11px] text-neutral-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function DocsTab({ taxInvoices, receipts }: { taxInvoices: Tax[]; receipts: Rcpt[] }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">세금계산서</h3>
        <Panel>
          {taxInvoices.length === 0 ? (
            <Empty msg="세금계산서가 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5">일자</th>
                    <th className="px-4 py-2.5">구분</th>
                    <th className="px-4 py-2.5 text-right">공급가</th>
                    <th className="px-4 py-2.5 text-right">세액</th>
                    <th className="px-4 py-2.5 text-right">합계</th>
                    <th className="px-4 py-2.5 text-center">정산</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {taxInvoices.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-neutral-500 tabular-nums">{t.docDate ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${t.type === "SALES" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                          {t.type === "SALES" ? "매출(발행)" : "매입(수취)"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{krw(t.supply)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{krw(t.vat)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{krw(t.total)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {t.settled ? <span className="text-[11px] text-emerald-600">완료</span> : <span className="text-[11px] text-rose-500">미정산</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">영수증·증빙</h3>
        <Panel>
          {receipts.length === 0 ? (
            <Empty msg="영수증이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2.5">일자</th>
                    <th className="px-4 py-2.5">상호</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-4 py-2.5 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-neutral-500 tabular-nums">{r.date ?? "-"}</td>
                      <td className="px-4 py-2.5 text-neutral-700">{r.vendor ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{krw(r.total ?? 0)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {r.status === "CONFIRMED" ? "확정" : "검수중"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function FilesTab({ files, notices }: { files: FileItem[]; notices: Notice[] }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">공지사항</h3>
        {notices.length === 0 ? (
          <Panel><Empty msg="공지가 없습니다." /></Panel>
        ) : (
          <div className="space-y-2">
            {notices.map((n) => (
              <div key={n.id} className={`rounded-2xl border bg-white p-4 ${n.pinned ? "border-amber-300" : "border-neutral-200"}`}>
                <div className="flex items-center gap-1.5">
                  {n.pinned && <span title="상단고정">📌</span>}
                  <h4 className="font-bold text-neutral-800">{n.title}</h4>
                  {n.publishedAt && <span className="ml-auto text-[11px] text-neutral-400">{n.publishedAt.slice(0, 10)}</span>}
                </div>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">문서함</h3>
        <Panel>
          {files.length === 0 ? (
            <Empty msg="공유된 문서가 없습니다." />
          ) : (
            <ul className="divide-y divide-neutral-50">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">📄</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{f.title || f.fileName}</p>
                    <p className="text-xs text-neutral-400">
                      {f.category && `${f.category} · `}
                      {fmtSize(f.sizeBytes)} · {f.createdAt.slice(0, 10)}
                    </p>
                  </div>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                      다운로드
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-300">-</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const cls = tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-neutral-200 bg-white text-neutral-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${cls}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </span>
  );
}
