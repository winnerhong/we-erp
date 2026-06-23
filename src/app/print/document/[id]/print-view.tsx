"use client";

import { useEffect } from "react";
import { ensureHtml } from "@/lib/document-vars";

export function PrintView({ title, body }: { title: string; body: string }) {
  useEffect(() => {
    // 저장되는 PDF 파일명에 반영
    if (title) document.title = title;
    // 렌더 직후 인쇄 대화상자(브라우저에서 'PDF로 저장' 선택 가능)
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [title]);

  return (
    <div className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          🖨 인쇄 / PDF 저장
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50"
        >
          닫기
        </button>
      </div>

      {/* A4 용지 */}
      <div className="mx-auto w-[210mm] min-h-[297mm] bg-white p-[20mm] shadow-lg print:shadow-none print:w-auto print:min-h-0 print:p-0">
        <div className="doc-content" dangerouslySetInnerHTML={{ __html: ensureHtml(body) }} />
      </div>
    </div>
  );
}
