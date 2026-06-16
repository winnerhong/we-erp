"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { parseCSV, buildCSV } from "@/lib/csv";
import {
  IMPORT_SPECS,
  type ImportKind,
  type ImportCtx,
} from "@/lib/import-specs";
import { bulkImport, type BulkResult } from "@/app/(erp)/actions";

interface PreviewRow {
  rowNo: number;
  raw: Record<string, string>;
  ok: boolean;
  error?: string;
}

export function BulkImport({ kind, ctx }: { kind: ImportKind; ctx: ImportCtx }) {
  const spec = IMPORT_SPECS[kind];
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();

  const validCount = rows.filter((r) => r.ok).length;
  const errorCount = rows.length - validCount;

  function downloadTemplate() {
    const csv = buildCSV(spec.headers, [spec.sample]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.label}_일괄등록_양식.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const text = await file.text();
    const parsed = parseCSV(text);
    const preview: PreviewRow[] = parsed.map((raw, i) => {
      const res = spec.validate(raw, ctx);
      return res.ok
        ? { rowNo: i + 2, raw, ok: true }
        : { rowNo: i + 2, raw, ok: false, error: res.error };
    });
    setRows(preview);
  }

  function confirm() {
    const raws = rows.filter((r) => r.ok).map((r) => r.raw);
    if (raws.length === 0) return;
    startTransition(async () => {
      const res = await bulkImport(kind, raws);
      setResult(res);
      setRows([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function reset() {
    setRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        📥 CSV 일괄등록
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <div className="mt-10 w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <h2 className="font-semibold">{spec.label} 일괄등록</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              <ol className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-500">
                <li>① 양식 다운로드</li>
                <li>→ ② 엑셀에서 작성</li>
                <li>→ ③ 업로드(검증·미리보기)</li>
                <li>→ ④ 확정 등록</li>
              </ol>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={downloadTemplate}
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  ① 양식 다운로드
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  className="block text-sm file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-50"
                />
              </div>

              <p className="text-xs text-neutral-400">
                열 순서: {spec.headers.join(" · ")}
              </p>

              {rows.length > 0 && (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-green-700">
                      등록 가능 {validCount}건
                    </span>
                    {errorCount > 0 && (
                      <span className="font-medium text-red-600">
                        오류 {errorCount}건 (제외)
                      </span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-auto rounded-lg border border-neutral-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                        <tr>
                          <th className="px-3 py-2">행</th>
                          <th className="px-3 py-2">상태</th>
                          <th className="px-3 py-2">{spec.headers[0]}</th>
                          <th className="px-3 py-2">내용</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {rows.map((r) => (
                          <tr key={r.rowNo} className={r.ok ? "" : "bg-red-50"}>
                            <td className="px-3 py-2 text-neutral-400">{r.rowNo}</td>
                            <td className="px-3 py-2">
                              {r.ok ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className="text-red-600">✕</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {r.raw[spec.headers[0]]}
                            </td>
                            <td className="px-3 py-2 text-xs text-neutral-500">
                              {r.ok
                                ? spec.headers
                                    .slice(1)
                                    .map((h) => r.raw[h])
                                    .filter(Boolean)
                                    .join(" · ")
                                : r.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={confirm}
                      disabled={pending || validCount === 0}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {pending ? "등록 중…" : `④ ${validCount}건 확정 등록`}
                    </button>
                    <button
                      onClick={reset}
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                    >
                      초기화
                    </button>
                  </div>
                </>
              )}

              {result && (
                <div className="rounded-lg bg-neutral-50 p-4 text-sm">
                  <p className="font-medium text-green-700">
                    ✓ {result.inserted}건 등록 완료
                  </p>
                  {result.failed.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-red-600">
                      {result.failed.slice(0, 20).map((f, i) => (
                        <li key={i}>
                          {f.row}행: {f.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
