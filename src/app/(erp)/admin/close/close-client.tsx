"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockPeriod, unlockPeriod } from "./actions";

export interface LockInfo {
  by: string | null;
  at: string;
}

export function CloseClient({
  companies,
  months,
  locks,
}: {
  companies: { id: string; name: string }[];
  months: string[];
  locks: Record<string, LockInfo>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function toggle(companyId: string, period: string, locked: boolean) {
    const key = `${companyId}:${period}`;
    if (locked) {
      if (!confirm(`${period} 마감을 해제할까요? (해당 기간 거래 수정 가능)`)) return;
    } else {
      if (!confirm(`${period} 을(를) 마감할까요?\n마감 후 이 기간의 통장 거래는 생성·수정·삭제가 차단됩니다.`)) return;
    }
    setBusyKey(key);
    startTransition(async () => {
      const r = locked ? await unlockPeriod(companyId, period) : await lockPeriod(companyId, period);
      setBusyKey(null);
      if (!r.ok) { alert(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900">🔒 결산 마감</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          사업자·월 단위로 회계기간을 마감합니다. 마감된 기간의 <b>통장 거래</b>는 생성·수정·삭제가 차단됩니다. (조정은 익월로)
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">
          사업자를 먼저 등록하세요.
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map((c) => (
            <div key={c.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-neutral-800">
                <span>🏢</span>{c.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {months.map((m) => {
                  const key = `${c.id}:${m}`;
                  const info = locks[key];
                  const locked = !!info;
                  const busy = busyKey === key && pending;
                  return (
                    <button
                      key={m}
                      onClick={() => toggle(c.id, m, locked)}
                      disabled={busy}
                      title={locked ? `마감됨 · ${info?.by ?? ""} ${info?.at?.slice(0, 10) ?? ""}` : "열림 — 클릭해 마감"}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium tabular-nums transition disabled:opacity-50 ${
                        locked
                          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
                      }`}
                    >
                      <span>{locked ? "🔒" : "🔓"}</span>
                      {m}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-neutral-400">🔒 마감(잠금) · 🔓 열림 — 버튼을 눌러 전환</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
