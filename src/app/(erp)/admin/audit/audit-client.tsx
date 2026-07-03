"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuditLogRow } from "@/lib/supabase/database.types";

const TABLE_LABEL: Record<string, string> = {
  partners: "거래처",
  employees: "직원",
  companies: "사업자",
  accounts: "계정과목",
};

// 자주 나오는 컬럼의 한글 라벨(없으면 원본 키 표시)
const FIELD_LABEL: Record<string, string> = {
  name: "상호/이름", biz_no: "사업자번호", contact_name: "담당자", phone: "연락처", email: "이메일",
  company_id: "소속 사업자", category: "구분", memo: "메모", is_active: "활성", default_tax_rate: "부가세율",
  address: "주소", rep_name: "대표자", status: "상태", department: "부서", job_rank: "직급", job_title: "직책",
  employment_type: "고용형태", hired_on: "입사일", resigned_on: "퇴사일", photo_url: "사진", code: "코드",
  bank_name: "은행", account_no: "계좌번호", account_holder: "예금주",
};

const ACTION_META: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "생성", cls: "bg-emerald-50 text-emerald-700" },
  UPDATE: { label: "수정", cls: "bg-blue-50 text-blue-700" },
  DELETE: { label: "삭제", cls: "bg-rose-50 text-rose-700" },
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(없음)";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (typeof v === "object") {
    if (typeof (v as { name?: string }).name === "string") return String((v as { name: string }).name);
    const s = JSON.stringify(v);
    return s.length > 40 ? s.slice(0, 40) + "…" : s;
  }
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;

/** 로그 1건의 변경 요약 라인 배열. */
function summarize(log: AuditLogRow): { field: string; text: string }[] {
  const c = log.changes;
  if (!c || typeof c !== "object") return [];
  if (log.action === "UPDATE") {
    return Object.entries(c as Record<string, { from: unknown; to: unknown }>)
      .filter(([, v]) => v && typeof v === "object" && "to" in (v as object))
      .map(([k, v]) => ({ field: fieldLabel(k), text: `${fmtVal((v as { from: unknown }).from)} → ${fmtVal((v as { to: unknown }).to)}` }));
  }
  // CREATE / DELETE — 주요 필드만
  const skip = new Set(["id", "created_at", "updated_at", "source_ref", "photo_url"]);
  return Object.entries(c as Record<string, unknown>)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== "" && typeof v !== "object")
    .slice(0, 6)
    .map(([k, v]) => ({ field: fieldLabel(k), text: fmtVal(v) }));
}

export function AuditClient({
  logs,
  companyNames,
  entity,
  action,
}: {
  logs: AuditLogRow[];
  companyNames: Record<string, string>;
  entity: string;
  action: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  function go(params: Record<string, string>) {
    const next: Record<string, string> = {};
    if (entity) next.e = entity;
    if (action) next.a = action;
    Object.assign(next, params);
    // 빈 값은 제거
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
    router.push(`/admin/audit${q.toString() ? `?${q}` : ""}`);
  }

  const entityChips: { value: string; label: string }[] = [
    { value: "", label: "전체 대상" },
    { value: "partners", label: "거래처" },
    { value: "employees", label: "직원" },
    { value: "companies", label: "사업자" },
    { value: "accounts", label: "계정과목" },
  ];
  const actionChips: { value: string; label: string }[] = [
    { value: "", label: "전체 작업" },
    { value: "CREATE", label: "생성" },
    { value: "UPDATE", label: "수정" },
    { value: "DELETE", label: "삭제" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">🕵️ 감사추적</h1>
          <p className="mt-0.5 text-sm text-neutral-500">누가·언제·무엇을 바꿨는지 기록. 마스터데이터(거래처·직원·사업자·계정) 변경부터 수집됩니다.</p>
        </div>
        <span className="text-sm text-neutral-400">최근 {logs.length}건</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {entityChips.map((c) => (
            <button
              key={c.value}
              onClick={() => go({ e: c.value })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                entity === c.value ? "bg-indigo-500 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden text-neutral-300 sm:inline">·</span>
        <div className="flex flex-wrap gap-1">
          {actionChips.map((c) => (
            <button
              key={c.value}
              onClick={() => go({ a: c.value })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                action === c.value ? "bg-indigo-500 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">
          기록된 변경이력이 없습니다. (마스터데이터를 수정하면 여기에 쌓입니다)
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">시각</th>
                <th className="px-4 py-3 font-medium">작성자</th>
                <th className="px-4 py-3 font-medium">작업</th>
                <th className="px-4 py-3 font-medium">대상</th>
                <th className="px-4 py-3 font-medium">변경 내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {logs.map((log) => {
                const am = ACTION_META[log.action] ?? { label: log.action, cls: "bg-neutral-100 text-neutral-600" };
                const lines = summarize(log);
                const open = openId === log.id;
                return (
                  <tr key={log.id} className="align-top hover:bg-neutral-50/60">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-500">
                      {log.created_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{log.actor_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${am.cls}`}>{am.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-neutral-800">{TABLE_LABEL[log.entity_table] ?? log.entity_table}</span>
                      {log.label && <span className="ml-1.5 text-neutral-500">· {log.label}</span>}
                      {log.company_id && companyNames[log.company_id] && (
                        <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{companyNames[log.company_id]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lines.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {(open ? lines : lines.slice(0, 3)).map((l, i) => (
                            <div key={i} className="text-[13px]">
                              <span className="text-neutral-400">{l.field}</span>{" "}
                              <span className="text-neutral-700">{l.text}</span>
                            </div>
                          ))}
                          {lines.length > 3 && (
                            <button
                              onClick={() => setOpenId(open ? null : log.id)}
                              className="text-[11px] font-medium text-indigo-500 hover:underline"
                            >
                              {open ? "접기" : `+${lines.length - 3}개 더보기`}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
