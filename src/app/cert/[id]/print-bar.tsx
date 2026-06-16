"use client";

export function PrintBar() {
  return (
    <div className="print:hidden mb-6 flex justify-center gap-2">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        🖨 인쇄 / PDF 저장
      </button>
      <button
        onClick={() => window.close()}
        className="rounded-lg border border-neutral-300 px-5 py-2 text-sm hover:bg-neutral-50"
      >
        닫기
      </button>
    </div>
  );
}
