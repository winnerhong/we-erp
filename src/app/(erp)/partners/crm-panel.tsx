"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NumberInput } from "@/components/ui";
import { krw } from "@/lib/labels";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_LABEL, CONTRACT_TYPE_ICON, CONTRACT_TYPE_TONE, CONTRACT_STATUS_LABEL,
  SETTLE_UNIT_LABEL, TXN_STATUS_LABEL, TXN_STATUS_TONE, EVIDENCE_TYPE_LABEL,
  SETTLEMENT_STATUS_LABEL, SETTLEMENT_STATUS_TONE, crmChip, autoGrade,
} from "@/lib/crm";
import type { ContractRow, TransactionRow, SettlementRow, PartnerAttachmentRow, ContractType } from "@/lib/supabase/database.types";
import { FileButton } from "@/components/ui";
import { fmtSize, fileIcon } from "@/lib/library";
import {
  createContract, updateContract, deleteContract,
  createTransaction, updateTransaction, deleteTransaction, generateMonthlyClassTxns,
  generateMonthlySettlement, updateSettlementStatus, deleteSettlement, createTaxInvoiceFromSettlement,
  uploadPartnerFile, getPartnerFileUrl, deletePartnerFile,
} from "./crm-actions";

const ATTACH_CATEGORIES = ["사업자등록증", "통장사본", "계약서", "견적서", "기타"];

