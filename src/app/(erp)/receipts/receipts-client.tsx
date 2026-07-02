"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, NumberInput, SelectInput, EmptyState, Badge } from "@/components/ui";
import {
  RECEIPT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  EVIDENCE_TYPE_LABEL,
  defaultVatDeductible,
  krw,
} from "@/lib/labels";
import type {
  ReceiptRow,
  PaymentMethod,
  EvidenceType,
} from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import { uploadReceipt, updateReceipt, confirmReceipt, deleteReceipt } from "./actions";

interface Props {
  receipts: ReceiptRow[];
  signedUrls: Record<string, string>;
  ctx: ImportCtx;
  partners: { id: string; name: string }[];
  activeCompanyId: string | null;
  ocrConfigured: boolean;
}

const payOptions = Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][];
const evOptions = Object.entries(EVIDENCE_TYPE_LABEL) as [EvidenceType, string][];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ReceiptsClient({
  receipts,
  signedUrls,
  ctx,
  partners,
  activeCompanyId,
  ocrConfigured,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !activeCompanyId) return;
    setErrors([]);
    const errs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`업로드·판독 중… (${i + 1}/${files.length})`);
      try {
        const b64 = await fileToBase64(files[i]);
        const res = await uploadReceipt(activeCompanyId, files[i].name, b64);
        if (!res.ok) errs.push(`${files[i].name}: ${res.error}`);
      } catch {
        errs.push(`${files[i].name}: 파일 읽기 실패`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  const pending = receipts.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">영수증 OCR</h1>
          <p className="mt-1 text-sm text-neutral-500">
            사진·이미지를 올리면 자동 판독 → 검수 → 확정. 검수대기 {pending}건.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onFiles}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!activeCompanyId || !!busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ?? "📷 영수증 업로드"}
          </button>
        </div>
      </div>

      {!activeCompanyId && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          영수증은 특정 사업자에 귀속됩니다. 상단에서 사업자를 선택한 뒤 업로드하세요.
        </Card>
      )}
      {!ocrConfigured && (
        <Card className="mb-4 border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          자동 판독(OCR)이 꺼져 있습니다. <code>.env.local</code> 에 <code>ANTHROPIC_API_KEY</code> 를
          추가하면 업로드 시 자동 추출됩니다. (지금은 업로드 후 수기 입력)
        </Card>
      )}
      {errors.length > 0 && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <ul className="space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Card>
      )}

      <Card>
        {receipts.length === 0 ? (
          <EmptyState message="등록된 영수증이 없습니다. ‘영수증 업로드’로 시작하세요." />
        ) : (
          <div className="grid grid-cols-1 gap-px bg-neutral-100 sm:grid-cols-2 lg:grid-cols-3">
            {receipts.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="flex gap-3 bg-white p-3 text-left hover:bg-neutral-50"
              >
                {signedUrls[r.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signedUrls[r.id]}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-2xl">
                    🧾
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {r.vendor_name ?? "(상호 미확인)"}
                    </span>
                    <Badge tone={r.status === "CONFIRMED" ? "green" : "neutral"}>
                      {RECEIPT_STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neutral-800">
                    {krw(r.total_amount)}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {r.doc_date ?? "날짜?"} ·{" "}
                    {r.evidence_type ? EVIDENCE_TYPE_LABEL[r.evidence_type] : "증빙?"}
                    {r.vat_deductible === true && " · 공제"}
                  </div>
                  {r.ocr_error && (
                    <div className="mt-0.5 truncate text-xs text-amber-600" title={r.ocr_error}>
                      ⚠ {r.ocr_error}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <ReviewModal
          key={selected.id}
          receipt={selected}
          imageUrl={signedUrls[selected.id]}
          ctx={ctx}
          partners={partners}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------- 검수 모달 ----------
function ReviewModal({
  receipt,
  imageUrl,
  ctx,
  partners,
  onClose,
  onChanged,
}: {
  receipt: ReceiptRow;
  imageUrl?: string;
  ctx: ImportCtx;
  partners: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState({
    vendor_name: receipt.vendor_name ?? "",
    biz_no: receipt.biz_no ?? "",
    doc_date: receipt.doc_date ?? "",
    supply_amount: receipt.supply_amount?.toString() ?? "",
    vat_amount: receipt.vat_amount?.toString() ?? "",
    total_amount: receipt.total_amount?.toString() ?? "",
    payment_method: receipt.payment_method ?? "",
    evidence_type: receipt.evidence_type ?? "",
    vat_deductible: receipt.vat_deductible ?? false,
    account_id: receipt.account_id ?? "",
    partner_id: receipt.partner_id ?? "",
    memo: receipt.memo ?? "",
  });

  const num = (s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  function buildPatch() {
    return {
      vendor_name: d.vendor_name.trim() || null,
      biz_no: d.biz_no.trim() || null,
      doc_date: d.doc_date || null,
      supply_amount: num(d.supply_amount),
      vat_amount: num(d.vat_amount),
      total_amount: num(d.total_amount),
      payment_method: (d.payment_method || null) as PaymentMethod | null,
      evidence_type: (d.evidence_type || null) as EvidenceType | null,
      vat_deductible: d.vat_deductible,
      account_id: d.account_id || null,
      partner_id: d.partner_id || null,
      memo: d.memo.trim() || null,
    };
  }

  function save(confirm: boolean) {
    startTransition(async () => {
      const res = confirm
        ? await updateReceipt(receipt.id, buildPatch()).then((r) =>
            r.ok ? confirmReceipt(receipt.id) : r
          )
        : await updateReceipt(receipt.id, buildPatch());
      if (res.ok) onChanged();
      else alert(res.error);
    });
  }

  function remove() {
    if (!confirm("이 영수증을 삭제할까요? 이미지도 함께 삭제됩니다.")) return;
    startTransition(async () => {
      const res = await deleteReceipt(receipt.id, receipt.image_path);
      if (res.ok) onChanged();
      else alert(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-6 grid w-full max-w-4xl gap-0 rounded-xl border border-neutral-200 bg-white shadow-xl md:grid-cols-2">
        {/* 이미지 */}
        <div className="border-b border-neutral-200 bg-neutral-50 p-4 md:border-b-0 md:border-r">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="영수증" className="mx-auto max-h-[70vh] rounded-md object-contain" />
          ) : (
            <div className="py-20 text-center text-neutral-400">이미지 미리보기 없음</div>
          )}
        </div>

        {/* 검수 폼 */}
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">영수증 검수</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="상호"><TextInput value={d.vendor_name} onChange={(e) => setD({ ...d, vendor_name: e.target.value })} /></Field>
            </div>
            <Field label="사업자번호"><TextInput value={d.biz_no} onChange={(e) => setD({ ...d, biz_no: e.target.value })} /></Field>
            <Field label="거래일자"><TextInput type="date" value={d.doc_date} onChange={(e) => setD({ ...d, doc_date: e.target.value })} /></Field>
            <Field label="공급가액"><NumberInput value={d.supply_amount} onChange={(v) => setD({ ...d, supply_amount: v })} /></Field>
            <Field label="부가세"><NumberInput value={d.vat_amount} onChange={(v) => setD({ ...d, vat_amount: v })} /></Field>
            <Field label="합계"><NumberInput value={d.total_amount} onChange={(v) => setD({ ...d, total_amount: v })} /></Field>
            <Field label="결제수단">
              <SelectInput value={d.payment_method} onChange={(e) => setD({ ...d, payment_method: e.target.value as PaymentMethod })}>
                <option value="">선택…</option>
                {payOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectInput>
            </Field>
            <Field label="증빙종류">
              <SelectInput
                value={d.evidence_type}
                onChange={(e) => {
                  const ev = e.target.value as EvidenceType;
                  setD({ ...d, evidence_type: ev, vat_deductible: defaultVatDeductible(ev || null) });
                }}
              >
                <option value="">선택…</option>
                {evOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectInput>
            </Field>
            <Field label="계정과목">
              <SelectInput value={d.account_id} onChange={(e) => setD({ ...d, account_id: e.target.value })}>
                <option value="">미지정</option>
                {ctx.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="거래처">
              <SelectInput value={d.partner_id} onChange={(e) => setD({ ...d, partner_id: e.target.value })}>
                <option value="">미지정</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectInput>
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.vat_deductible} onChange={(e) => setD({ ...d, vat_deductible: e.target.checked })} />
              부가세 공제 가능
            </label>
            <div className="col-span-2">
              <Field label="메모"><TextInput value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></Field>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button onClick={remove} disabled={pending} className="text-sm text-red-500 hover:text-red-700">삭제</button>
            <div className="flex gap-2">
              <button onClick={() => save(false)} disabled={pending} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">저장</button>
              <button onClick={() => save(true)} disabled={pending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {receipt.status === "CONFIRMED" ? "저장" : "저장 + 확정"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
