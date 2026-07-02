"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HR_FIELDS, HR_SECTIONS, type HrExtra, type HrScalarField, type HrSectionKey, type HrRow } from "@/lib/hr-card";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function HrCardEditor({
  initialScalars,
  initialExtra,
  onSave,
}: {
  initialScalars: Partial<Record<HrScalarField, string>>;
  initialExtra: HrExtra;
  onSave: (scalars: Record<string, string | null>, extra: HrExtra) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [s, setS] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of HR_FIELDS) o[f.key] = initialScalars[f.key] ?? "";
    return o;
  });
  const [ex, setEx] = useState<HrExtra>(initialExtra);
  const [saved, setSaved] = useState(false);

  function addRow(key: HrSectionKey) {
    setEx((p) => ({ ...p, [key]: [...p[key], {}] }));
  }
  function removeRow(key: HrSectionKey, i: number) {
    setEx((p) => ({ ...p, [key]: p[key].filter((_, idx) => idx !== i) }));
  }
  function setCell(key: HrSectionKey, i: number, col: string, val: string) {
    setEx((p) => ({ ...p, [key]: p[key].map((r, idx) => (idx === i ? { ...r, [col]: val } : r)) }));
  }

  function save() {
    const scalars: Record<string, string | null> = {};
    for (const f of HR_FIELDS) scalars[f.key] = s[f.key].trim() || null;
    // 빈 행 제거
    const clean: HrExtra = {
      family: ex.family.filter(rowFilled),
      education: ex.education.filter(rowFilled),
      career: ex.career.filter(rowFilled),
      certificates: ex.certificates.filter(rowFilled),
    };
    startTransition(async () => {
      const r = await onSave(scalars, clean);
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* 신상정보 */}
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">🧾 신상정보</h3>
          <p className="mt-0.5 text-xs text-neutral-400">입력 후 저장하면 회사 인사기록에 바로 반영됩니다.</p>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-5 sm:grid-cols-2">
          {HR_FIELDS.map((f) => (
            <label key={f.key} className={`flex flex-col gap-1 text-sm ${f.full ? "sm:col-span-2" : ""}`}>
              <span className="font-medium text-neutral-600">{f.label}</span>
              {f.type === "select" ? (
                <select className={inputCls} value={s[f.key]} onChange={(e) => setS({ ...s, [f.key]: e.target.value })}>
                  <option value="">선택</option>
                  {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className={inputCls}
                  type={f.type === "date" ? "date" : "text"}
                  value={s[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setS({ ...s, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      </section>

      {/* 반복항목 */}
      {HR_SECTIONS.map((sec) => (
        <section key={sec.key} className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">{sec.icon} {sec.title} <span className="ml-1 text-xs font-normal text-neutral-400">{ex[sec.key].length}건</span></h3>
            <button onClick={() => addRow(sec.key)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">+ 추가</button>
          </div>
          {ex[sec.key].length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-neutral-400">등록된 항목이 없습니다.</p>
          ) : (
            <div className="space-y-2 p-3">
              {ex[sec.key].map((row: HrRow, i: number) => (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-neutral-50 p-2">
                  <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {sec.cols.map((c) => (
                      <input
                        key={c.k}
                        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm"
                        placeholder={c.label}
                        value={row[c.k] ?? ""}
                        onChange={(e) => setCell(sec.key, i, c.k, e.target.value)}
                      />
                    ))}
                  </div>
                  <button onClick={() => removeRow(sec.key, i)} className="mt-1 shrink-0 text-rose-400 hover:text-rose-600" title="삭제">✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* 저장 */}
      <div className="sticky bottom-3 flex items-center justify-end gap-3">
        {saved && <span className="text-sm font-medium text-emerald-600">✓ 회사 기록에 반영됨</span>}
        <button
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장 (자동 반영)"}
        </button>
      </div>
    </div>
  );
}

function rowFilled(r: HrRow) {
  return Object.values(r).some((v) => (v ?? "").toString().trim() !== "");
}
