"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, NumberInput } from "@/components/ui";
import { ASSET_STATUS_LABEL, ASSET_STATUS_TONE, assetChip, qrImageUrl } from "@/lib/assets";
import { createAsset } from "./actions";

export interface AssetItem {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  totalQty: number;
  availableQty: number;
  status: string;
  location: string | null;
  openRentals: number;
}
type Cat = { value: string; label: string; color: string | null };
const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function AssetsClient({ items, companyId, categories }: { items: AssetItem[]; companyId: string | null; categories: Cat[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const catColor = useMemo(() => new Map(categories.map((c) => [c.value, c.color ?? "neutral"])), [categories]);

  const shown = items.filter((a) => {
    if (catF !== "ALL" && a.category !== catF) return false;
    if (statusF !== "ALL" && a.status !== statusF) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${a.name} ${a.code ?? ""} ${a.location ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const kpi = useMemo(() => ({
    total: items.reduce((s, a) => s + a.totalQty, 0),
    available: items.reduce((s, a) => s + a.availableQty, 0),
    rented: items.filter((a) => a.status === "RENTED").length,
    repair: items.filter((a) => a.status === "REPAIR").length,
  }), [items]);

  return (
    <div>
      <PageHeader
        title="🏐 교구·자산 관리"
        description="교구 입출고·대여·반납을 QR로 추적"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setQrOpen(true)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">🏷 QR 라벨</button>
            <button onClick={() => setAddOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">+ 교구 등록</button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiBox label="총 보유" value={`${kpi.total.toLocaleString()}개`} />
        <KpiBox label="가용" value={`${kpi.available.toLocaleString()}개`} tone="emerald" />
        <KpiBox label="대여중 품목" value={`${kpi.rented}`} tone="blue" />
        <KpiBox label="수리중 품목" value={`${kpi.repair}`} tone="amber" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 교구명·코드·위치" className="w-52 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none" />
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <option value="ALL">전체 분류</option>
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <option value="ALL">전체 상태</option>
          {Object.entries(ASSET_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">등록된 교구가 없습니다. ‘+ 교구 등록’으로 추가하세요.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">코드</th><th className="px-3 py-2">교구명</th><th className="px-3 py-2">분류</th>
                <th className="px-3 py-2 text-right">가용/보유</th><th className="px-3 py-2">상태</th><th className="px-3 py-2">위치</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {shown.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => router.push(`/assets/${a.id}`)}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{a.code || "-"}</td>
                  <td className="px-3 py-2 font-medium text-neutral-800">{a.name}{a.openRentals > 0 && <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">대여 {a.openRentals}</span>}</td>
                  <td className="px-3 py-2">{a.category && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${assetChip(catColor.get(a.category) ?? "neutral")}`}>{a.category}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><span className={a.availableQty === 0 ? "text-rose-500 font-semibold" : ""}>{a.availableQty}</span> / {a.totalQty}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${assetChip(ASSET_STATUS_TONE[a.status] ?? "neutral")}`}>{ASSET_STATUS_LABEL[a.status] ?? a.status}</span></td>
                  <td className="px-3 py-2 text-neutral-500">{a.location || "-"}</td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-400">상세 ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <AssetAddModal companyId={companyId} categories={categories} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); router.refresh(); }} />}
      {qrOpen && <QrLabelsModal items={shown} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

function KpiBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "blue" ? "border-blue-200 bg-blue-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white"}`}>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

function AssetAddModal({ companyId, categories, onClose, onSaved }: { companyId: string | null; categories: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [qty, setQty] = useState("1");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");

  function save() {
    if (!name.trim()) { alert("교구명을 입력하세요"); return; }
    startTransition(async () => {
      const r = await createAsset({ company_id: companyId, name, code, category: category || null, total_qty: qty, location, purchase_price: price });
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-auto w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">교구 등록</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">교구명</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 폼 매트 (대)" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">자산코드</span><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="MAT-001" /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">분류</span><select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">없음</option>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">수량</span><NumberInput value={qty} onChange={setQty} className="w-full" /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">구입가</span><NumberInput value={price} onChange={setPrice} className="w-full" /></label>
            <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-neutral-500">보관 위치</span><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="본사 창고 A" /></label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{pending ? "저장 중…" : "등록"}</button>
        </div>
      </div>
    </div>
  );
}

function QrLabelsModal({ items, onClose }: { items: AssetItem[]; onClose: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:bg-white print:p-0" onClick={onClose}>
      <div className="my-auto w-full max-w-3xl rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3 print:hidden">
          <h3 className="font-semibold text-neutral-800">QR 라벨 ({items.length})</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">🖨 인쇄</button>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          {items.map((a) => (
            <div key={a.id} className="flex flex-col items-center rounded-lg border border-neutral-200 p-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImageUrl(`${origin}/assets/${a.id}`, 140)} alt={a.name} className="h-32 w-32" />
              <p className="mt-2 text-sm font-semibold text-neutral-800">{a.name}</p>
              <p className="font-mono text-[11px] text-neutral-400">{a.code || a.id.slice(0, 8)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
