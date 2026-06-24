"use client";

import { useState } from "react";

export interface OrgEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  companyId: string | null;
  deptValue: string | null;
  deptLabel: string | null;
  rankLabel: string | null;
  rankSort: number;
  titleLabel: string | null;
  isManager: boolean;
  phone: string | null;
  email: string | null;
  hiredOn: string | null;
}
export interface OrgCompany {
  id: string;
  name: string;
}

const NO_DEPT = "__none__";
const NO_COMPANY = "__nocompany__";

/** 사업자 → 부서 → 직급순 직원 카드 조직도(읽기전용). */
export function OrgChart({
  companies,
  employees,
  search = "",
}: {
  companies: OrgCompany[];
  employees: OrgEmployee[];
  search?: string;
}) {
  const [picked, setPicked] = useState<OrgEmployee | null>(null);
  const q = search.trim().toLowerCase();
  const match = (e: OrgEmployee) =>
    q !== "" &&
    (e.name.toLowerCase().includes(q) ||
      (e.deptLabel ?? "").toLowerCase().includes(q) ||
      (e.titleLabel ?? "").toLowerCase().includes(q) ||
      (e.rankLabel ?? "").toLowerCase().includes(q));

  // 사업자 목록 + 미배정 버킷
  const cols: { id: string; name: string }[] = [...companies];
  if (employees.some((e) => !e.companyId)) cols.push({ id: NO_COMPANY, name: "미배정 / 공용" });

  return (
    <div className="space-y-6">
      {cols.map((co) => {
        const list = employees.filter((e) => (co.id === NO_COMPANY ? !e.companyId : e.companyId === co.id));
        if (list.length === 0) return null;

        // 부서별 그룹
        const deptMap = new Map<string, OrgEmployee[]>();
        for (const e of list) {
          const k = e.deptValue ?? NO_DEPT;
          const arr = deptMap.get(k) ?? [];
          arr.push(e);
          deptMap.set(k, arr);
        }
        const depts = [...deptMap.entries()].sort((a, b) => {
          if (a[0] === NO_DEPT) return 1;
          if (b[0] === NO_DEPT) return -1;
          return (a[1][0].deptLabel ?? "").localeCompare(b[1][0].deptLabel ?? "");
        });

        return (
          <section key={co.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-5 py-3">
              <span className="text-lg">🏢</span>
              <h3 className="font-bold text-neutral-800">{co.name}</h3>
              <span className="text-xs text-neutral-400">{list.length}명</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {depts.map(([dk, members]) => {
                // 매니저 먼저 → 직급순 → 이름순
                const sorted = members.slice().sort((a, b) => {
                  if (a.isManager !== b.isManager) return a.isManager ? -1 : 1;
                  if (a.rankSort !== b.rankSort) return a.rankSort - b.rankSort;
                  return a.name.localeCompare(b.name);
                });
                return (
                  <div key={dk} className="rounded-xl border border-neutral-200 bg-neutral-50/40">
                    <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
                      <span className="text-sm font-semibold text-neutral-700">{dk === NO_DEPT ? "부서 미지정" : members[0].deptLabel}</span>
                      <span className="text-[11px] text-neutral-400">{members.length}명</span>
                    </div>
                    <div className="space-y-1.5 p-2">
                      {sorted.map((e) => {
                        const dim = q !== "" && !match(e);
                        const hit = q !== "" && match(e);
                        return (
                          <button
                            key={e.id}
                            onClick={() => setPicked(e)}
                            className={`flex w-full items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-left transition ${
                              hit ? "border-amber-400 ring-1 ring-amber-300" : "border-neutral-200 hover:border-neutral-300"
                            } ${dim ? "opacity-30" : ""}`}
                          >
                            <OrgAvatar emp={e} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                {e.isManager && <span title="부서장">👑</span>}
                                <span className="truncate text-sm font-semibold text-neutral-800">{e.name}</span>
                              </div>
                              <div className="truncate text-[11px] text-neutral-500">
                                {[e.titleLabel, e.rankLabel].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {picked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPicked(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-20 w-20">
              <OrgAvatar emp={picked} big />
            </div>
            <div className="flex items-center justify-center gap-1">
              {picked.isManager && <span title="부서장">👑</span>}
              <h4 className="text-lg font-bold text-neutral-900">{picked.name}</h4>
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">{[picked.titleLabel, picked.rankLabel].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-4 space-y-1.5 text-left text-sm">
              <Row label="부서" value={picked.deptLabel ?? "미지정"} />
              <Row label="연락처" value={picked.phone ?? "—"} />
              <Row label="이메일" value={picked.email ?? "—"} />
              <Row label="입사일" value={picked.hiredOn ?? "—"} />
            </div>
            <button onClick={() => setPicked(null)} className="mt-5 w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-700">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-50 pb-1.5">
      <span className="shrink-0 text-neutral-400">{label}</span>
      <span className="truncate font-medium text-neutral-700">{value}</span>
    </div>
  );
}

function OrgAvatar({ emp, big = false }: { emp: OrgEmployee; big?: boolean }) {
  const cls = big ? "h-20 w-20 text-2xl" : "h-9 w-9 text-xs";
  if (emp.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={emp.photoUrl} alt={emp.name} className={`${cls} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-neutral-200 font-bold text-neutral-600`}>
      {emp.name.slice(0, 1)}
    </span>
  );
}