function readBase64(file: File): Promise<{ base64: string; mime: string; name: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve({ base64: s.split(",")[1] ?? "", mime: file.type || "application/octet-stream", name: file.name }); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type Emp = { id: string; name: string };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

// ============ KPI 카드 ============
export function CrmKpis({ transactions }: { transactions: TransactionRow[] }) {
  const k = useMemo(() => {
    const live = transactions.filter((t) => t.status !== "CANCELED");
    const now = new Date();
    const yr = now.getFullYear();
    const total = live.reduce((s, t) => s + t.amount, 0);
    const thisYear = live.filter((t) => t.txn_date.startsWith(`${yr}`)).reduce((s, t) => s + t.amount, 0);
    const lastYear = live.filter((t) => t.txn_date.startsWith(`${yr - 1}`)).reduce((s, t) => s + t.amount, 0);
    const m3 = new Date(now); m3.setMonth(m3.getMonth() - 3);
    const cut = m3.toISOString().slice(0, 10);
    const last3 = live.filter((t) => t.txn_date >= cut).reduce((s, t) => s + t.amount, 0);
    const planned = transactions.filter((t) => t.status === "PLANNED").reduce((s, t) => s + t.amount, 0);
    const dates = live.map((t) => t.txn_date).sort();
    const growth = lastYear > 0 ? Math.round(((thisYear - lastYear) / lastYear) * 100) : null;
    return { total, thisYear, last3, planned, count: live.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, growth };
  }, [transactions]);
  const grade = autoGrade(k.total);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi label="누적 거래액" value={krw(k.total)} badge={grade.label} badgeTone={grade.tone} />
      <Kpi label="올해 거래액" value={krw(k.thisYear)} sub={k.growth !== null ? `전년比 ${k.growth >= 0 ? "▲" : "▼"}${Math.abs(k.growth)}%` : undefined} subTone={k.growth !== null && k.growth < 0 ? "rose" : "emerald"} />
      <Kpi label="최근 3개월" value={krw(k.last3)} />
      <Kpi label="거래 건수" value={`${k.count.toLocaleString()}건`} />
      <Kpi label="정산 예정" value={krw(k.planned)} subTone="amber" />
      <Kpi label="거래 기간" value={k.first ? `${k.first.slice(2)} ~` : "-"} sub={k.last ? `최근 ${k.last.slice(2)}` : undefined} />
    </div>
  );
}
function Kpi({ label, value, sub, subTone, badge, badgeTone }: { label: string; value: string; sub?: string; subTone?: string; badge?: string; badgeTone?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-neutral-500">{label}</p>
        {badge && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${crmChip(badgeTone)}`}>{badge}</span>}
      </div>
      <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">{value}</p>
      {sub && <p className={`text-[11px] font-medium ${subTone === "rose" ? "text-rose-500" : subTone === "amber" ? "text-amber-600" : "text-emerald-600"}`}>{sub}</p>}
    </div>
  );
}

// ============ 계약 탭 ============
export function ContractsTab({
  partnerId, companyId, contracts, employees, onChanged,
}: {
  partnerId: string; companyId: string | null; contracts: ContractRow[]; employees: Emp[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ContractRow | "new" | null>(null);
  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">📑 계약 <span className="text-xs font-normal text-neutral-400">{contracts.length}건</span></h3>
        <button onClick={() => setEditing("new")} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">+ 계약 등록</button>
      </div>
      {contracts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">등록된 계약이 없습니다. 수업·행사·렌탈 계약을 추가하세요.</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <ContractCard key={c.id} c={c} empName={empName} onEdit={() => setEditing(c)} onChanged={onChanged} />
          ))}
        </div>
      )}
      {editing && (
        <ContractModal
          contract={editing === "new" ? null : editing}
          partnerId={partnerId} companyId={companyId} employees={employees}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function ContractCard({ c, empName, onEdit, onChanged }: { c: ContractRow; empName: Map<string, string>; onEdit: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const type = c.type as ContractType;
  const d = c.detail ?? {};
  const dows = Array.isArray(d.dows) ? (d.dows as number[]) : [];
  // 만료 임박(D-30) — 진행중 + 종료일이 30일 이내
  let dday: number | null = null;
  if (c.status === "ACTIVE" && c.end_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(`${c.end_date}T00:00:00`);
    dday = Math.round((end.getTime() - today.getTime()) / 86400000);
  }
  const expiring = dday !== null && dday >= 0 && dday <= 30;

  function genThisMonth() {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    startTransition(async () => {
      const r = await generateMonthlyClassTxns(c.id, month);
      if (!r.ok) { alert(r.error); return; }
      alert(`${month} 수업 회차 ${r.count ?? 0}건 생성됨`);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`'${c.name}' 계약을 삭제할까요? (연결된 거래내역은 유지)`)) return;
    startTransition(async () => { const r = await deleteContract(c.id); if (!r.ok) alert(r.error); else onChanged(); });
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="text-xl">{CONTRACT_TYPE_ICON[type]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${crmChip(CONTRACT_TYPE_TONE[type])}`}>{CONTRACT_TYPE_LABEL[type]}</span>
            <span className="font-semibold text-neutral-800">{c.name}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{CONTRACT_STATUS_LABEL[c.status] ?? c.status}</span>
            {expiring && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">⏰ {dday === 0 ? "오늘 만료" : `D-${dday} 만료임박`}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
            {(c.start_date || c.end_date) && <span>{c.start_date ?? "?"} ~ {c.end_date ?? "?"}</span>}
            {type === "CLASS" && dows.length > 0 && <span>매주 {dows.map((n) => DOW[n]).join("·")}{d.time ? ` ${d.time}` : ""}</span>}
            {c.instructor_id && <span>강사 {empName.get(c.instructor_id) ?? "?"}</span>}
            {c.unit_price != null && <span>단가 {krw(c.unit_price)}</span>}
            <span>{SETTLE_UNIT_LABEL[c.settle_unit] ?? c.settle_unit}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {type === "CLASS" && (
            <button onClick={genThisMonth} disabled={pending} title="이번달 수업 회차 자동 생성" className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50">↻ 회차생성</button>
          )}
          <button onClick={onEdit} className="rounded-lg px-2 py-1 text-xs hover:bg-neutral-100">✏️</button>
          <button onClick={remove} disabled={pending} className="rounded-lg px-2 py-1 text-xs text-rose-400 hover:bg-rose-50">🗑</button>
        </div>
      </div>
    </div>
  );
}

function ContractModal({
  contract, partnerId, companyId, employees, onClose, onSaved,
}: {
  contract: ContractRow | null; partnerId: string; companyId: string | null; employees: Emp[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !contract;
  const [pending, startTransition] = useTransition();
  const d0 = contract?.detail ?? {};
  const [type, setType] = useState<string>(contract?.type ?? "CLASS");
  const [name, setName] = useState(contract?.name ?? "");
  const [status, setStatus] = useState(contract?.status ?? "ACTIVE");
  const [start, setStart] = useState(contract?.start_date ?? "");
  const [end, setEnd] = useState(contract?.end_date ?? "");
  const [settle, setSettle] = useState(contract?.settle_unit ?? "MONTHLY");
  const [evidence, setEvidence] = useState(contract?.evidence_type ?? "TAX_INVOICE");
  const [unitPrice, setUnitPrice] = useState(contract?.unit_price?.toString() ?? "");
  const [instructor, setInstructor] = useState(contract?.instructor_id ?? "");
  const [memo, setMemo] = useState(contract?.memo ?? "");
  // 유형별 detail
  const [dows, setDows] = useState<number[]>(Array.isArray(d0.dows) ? (d0.dows as number[]) : []);
  const [time, setTime] = useState(typeof d0.time === "string" ? d0.time : "");
  const [className, setClassName] = useState(typeof d0.class_name === "string" ? d0.class_name : "");
  const [headcount, setHeadcount] = useState(d0.headcount != null ? String(d0.headcount) : "");
  const [place, setPlace] = useState(typeof d0.place === "string" ? d0.place : "");
  const [eventDate, setEventDate] = useState(typeof d0.event_date === "string" ? d0.event_date : "");
  const [programs, setPrograms] = useState(typeof d0.programs === "string" ? d0.programs : "");
  const [items, setItems] = useState(typeof d0.items === "string" ? d0.items : "");
  const [periodUnit, setPeriodUnit] = useState(typeof d0.period_unit === "string" ? d0.period_unit : "DAY");

  function buildDetail(): Record<string, unknown> {
    if (type === "CLASS") return { dows, time, class_name: className, headcount: headcount ? Number(headcount) : null };
    if (type === "EVENT") return { event_date: eventDate, place, programs, headcount: headcount ? Number(headcount) : null };
    return { items, period_unit: periodUnit };
  }
  function save() {
    if (!name.trim()) { alert("계약명을 입력하세요"); return; }
    const input = {
      partner_id: partnerId, company_id: companyId, type, name, status,
      start_date: start || null, end_date: end || null, settle_unit: settle,
      evidence_type: evidence, unit_price: unitPrice || null, instructor_id: instructor || null,
      memo, detail: buildDetail(),
    };
    startTransition(async () => {
      const r = isNew ? await createContract(input) : await updateContract(contract!.id, input);
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }
  function toggleDow(n: number) { setDows((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort())); }

  return (
    <ModalShell title={isNew ? "계약 등록" : "계약 수정"} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{pending ? "저장 중…" : isNew ? "등록" : "저장"}</button>
      </>
    }>
      <div className="flex gap-1.5">
        {CONTRACT_TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${type === t ? crmChip(CONTRACT_TYPE_TONE[t]) + " ring-1 ring-neutral-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
            {CONTRACT_TYPE_ICON[t]} {CONTRACT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <Lbl t="계약명"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "CLASS" ? "예: 2026 봄학기 체육수업" : type === "EVENT" ? "예: 가을 체육 페스티벌" : "예: 키즈카페 교구 렌탈"} /></Lbl>
      <div className="grid grid-cols-2 gap-3">
        <Lbl t="상태"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(CONTRACT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Lbl>
        <Lbl t="정산 단위"><select className={inputCls} value={settle} onChange={(e) => setSettle(e.target.value)}>{Object.entries(SETTLE_UNIT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Lbl>
        <Lbl t="시작일"><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Lbl>
        <Lbl t="종료일"><input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Lbl>
        <Lbl t={type === "CLASS" ? "회당 단가" : type === "EVENT" ? "계약 금액" : "대여 단가"}><NumberInput value={unitPrice} onChange={setUnitPrice} className="w-full" /></Lbl>
        <Lbl t="증빙"><select className={inputCls} value={evidence} onChange={(e) => setEvidence(e.target.value)}>{Object.entries(EVIDENCE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Lbl>
      </div>

      {type === "CLASS" && (
        <div className="space-y-3 rounded-lg bg-blue-50/50 p-3">
          <Lbl t="수업 요일">
            <div className="flex gap-1">
              {DOW.map((label, n) => (
                <button key={n} type="button" onClick={() => toggleDow(n)} className={`h-8 w-8 rounded-full text-xs font-medium ${dows.includes(n) ? "bg-blue-600 text-white" : "bg-white text-neutral-500 ring-1 ring-neutral-200"}`}>{label}</button>
              ))}
            </div>
          </Lbl>
          <div className="grid grid-cols-2 gap-3">
            <Lbl t="시간"><input className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} placeholder="14:00" /></Lbl>
            <Lbl t="반"><input className={inputCls} value={className} onChange={(e) => setClassName(e.target.value)} placeholder="베이비반" /></Lbl>
            <Lbl t="인원"><NumberInput value={headcount} onChange={setHeadcount} className="w-full" /></Lbl>
            <Lbl t="담당 강사"><select className={inputCls} value={instructor} onChange={(e) => setInstructor(e.target.value)}><option value="">선택</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Lbl>
          </div>
        </div>
      )}
      {type === "EVENT" && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-violet-50/50 p-3">
          <Lbl t="행사일"><input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></Lbl>
          <Lbl t="장소"><input className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} /></Lbl>
          <Lbl t="예상 인원"><NumberInput value={headcount} onChange={setHeadcount} className="w-full" /></Lbl>
          <Lbl t="담당"><select className={inputCls} value={instructor} onChange={(e) => setInstructor(e.target.value)}><option value="">선택</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Lbl>
          <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-neutral-500">프로그램 구성</span><textarea className={inputCls} value={programs} onChange={(e) => setPrograms(e.target.value)} /></label>
        </div>
      )}
      {type === "RENTAL" && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50/50 p-3">
          <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-neutral-500">대여 품목</span><input className={inputCls} value={items} onChange={(e) => setItems(e.target.value)} placeholder="매트 20, 콘 30, 키즈카페 공간" /></label>
          <Lbl t="단가 단위"><select className={inputCls} value={periodUnit} onChange={(e) => setPeriodUnit(e.target.value)}><option value="HOUR">시간당</option><option value="DAY">일당</option><option value="WEEK">주당</option><option value="MONTH">월당</option><option value="PACKAGE">패키지</option></select></Lbl>
        </div>
      )}
      <Lbl t="메모"><textarea className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} /></Lbl>
    </ModalShell>
  );
}

// ============ 거래내역 탭 ============
export function TransactionsTab({
  partnerId, companyId, contracts, transactions, employees, onChanged,
}: {
  partnerId: string; companyId: string | null; contracts: ContractRow[]; transactions: TransactionRow[]; employees: Emp[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<TransactionRow | "new" | null>(null);
  const [typeF, setTypeF] = useState<string>("ALL");
  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const contractName = useMemo(() => new Map(contracts.map((c) => [c.id, c.name])), [contracts]);

  const shown = typeF === "ALL" ? transactions : transactions.filter((t) => t.type === typeF);

  // 월별 추이(최근 6개월)
  const trend = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) { const dt = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, label: `${dt.getMonth() + 1}월` }); }
    const by: Record<string, number> = {};
    for (const t of transactions) { if (t.status === "CANCELED") continue; const k = t.txn_date.slice(0, 7); by[k] = (by[k] ?? 0) + t.amount; }
    const max = Math.max(1, ...months.map((m) => by[m.key] ?? 0));
    return { months: months.map((m) => ({ ...m, amount: by[m.key] ?? 0 })), max };
  }, [transactions]);

  return (
    <div className="space-y-3">
      {/* 월별 추이 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-neutral-500">월별 거래액 추이</p>
        <div className="flex items-end gap-2">
          {trend.months.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center">
                <div title={krw(m.amount)} style={{ height: `${(m.amount / trend.max) * 100}%` }} className="w-5 rounded-t bg-teal-400" />
              </div>
              <span className="text-[10px] text-neutral-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[{ v: "ALL", l: "전체" }, ...CONTRACT_TYPES.map((t) => ({ v: t, l: CONTRACT_TYPE_LABEL[t] }))].map((f) => (
            <button key={f.v} onClick={() => setTypeF(f.v)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${typeF === f.v ? "bg-neutral-900 text-white" : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>{f.l}</button>
          ))}
        </div>
        <button onClick={() => setEditing("new")} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">+ 거래 입력</button>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">거래내역이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">일자</th><th className="px-3 py-2">유형</th><th className="px-3 py-2">내용</th>
                <th className="px-3 py-2 text-right">수량</th><th className="px-3 py-2 text-right">단가</th><th className="px-3 py-2 text-right">금액</th>
                <th className="px-3 py-2">상태</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {shown.map((t) => {
                const ty = t.type as ContractType;
                return (
                  <tr key={t.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-600">{t.txn_date.slice(2)}</td>
                    <td className="px-3 py-2"><span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${crmChip(CONTRACT_TYPE_TONE[ty] ?? "neutral")}`}>{CONTRACT_TYPE_LABEL[ty] ?? t.type}</span></td>
                    <td className="px-3 py-2"><span className="text-neutral-800">{t.title || "-"}</span>{t.contract_id && contractName.get(t.contract_id) && <span className="ml-1 text-[11px] text-neutral-400">({contractName.get(t.contract_id)})</span>}{t.instructor_id && <span className="ml-1 text-[11px] text-neutral-400">· {empName.get(t.instructor_id)}</span>}{t.settlement_id && <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-600">정산됨</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.qty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{krw(t.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{krw(t.amount)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${crmChip(TXN_STATUS_TONE[t.status as keyof typeof TXN_STATUS_TONE] ?? "neutral")}`}>{TXN_STATUS_LABEL[t.status as keyof typeof TXN_STATUS_LABEL] ?? t.status}</span></td>
                    <td className="px-3 py-2 text-right"><button onClick={() => setEditing(t)} className="text-xs text-neutral-400 hover:text-neutral-800">✏️</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TxnModal
          txn={editing === "new" ? null : editing}
          partnerId={partnerId} companyId={companyId} contracts={contracts} employees={employees}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function TxnModal({
  txn, partnerId, companyId, contracts, employees, onClose, onSaved,
}: {
  txn: TransactionRow | null; partnerId: string; companyId: string | null; contracts: ContractRow[]; employees: Emp[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !txn;
  const [pending, startTransition] = useTransition();
  const [contractId, setContractId] = useState(txn?.contract_id ?? "");
  const [type, setType] = useState(txn?.type ?? "CLASS");
  const [date, setDate] = useState(txn?.txn_date ?? new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(txn?.title ?? "");
  const [qty, setQty] = useState(txn?.qty?.toString() ?? "1");
  const [unit, setUnit] = useState(txn?.unit_price?.toString() ?? "");
  const [instructor, setInstructor] = useState(txn?.instructor_id ?? "");
  const [status, setStatus] = useState(txn?.status ?? "DONE");
  const [memo, setMemo] = useState(txn?.memo ?? "");
  const amount = (Number(qty.replace(/[^\d.-]/g, "")) || 0) * (Number(unit.replace(/[^\d.-]/g, "")) || 0);

  function pickContract(id: string) {
    setContractId(id);
    const c = contracts.find((x) => x.id === id);
    if (c) {
      setType(c.type);
      if (c.unit_price != null && !unit) setUnit(String(c.unit_price));
      if (c.instructor_id && !instructor) setInstructor(c.instructor_id);
      if (!title) setTitle(c.name);
    }
  }
  function save() {
    if (!date) { alert("거래일을 입력하세요"); return; }
    const input = { partner_id: partnerId, company_id: companyId, contract_id: contractId || null, type, txn_date: date, title, qty, unit_price: unit, instructor_id: instructor || null, status, memo };
    startTransition(async () => {
      const r = isNew ? await createTransaction(input) : await updateTransaction(txn!.id, input);
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }
  function remove() {
    if (!txn || !confirm("이 거래를 삭제할까요?")) return;
    startTransition(async () => { const r = await deleteTransaction(txn.id); if (!r.ok) alert(r.error); else onSaved(); });
  }

  return (
    <ModalShell title={isNew ? "거래 입력" : "거래 수정"} onClose={onClose} footer={
      <div className="flex w-full items-center justify-between">
        {txn ? <button onClick={remove} disabled={pending} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50">삭제</button> : <span />}
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{pending ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    }>
      <Lbl t="계약 연결(선택)">
        <select className={inputCls} value={contractId} onChange={(e) => pickContract(e.target.value)}>
          <option value="">계약 없음(단건)</option>
          {contracts.map((c) => <option key={c.id} value={c.id}>{CONTRACT_TYPE_LABEL[c.type as ContractType]} · {c.name}</option>)}
        </select>
      </Lbl>
      <div className="grid grid-cols-2 gap-3">
        <Lbl t="유형"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{CONTRACT_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</option>)}<option value="ETC">기타</option></select></Lbl>
        <Lbl t="거래일"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Lbl>
      </div>
      <Lbl t="내용"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="반/행사명/품목" /></Lbl>
      <div className="grid grid-cols-3 gap-3">
        <Lbl t="수량/회차"><NumberInput value={qty} onChange={setQty} className="w-full" /></Lbl>
        <Lbl t="단가"><NumberInput value={unit} onChange={setUnit} className="w-full" /></Lbl>
        <Lbl t="금액(자동)"><input className={inputCls + " bg-neutral-50"} value={krw(amount)} readOnly /></Lbl>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Lbl t="강사/담당"><select className={inputCls} value={instructor} onChange={(e) => setInstructor(e.target.value)}><option value="">선택</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Lbl>
        <Lbl t="상태"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TXN_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Lbl>
      </div>
      <Lbl t="메모"><textarea className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} /></Lbl>
    </ModalShell>
  );
}

// ============ 정산 탭 ============
export function SettlementsTab({
  partnerId, settlements, transactions, onChanged,
}: {
  partnerId: string; settlements: SettlementRow[]; transactions: TransactionRow[]; onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // 정산별 거래 건수
  const txnCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.settlement_id) m.set(t.settlement_id, (m.get(t.settlement_id) ?? 0) + 1);
    return m;
  }, [transactions]);
  const unsettled = transactions.filter((t) => !t.settlement_id && t.status !== "CANCELED");

  function genMonth() {
    startTransition(async () => {
      const r = await generateMonthlySettlement(partnerId, month);
      if (!r.ok) { alert(r.error); return; }
      alert(`${month} 정산 생성 — 거래 ${r.count}건 묶음`);
      onChanged();
    });
  }
  function setStatus(id: string, status: string) {
    startTransition(async () => { const r = await updateSettlementStatus(id, status); if (!r.ok) alert(r.error); else onChanged(); });
  }
  function remove(id: string) {
    if (!confirm("이 정산을 해제할까요? (묶인 거래는 미정산으로 복귀)")) return;
    startTransition(async () => { const r = await deleteSettlement(id); if (!r.ok) alert(r.error); else onChanged(); });
  }
  function makeInvoice(id: string) {
    if (!confirm("이 정산으로 매출 세금계산서를 생성·연결할까요?")) return;
    startTransition(async () => { const r = await createTaxInvoiceFromSettlement(id); if (!r.ok) alert(r.error); else { alert("세금계산서 생성·연결됨"); onChanged(); } });
  }

  return (
    <div className="space-y-3">
      {/* 월별 정산 생성 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <span className="text-sm font-medium text-neutral-700">월별 정산 생성</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        <button onClick={genMonth} disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "처리 중…" : "이 달 미정산 거래 합산"}
        </button>
        <span className="ml-auto text-xs text-neutral-400">미정산 거래 {unsettled.length}건 / {krw(unsettled.reduce((s, t) => s + t.amount, 0))}</span>
      </div>

      {settlements.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">정산 내역이 없습니다. 위에서 월별 정산을 생성하세요.</p>
      ) : (
        <div className="space-y-2">
          {settlements.map((s) => (
            <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${crmChip(SETTLEMENT_STATUS_TONE[s.status] ?? "neutral")}`}>{SETTLEMENT_STATUS_LABEL[s.status] ?? s.status}</span>
                <span className="font-semibold text-neutral-800">{s.title}</span>
                <span className="text-xs text-neutral-400">거래 {txnCount.get(s.id) ?? 0}건</span>
                <span className="ml-auto text-right">
                  <span className="text-base font-bold tabular-nums text-neutral-900">{krw(s.total)}</span>
                  <span className="ml-1 text-[11px] text-neutral-400">(공급 {krw(s.subtotal)} + 세 {krw(s.tax_amount)})</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <a href={`/print/settlement/${s.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">🖨 거래명세서</a>
                {s.tax_invoice_id ? (
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">📑 세금계산서 ✓</span>
                ) : (
                  <button onClick={() => makeInvoice(s.id)} disabled={pending} className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">📑 세금계산서 생성</button>
                )}
                <select value={s.status} disabled={pending} onChange={(e) => setStatus(s.id, e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
                  {Object.entries(SETTLEMENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={() => remove(s.id)} disabled={pending} className="rounded-lg px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-50">해제</button>
                {s.period && <span className="ml-auto text-[11px] text-neutral-400">{s.period}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ 문서함 탭 ============
export function AttachmentsTab({
  partnerId, companyId, attachments, onChanged,
}: {
  partnerId: string; companyId: string | null; attachments: PartnerAttachmentRow[]; onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("사업자등록증");

  function upload(file: File) {
    startTransition(async () => {
      const { base64, mime, name } = await readBase64(file);
      const r = await uploadPartnerFile({ partner_id: partnerId, company_id: companyId, title: name.replace(/\.[^.]+$/, ""), category, file_name: name, base64, mime });
      if (!r.ok) { alert(r.error ?? "업로드 실패"); return; }
      onChanged();
    });
  }
  function download(id: string) {
    startTransition(async () => {
      const r = await getPartnerFileUrl(id);
      if (!r.ok || !r.url) { alert(r.error ?? "다운로드 실패"); return; }
      const a = document.createElement("a"); a.href = r.url; document.body.appendChild(a); a.click(); a.remove();
    });
  }
  function remove(id: string) {
    if (!confirm("이 문서를 삭제할까요?")) return;
    startTransition(async () => { const r = await deletePartnerFile(id); if (!r.ok) alert(r.error); else onChanged(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <span className="text-sm font-medium text-neutral-700">문서 첨부</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          {ATTACH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <FileButton label="파일 선택" onFile={upload} />
        {pending && <span className="text-xs text-neutral-400">처리 중…</span>}
      </div>

      {attachments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-400">첨부된 문서가 없습니다. 사업자등록증·통장사본·계약서 등을 올려두세요.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
              <span className="text-2xl">{fileIcon(f.file_name, f.mime)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {f.category && <span className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">{f.category}</span>}
                  <span className="truncate font-medium text-neutral-800">{f.title}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
                  <span className="truncate">{f.file_name}</span><span>{fmtSize(f.size_bytes)}</span>
                  {f.uploader_name && <span>{f.uploader_name}</span>}<span>{f.created_at.slice(0, 10)}</span>
                </div>
              </div>
              <button onClick={() => download(f.id)} disabled={pending} className="shrink-0 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50">⬇ 받기</button>
              <button onClick={() => remove(f.id)} disabled={pending} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-rose-400 hover:bg-rose-50">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ 공용 ============
function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">{t}</span>{children}</label>;
}
function ModalShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="max-h-[68vh] space-y-3 overflow-y-auto p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}
