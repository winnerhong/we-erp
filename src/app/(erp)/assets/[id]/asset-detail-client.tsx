"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NumberInput } from "@/components/ui";
import { krw } from "@/lib/labels";
import { ASSET_STATUS_LABEL, ASSET_STATUS_TONE, MOVE_TYPES, MOVE_TYPE_LABEL, MOVE_TYPE_TONE, assetChip, qrImageUrl } from "@/lib/assets";
import type { MoveType } from "@/lib/assets";
import { logMovement, deleteAsset, deleteMovement } from "../actions";

interface AssetView {
  id: string; code: string | null; name: string; category: string | null;
  totalQty: number; availableQty: number; status: string; location: string | null;
  purchasePrice: number | null; purchaseDate: string | null; memo: string | null;
}
export interface MoveItem {
  id: string; type: string; qty: number; txnDate: string; dueDate: string | null; status: string;
  partnerName: string | null; employeeName: string | null; memo: string | null;
}
type NameItem = { id: string; name: string };
const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function AssetDetailClient({
  asset, movements, partners, employees,
}: {
  asset: AssetView; movements: MoveItem[]; partners: NameItem[]; employees: NameItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // 이동 입력
  const [type, setType] = useState<MoveType>("RENT");
  const [qty, setQty] = useState("1");
  const [partnerId, setPartnerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState("");
  const [memo, setMemo] = useState("");

  function submit() {
    startTransition(async () => {
      const r = await logMovement({ asset_id: asset.id, type, qty, partner_id: partnerId || null, employee_id: employeeId || null, txn_date: date, due_date: due || null, memo });
      if (!r.ok) { alert(r.error ?? "기록 실패"); return; }
      setQty("1"); setMemo(""); setDue("");
      router.refresh();
    });
  }
  function removeMove(id: string) {
    if (!confirm("이 기록을 삭제할까요? (수량 원복)")) return;
    startTransition(async () => { const r = await deleteMovement(id); if (!r.ok) alert(r.error); else router.refresh(); });
  }
  function removeAsset() {
    if (!confirm(`'${asset.name}' 교구를 삭제할까요? (이동 이력 포함 삭제)`)) return;
    startTransition(async () => { const r = await deleteAsset(asset.id); if (!r.ok) alert(r.error); else router.push("/assets"); });
  }

  return (
    <div className="space-y-4">
      <Link href="/assets" className="text-sm text-neutral-500 hover:text-neutral-800">‹ 교구 목록</Link>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImageUrl(`${origin}/assets/${asset.id}`, 120)} alt="QR" className="h-28 w-28 shrink-0 rounded-lg border border-neutral-100" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-900">{asset.name}</h1>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${assetChip(ASSET_STATUS_TONE[asset.status] ?? "neutral")}`}>{ASSET_STATUS_LABEL[asset.status] ?? asset.status}</span>
            </div>
            <p className="mt-0.5 font-mono text-xs text-neutral-400">{asset.code || asset.id.slice(0, 8)}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600">
              <span>가용 <b className={asset.availableQty === 0 ? "text-rose-500" : "text-emerald-600"}>{asset.availableQty}</b> / {asset.totalQty}개</span>
              {asset.category && <span>분류 {asset.category}</span>}
              {asset.location && <span>위치 {asset.location}</span>}
              {asset.purchasePrice != null && <span>구입가 {krw(asset.purchasePrice)}</span>}
            </div>
          </div>
        </div>
        <button onClick={removeAsset} className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-500 hover:bg-rose-50">🗑 삭제</button>
      </div>

      {/* 이동 기록 입력 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-semibold text-neutral-800">입출고 · 대여/반납 기록</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MOVE_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${type === t ? assetChip(MOVE_TYPE_TONE[t]) + " ring-1 ring-neutral-400" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>{MOVE_TYPE_LABEL[t]}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">수량</span><NumberInput value={qty} onChange={setQty} className="w-full" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">일자</span><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {(type === "RENT" || type === "RETURN") && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">대여처(기관)</span>
              <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">선택</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
          )}
          {type === "RENT" && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">반납 예정일</span><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></label>
          )}
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">처리자</span>
            <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">선택</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          </label>
          <label className="col-span-2 block sm:col-span-3"><span className="mb-1 block text-xs font-medium text-neutral-500">메모</span><input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={submit} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{pending ? "기록 중…" : `${MOVE_TYPE_LABEL[type]} 기록`}</button>
        </div>
      </div>

      {/* 이력 */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3"><h3 className="font-semibold text-neutral-800">이동 이력 <span className="text-xs font-normal text-neutral-400">{movements.length}건</span></h3></div>
        {movements.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-neutral-400">이력이 없습니다.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500">
              <tr><th className="px-3 py-2">일자</th><th className="px-3 py-2">유형</th><th className="px-3 py-2 text-right">수량</th><th className="px-3 py-2">대여처/처리자</th><th className="px-3 py-2">메모</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {movements.map((m) => {
                const t = m.type as MoveType;
                return (
                  <tr key={m.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 tabular-nums text-neutral-600">{m.txnDate.slice(2)}{m.dueDate && <span className="ml-1 text-[11px] text-amber-600">~{m.dueDate.slice(5)}</span>}</td>
                    <td className="px-3 py-2"><span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${assetChip(MOVE_TYPE_TONE[t] ?? "neutral")}`}>{MOVE_TYPE_LABEL[t] ?? m.type}</span>{m.status === "OPEN" && <span className="ml-1 text-[10px] text-blue-500">대여중</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.qty}</td>
                    <td className="px-3 py-2 text-neutral-600">{[m.partnerName, m.employeeName].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="px-3 py-2 text-neutral-500">{m.memo || "-"}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => removeMove(m.id)} className="text-xs text-neutral-300 hover:text-rose-500">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
