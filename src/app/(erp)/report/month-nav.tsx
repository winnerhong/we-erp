"use client";

import { useRouter } from "next/navigation";

export function MonthNav({ month }: { month: string }) {
  const router = useRouter();
  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    router.push(`/report?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => shift(-1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">◀</button>
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && router.push(`/report?m=${e.target.value}`)}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
      />
      <button onClick={() => shift(1)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">▶</button>
    </div>
  );
}
