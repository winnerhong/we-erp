// 페이지 전환 시 즉시 표시되는 로딩 스켈레톤 — 서버 데이터 fetch 동안 "멈춘 느낌" 제거
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* 제목 */}
      <div className="mb-5">
        <div className="h-6 w-40 rounded bg-neutral-200" />
        <div className="mt-2 h-3 w-64 rounded bg-neutral-100" />
      </div>

      {/* 요약 카드 4개 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="h-3 w-16 rounded bg-neutral-100" />
            <div className="mt-2 h-6 w-24 rounded bg-neutral-200" />
          </div>
        ))}
      </div>

      {/* 표 스켈레톤 */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 p-4">
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
        <div className="divide-y divide-neutral-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-1/5 rounded bg-neutral-100" />
              <div className="h-4 w-1/5 rounded bg-neutral-100" />
              <div className="h-4 w-1/5 rounded bg-neutral-100" />
              <div className="ml-auto h-4 w-16 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-neutral-300">불러오는 중…</p>
    </div>
  );
}
