"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InlineSelect } from "@/components/inline-select";
import { HoverPreview, type PreviewData } from "@/components/hover-preview";
import { OptionsManager, type OptionCat } from "@/components/options-manager";
import { BulkImport } from "@/components/bulk-import";
import { ExcelGrid, type GridCol } from "@/components/excel-grid";
import { PaybackList, type PaybackBrief } from "@/components/payback-list";
import { Field, TextInput, NumberInput, SelectInput, Badge, FormSection, FileButton } from "@/components/ui";
import { krw, LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL } from "@/lib/labels";
import { toneClass } from "@/lib/field-tones";
import { checkMinWage, severanceEstimate, leaveAllowance } from "@/lib/payroll";
import type {
  EmployeeRow,
  FieldOptionRow,
  AppRole,
  PayrollRow,
  LeaveRequestRow,
  LeaveType,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
  EmployeeMemoRow,
  DocumentTemplateRow,
  DocumentIssueRow,
} from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import type { VarCompany, VarLabels } from "@/lib/document-vars";
import { DocumentIssuePanel } from "@/components/document-issue-panel";
import { createIssue, saveSignedFile, deleteIssue } from "@/app/(erp)/documents/actions";
import { HrCardEditor } from "@/components/hr-card-editor";
import { normalizeHrExtra, HR_SCALAR_FIELDS, type HrScalarField } from "@/lib/hr-card";
import { createRow, updateRow, deleteRow, bulkSetRowActive, bulkDeleteRows } from "@/app/(erp)/actions";
import {
  createCertificate,
  deleteCertificate,
  createLeave,
  reviewLeave,
  deleteLeave,
  deleteContract,
  createDocument,
  deleteDocument,
  createEvent,
  deleteEvent,
  addEmployeeMemo,
  deleteEmployeeMemo,
  resignEmployee,
  reinstateEmployee,
} from "@/app/(erp)/hr/actions";
import {
  importTeachersFromWks,
  importTeacherAccountsFromWks,
  issueEmployeeAccount,
  resetEmployeePassword,
  setEmployeeAccountRole,
  revokeEmployeeAccount,
} from "./actions";

export interface AccountInfo {
  profileId: string;
  username: string | null;
  role: AppRole;
  isActive: boolean;
}

const AUTO_KEY = "erp_teacher_autosync";
const AUTO_INTERVAL_MS = 5 * 60 * 1000;

function TeacherSyncControls() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [auto, setAuto] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof window !== "undefined" && localStorage.getItem(AUTO_KEY) === "1") setAuto(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function sync(silent = false) {
    if (running.current) return;
    running.current = true;
    try {
      // ① 강사 정보 양방향 동기화
      const res = await importTeachersFromWks();
      if (!res.ok) {
        if (!silent) alert(res.error);
        router.refresh();
        return;
      }
      // ② 이어서 강사 로그인 계정(아이디·비번) 가져오기
      const acc = await importTeacherAccountsFromWks();
      setLast(new Date().toLocaleTimeString("ko-KR"));
      if (!silent) {
        const c = res.counts ?? {};
        const accLine = acc.ok
          ? `\n계정: 신규 ${acc.created} · 연결 ${acc.linked} · 건너뜀 ${acc.skipped}${acc.failed.length ? ` · 실패 ${acc.failed.length}` : ""}`
          : `\n계정 가져오기 실패: ${acc.error}`;
        alert(
          `강사 동기화 완료 (총 ${res.total}명)\n신규 ${c.생성 ?? 0} · 원본→ERP ${c["원본→ERP"] ?? 0} · ERP→원본 ${c["ERP→원본"] ?? 0} · 충돌 ${c.충돌 ?? 0}${accLine}`
        );
      }
      router.refresh();
    } finally {
      running.current = false;
    }
  }

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void sync(true), AUTO_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  function toggle() {
    const next = !auto;
    setAuto(next);
    try {
      localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) void sync(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-neutral-400">동기화:</span>
      <button
        onClick={() => startTransition(() => sync())}
        disabled={pending}
        title="winner-kids 강사 정보를 동기화하고, 아이디·비번(로그인 계정)까지 함께 가져옵니다"
        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {pending ? "가져오는 중…" : "👩‍🏫 강사·계정 가져오기"}
      </button>
      <label className="ml-1 flex items-center gap-1 text-xs text-neutral-600">
        <input type="checkbox" checked={auto} onChange={toggle} />
        자동
      </label>
      {auto && last && <span className="text-xs text-green-600">↻ {last}</span>}
    </div>
  );
}

type TabKey = "info" | "card" | "work" | "pay" | "payback" | "leave" | "docs" | "history";

// 관리형 옵션 카테고리(⚙ 항목 + 각 항목 옆 톱니 공용)
// EmployeeRow → 인사카드 신상 스칼라 초기값
function hrScalarsOf(emp: EmployeeRow): Partial<Record<HrScalarField, string>> {
  const o: Partial<Record<HrScalarField, string>> = {};
  for (const k of HR_SCALAR_FIELDS) o[k] = (emp[k as keyof EmployeeRow] as string | null) ?? "";
  return o;
}

const EMP_OPTION_CATS: OptionCat[] = [
  { key: "department", title: "부서", hint: "경영지원·교육·운영·영업 등" },
  { key: "employment_type", title: "고용형태", hint: "정규직·시급제·일일알바 등" },
  { key: "role", title: "권한", hint: "직원·부서장·관리자 등" },
  { key: "employee_status", title: "상태", hint: "재직·휴직·퇴사·계약종료 등" },
  { key: "job_rank", title: "직급", hint: "사원·대리·과장·부장 등" },
  { key: "job_title", title: "직책", hint: "팀원·팀장·실장·대표 등" },
];

export function EmployeesClient({
  rows,
  ctx,
  options,
  accounts,
  roles,
  payrollsByEmp,
  leavesByEmp,
  certsByEmp,
  contractsByEmp,
  docsByEmp,
  eventsByEmp,
  memosByEmp,
  paybacksByEmp,
  documentTemplates,
  docIssuesByEmp,
  companiesVar,
  initialSelectedId,
  initialTab,
}: {
  rows: EmployeeRow[];
  ctx: ImportCtx;
  options: FieldOptionRow[];
  accounts: Record<string, AccountInfo>;
  roles: { key: string; label: string }[];
  payrollsByEmp: Record<string, PayrollRow[]>;
  leavesByEmp: Record<string, LeaveRequestRow[]>;
  certsByEmp: Record<string, EmploymentCertificateRow[]>;
  contractsByEmp: Record<string, LaborContractRow[]>;
  docsByEmp: Record<string, EmployeeDocumentRow[]>;
  eventsByEmp: Record<string, EmployeeEventRow[]>;
  memosByEmp: Record<string, EmployeeMemoRow[]>;
  paybacksByEmp: Record<string, PaybackBrief[]>;
  documentTemplates: DocumentTemplateRow[];
  docIssuesByEmp: Record<string, DocumentIssueRow[]>;
  companiesVar: Record<string, VarCompany>;
  initialSelectedId?: string | null;
  initialTab?: string | null;
}) {
  const router = useRouter();
  const [mgrCats, setMgrCats] = useState<OptionCat[] | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [acctFor, setAcctFor] = useState<EmployeeRow | null>(null);
  const [editFor, setEditFor] = useState<EmployeeRow | null>(null);
  const [resignFor, setResignFor] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState("");
  const [seg, setSeg] = useState<"active" | "resigned" | "all">("active");
  const [empFilter, setEmpFilter] = useState("");
  const TAB_KEYS: TabKey[] = ["info", "card", "work", "pay", "payback", "leave", "docs", "history"];
  const [tab, setTab] = useState<TabKey>(
    initialTab && (TAB_KEYS as string[]).includes(initialTab) ? (initialTab as TabKey) : "info"
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? rows[0]?.id ?? null);
  const [view, setView] = useState<"card" | "grid">("card");

  const companyName = new Map(ctx.companies.map((c) => [c.id, c.name]));
  const optsOf = (cat: string) => options.filter((o) => o.category === cat && o.is_active);
  const labelOf = (cat: string) =>
    Object.fromEntries(options.filter((o) => o.category === cat).map((o) => [o.value, o.label]));
  const colorOf = (cat: string): Record<string, string> =>
    Object.fromEntries(options.filter((o) => o.category === cat).map((o) => [o.value, o.color ?? ""]));
  const empSel = optsOf("employment_type").map((o) => ({ value: o.value, label: o.label }));
  const roleSel = optsOf("role").map((o) => ({ value: o.value, label: o.label }));
  const statusSel = optsOf("employee_status").map((o) => ({ value: o.value, label: o.label }));
  const rankSel = optsOf("job_rank").map((o) => ({ value: o.value, label: o.label }));
  const titleSel = optsOf("job_title").map((o) => ({ value: o.value, label: o.label }));
  const deptSel = optsOf("department").map((o) => ({ value: o.value, label: o.label }));
  const empLabel = labelOf("employment_type");
  const roleLabel = labelOf("role");
  const statusLabel = labelOf("employee_status");
  const rankLabel = labelOf("job_rank");
  const titleLabel = labelOf("job_title");
  const deptLabel = labelOf("department");
  const statusColor = colorOf("employee_status");
  const empColor = colorOf("employment_type");

  // 재직/퇴사 구분: 퇴사·계약종료 = 퇴사자, 그 외(재직·휴직·미지정) = 근무중
  const isResigned = (r: EmployeeRow) => r.status === "퇴사" || r.status === "계약종료";
  const workingCount = rows.filter((r) => !isResigned(r)).length;
  const resignedCount = rows.filter((r) => isResigned(r)).length;

  // 상태 세그먼트로 1차 추림 → 고용형태 카운트·필터의 기준
  const segRows = rows.filter((r) => (seg === "all" ? true : seg === "active" ? !isResigned(r) : isResigned(r)));
  const empTypeCount = (v: string) => segRows.filter((r) => (r.employment_type ?? "") === v).length;

  const q = search.trim().toLowerCase();
  const filtered = segRows.filter((r) => {
    if (empFilter && (r.employment_type ?? "") !== empFilter) return false;
    if (!q) return true;
    return `${r.name} ${r.nickname ?? ""} ${r.phone ?? ""} ${accounts[r.id]?.username ?? ""} ${
      companyName.get(r.company_id ?? "") ?? ""
    }`
      .toLowerCase()
      .includes(q);
  });
  const selected = rows.find((r) => r.id === selectedId) ?? filtered[0] ?? rows[0] ?? null;

  const refresh = () => router.refresh();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-neutral-900">직원 관리</h1>
          {/* 보기 전환: 카드형(상세) ↔ 엑셀형(빠른 입력) */}
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm">
            <button
              onClick={() => setView("card")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                view === "card" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              🗂 카드형
            </button>
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-2.5 py-1 font-medium ${
                view === "grid" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              ▦ 엑셀형
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setMgrCats(EMP_OPTION_CATS)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            ⚙ 항목
          </button>
          <button
            onClick={() => setCsvOpen(true)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            📄 CSV 일괄등록
          </button>
          <TeacherSyncControls />
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            ＋ 직원 등록
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <EmployeeGrid
          rows={rows}
          ctx={ctx}
          empSel={empSel}
          roleSel={roleSel}
          statusSel={statusSel}
          rankSel={rankSel}
          titleSel={titleSel}
          deptSel={deptSel}
          empLabel={empLabel}
          roleLabel={roleLabel}
          statusLabel={statusLabel}
          rankLabel={rankLabel}
          titleLabel={titleLabel}
          deptLabel={deptLabel}
          companyName={companyName}
          onOpenDetail={(id) => {
            setSelectedId(id);
            setView("card");
          }}
          onChanged={refresh}
        />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* 좌측 목록 — 우측 상세 높이에 맞춰 늘어남(바닥 라인 정렬) */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <div className="shrink-0 border-b border-neutral-100 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 이름·닉네임·연락처·아이디"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <div className="mt-2 flex gap-1">
              {([
                ["active", "근무중", workingCount],
                ["resigned", "퇴사", resignedCount],
                ["all", "전체", rows.length],
              ] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => setSeg(k)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    seg === k ? "bg-indigo-500 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {label} <span className={seg === k ? "text-neutral-300" : "text-neutral-400"}>{n}</span>
                </button>
              ))}
            </div>
            {/* 고용형태 하위 필터 */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                onClick={() => setEmpFilter("")}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${empFilter === "" ? "bg-indigo-500 text-white" : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}
              >
                전체 {segRows.length}
              </button>
              {empSel.map((o) => {
                const n = empTypeCount(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => setEmpFilter(empFilter === o.value ? "" : o.value)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${empFilter === o.value ? "bg-indigo-500 text-white" : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}
                  >
                    {o.label} {n}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-1 text-xs text-neutral-400">{filtered.length}명 표시</p>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">직원이 없습니다.</p>
            ) : (
              filtered.map((r) => {
                const on = selected?.id === r.id;
                const acc = accounts[r.id];
                const preview: PreviewData = {
                  photoUrl: r.photo_url,
                  initial: r.name?.[0] ?? "?",
                  title: r.name,
                  subtitle: [companyName.get(r.company_id ?? "") ?? "미배정", empLabel[r.employment_type] ?? r.employment_type].filter(Boolean).join(" · "),
                  badge: r.status ? { label: statusLabel[r.status] ?? r.status, tone: statusColor[r.status] || "neutral" } : null,
                  fields: [
                    { label: "연락처", value: r.phone || "" },
                    { label: "이메일", value: r.email || "" },
                    { label: "부서", value: r.department ? deptLabel[r.department] ?? r.department : "" },
                    { label: "직급·직책", value: [r.job_rank ? rankLabel[r.job_rank] ?? r.job_rank : "", r.job_title ? titleLabel[r.job_title] ?? r.job_title : ""].filter(Boolean).join(" · ") },
                    { label: "아이디", value: acc?.username || "" },
                    { label: "입사일", value: r.hired_on || "" },
                  ],
                };
                return (
                  <HoverPreview key={r.id} data={preview}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                      on ? "bg-indigo-50" : "hover:bg-neutral-50"
                    } ${isResigned(r) ? "opacity-55" : ""}`}
                  >
                    <Avatar emp={r} size={9} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-neutral-800">{r.name}</span>
                        {!r.company_id && <Badge tone="neutral">미배정</Badge>}
                      </span>
                      <span className="block truncate text-xs text-neutral-400">
                        {r.phone || "연락처 없음"}
                        {acc?.username ? ` · ${acc.username}` : ""}
                      </span>
                    </span>
                    {r.status && (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${toneClass(statusColor[r.status])}`}>
                        {statusLabel[r.status] ?? r.status}
                      </span>
                    )}
                  </button>
                  </HoverPreview>
                );
              })
            )}
          </div>
        </div>

        {/* 우측 상세 */}
        {!selected ? (
          <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-10 text-sm text-neutral-400">
            왼쪽에서 직원을 선택하세요. (없으면 ‘＋ 직원 등록’)
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 카드 — 사진 크게 + 황금비 밸런스 */}
            <div className="rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 p-7 text-white shadow-md">
              <div className="flex flex-wrap items-center gap-7">
                <AvatarUpload emp={selected} onChanged={refresh} />
                <div className="min-w-0 flex-[1.618]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-3xl font-bold tracking-tight">{selected.name}</h2>
                    {selected.nickname && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{selected.nickname}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[15px] text-white/75">
                    {companyName.get(selected.company_id ?? "") ?? "미배정"} ·{" "}
                    {empLabel[selected.employment_type] ?? selected.employment_type}
                  </p>
                  {isResigned(selected) && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-rose-500/30 px-2.5 py-0.5 text-xs font-medium text-rose-50">
                      🚪 퇴사 {selected.resigned_on ?? "-"}
                      {selected.resign_reason ? ` · ${selected.resign_reason}` : ""}
                    </p>
                  )}
                  <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                    <HeaderField label="연락처" value={selected.phone || "-"} />
                    <HeaderField label="아이디" value={accounts[selected.id]?.username || "미발급"} />
                    <HeaderField label="상태" value={selected.status ? statusLabel[selected.status] ?? selected.status : "-"} />
                    <HeaderField label="은행" value={selected.bank_name || "-"} />
                    <HeaderField
                      label="급여기준"
                      value={
                        selected.employment_type === "HOURLY"
                          ? `${krw(selected.hourly_wage)} /시`
                          : krw(selected.base_salary)
                      }
                    />
                    <HeaderField
                      label={isResigned(selected) ? "재직기간" : "입사·근속"}
                      value={selected.hired_on ? `${selected.hired_on}${tenure(selected.hired_on, selected.resigned_on) ? ` · ${tenure(selected.hired_on, selected.resigned_on)}` : ""}` : "-"}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <HeaderBtn onClick={() => setEditFor(selected)}>✏️ 수정</HeaderBtn>
                <HeaderBtn onClick={() => setAcctFor(selected)}>🔑 계정·비번</HeaderBtn>
                {accounts[selected.id] && (
                  <HeaderBtn
                    onClick={() => {
                      if (!confirm(`${selected.name} 직원 계정으로 새 탭에서 전환 로그인합니다.\n\n⚠️ 세션은 브라우저 전체에 공유되어, 이 관리자 탭도 새로고침하면 직원으로 바뀝니다.\n관리자로 돌아가려면 로그아웃 후 본인 계정으로 다시 로그인하세요. 계속할까요?`)) return;
                      window.open(`/employees/impersonate/${selected.id}`, "_blank", "noopener");
                    }}
                  >
                    👤 직원 로그인(새 탭)
                  </HeaderBtn>
                )}
                {isResigned(selected) ? (
                  <HeaderBtn
                    onClick={() => {
                      if (!confirm(`${selected.name} 님을 복직/재입사 처리할까요? (재직 복귀 + 퇴사정보 해제)`)) return;
                      void reinstateEmployee(selected.id).then((r) => { if (r?.error) alert(r.error); else refresh(); });
                    }}
                  >
                    ↩ 복직/재입사
                  </HeaderBtn>
                ) : (
                  <HeaderBtn onClick={() => setResignFor(selected)}>🚪 퇴사 처리</HeaderBtn>
                )}
                <HeaderBtn
                  danger
                  onClick={() => {
                    if (!confirm(`${selected.name} 직원을 삭제할까요?`)) return;
                    void deleteRow("employees", selected.id).then(() => {
                      setSelectedId(null);
                      refresh();
                    });
                  }}
                >
                  🗑 삭제
                </HeaderBtn>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex flex-wrap gap-1 border-b border-neutral-200">
              {([
                ["info", "🧾 기본정보·계좌"],
                ["card", "🪪 인사카드"],
                ["work", "📋 근로조건·4대보험"],
                ["pay", "💰 급여·퇴직정산"],
                ["payback", "⭐ 포인트"],
                ["leave", "🌴 휴가·연차"],
                ["docs", "📄 서류·계약"],
                ["history", "📌 인사이력·메모"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                    tab === k
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "info" && (
              <InfoTab
                emp={selected}
                ctx={ctx}
                empSel={empSel}
                roleSel={roleSel}
                statusSel={statusSel}
                empLabel={empLabel}
                roleLabel={roleLabel}
                statusLabel={statusLabel}
                rankLabel={rankLabel}
                titleLabel={titleLabel}
                deptLabel={deptLabel}
                empColor={empColor}
                onEdit={() => setEditFor(selected)}
                onManage={(key) => setMgrCats(EMP_OPTION_CATS.filter((c) => c.key === key))}
              />
            )}
            {tab === "card" && (
              <HrCardEditor
                key={selected.id}
                initialScalars={hrScalarsOf(selected)}
                initialExtra={normalizeHrExtra(selected.hr_extra)}
                onSave={(sc, ex) => updateRow("employees", selected.id, { ...sc, hr_extra: ex })}
              />
            )}
            {tab === "work" && (
              <WorkTab emp={selected} onEdit={() => setEditFor(selected)} onChanged={refresh} />
            )}
            {tab === "pay" && (
              <PayTab
                emp={selected}
                payrolls={payrollsByEmp[selected.id] ?? []}
                leaves={leavesByEmp[selected.id] ?? []}
              />
            )}
            {tab === "payback" && (
              <PaybackList rows={paybacksByEmp[selected.id] ?? []} title="⭐ 포인트" term="포인트" />
            )}
            {tab === "leave" && (
              <LeaveTab emp={selected} leaves={leavesByEmp[selected.id] ?? []} onChanged={refresh} />
            )}
            {tab === "docs" && (
              <DocsTab
                emp={selected}
                certs={certsByEmp[selected.id] ?? []}
                contracts={contractsByEmp[selected.id] ?? []}
                docs={docsByEmp[selected.id] ?? []}
                empLabel={empLabel}
                onChanged={refresh}
                templates={documentTemplates}
                issues={docIssuesByEmp[selected.id] ?? []}
                company={companiesVar[selected.company_id ?? ""] ?? null}
                labels={{ employment_type: empLabel, job_rank: rankLabel, job_title: titleLabel }}
              />
            )}
            {tab === "history" && (
              <HistoryTab emp={selected} events={eventsByEmp[selected.id] ?? []} memos={memosByEmp[selected.id] ?? []} onChanged={refresh} />
            )}
          </div>
        )}
      </div>
      )}

      {mgrCats && (
        <OptionsManager
          options={options}
          cats={mgrCats}
          onClose={() => {
            setMgrCats(null);
            refresh();
          }}
        />
      )}
      {csvOpen && (
        <Modal title="직원 CSV 일괄등록" onClose={() => setCsvOpen(false)}>
          <div className="p-5">
            <BulkImport kind="employees" ctx={ctx} />
          </div>
        </Modal>
      )}
      {addOpen && (
        <EditModal
          mode="add"
          ctx={ctx}
          empSel={empSel}
          roleSel={roleSel}
          statusSel={statusSel}
          rankSel={rankSel}
          titleSel={titleSel}
          deptSel={deptSel}
          roles={roles}
          onClose={() => setAddOpen(false)}
          onSaved={(id) => {
            setAddOpen(false);
            if (id) setSelectedId(id);
            refresh();
          }}
        />
      )}
      {editFor && (
        <EditModal
          mode="edit"
          emp={editFor}
          ctx={ctx}
          empSel={empSel}
          roleSel={roleSel}
          statusSel={statusSel}
          rankSel={rankSel}
          titleSel={titleSel}
          deptSel={deptSel}
          roles={roles}
          accountInfo={accounts[editFor.id] ?? null}
          onAccountChanged={refresh}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null);
            refresh();
          }}
        />
      )}
      {acctFor && (
        <AccountModal
          employee={acctFor}
          info={accounts[acctFor.id] ?? null}
          roles={roles}
          onClose={() => setAcctFor(null)}
          onSaved={() => {
            setAcctFor(null);
            refresh();
          }}
        />
      )}
      {resignFor && (
        <ResignModal
          employee={resignFor}
          onClose={() => setResignFor(null)}
          onSaved={() => { setResignFor(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ---------- 퇴사 처리 모달 ----------
function ResignModal({ employee, onClose, onSaved }: { employee: EmployeeRow; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  function submit() {
    startTransition(async () => {
      const r = await resignEmployee(employee.id, date || null, reason || null);
      if (!r.ok) { alert(r.error ?? "처리 실패"); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">🚪 퇴사 처리 — {employee.name}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            퇴사 처리하면 <b>상태=퇴사</b>, <b>비활성</b>으로 바뀌어 근태·급여·직원 드롭다운·수업배정 등 운영 대상에서 제외되고, 인사이력에 자동 기록됩니다. (복직 버튼으로 되돌릴 수 있음)
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">퇴사일</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">퇴사 사유</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="자진퇴사 / 계약만료 / 권고사직 등" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
          <button onClick={submit} disabled={pending} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{pending ? "처리 중…" : "퇴사 처리"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 엑셀형 일괄입력 그리드 ----------
// 셀 클릭→바로 편집(updateRow), 맨 아래 +행 추가로 빈 직원 즉시 생성. winner 엑셀리스트 사용감.
const GRID_NUM_FIELDS = new Set(["base_salary", "hourly_wage", "dependents", "children_under20", "weekly_hours"]);
// 빈 값을 null 로 두면 안 되는(NOT NULL) 컬럼 — 빈 문자열/선택값 그대로 저장
const GRID_KEEP_FIELDS = new Set(["name", "employment_type", "role"]);

function EmployeeGrid({
  rows,
  ctx,
  empSel,
  roleSel,
  statusSel,
  rankSel,
  titleSel,
  deptSel,
  empLabel,
  roleLabel,
  statusLabel,
  rankLabel,
  titleLabel,
  deptLabel,
  companyName,
  onOpenDetail,
  onChanged,
}: {
  rows: EmployeeRow[];
  ctx: ImportCtx;
  empSel: { value: string; label: string }[];
  roleSel: { value: string; label: string }[];
  statusSel: { value: string; label: string }[];
  rankSel: { value: string; label: string }[];
  titleSel: { value: string; label: string }[];
  deptSel: { value: string; label: string }[];
  empLabel: Record<string, string>;
  roleLabel: Record<string, string>;
  statusLabel: Record<string, string>;
  rankLabel: Record<string, string>;
  titleLabel: Record<string, string>;
  deptLabel: Record<string, string>;
  companyName: Map<string, string>;
  onOpenDetail: (id: string) => void;
  onChanged: () => void;
}) {
  const [, startTransition] = useTransition();

  const numOrNull = (s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  // 셀 편집 커밋 → 모달 저장과 동일한 변환 규칙
  function handleEdit(id: string, key: string, raw: string) {
    let value: unknown;
    if (GRID_NUM_FIELDS.has(key)) value = numOrNull(raw);
    else if (GRID_KEEP_FIELDS.has(key)) value = key === "name" ? raw.trim() : raw;
    else value = raw.trim() === "" ? null : raw.trim();
    startTransition(async () => {
      await updateRow("employees", id, { [key]: value });
      onChanged();
    });
  }

  // +행 추가 → 빈 직원 즉시 생성. 모든 행이 같은 사업자면 그 사업자로 자동 배정.
  const soleCompany =
    rows.length > 0 && rows.every((r) => r.company_id === rows[0].company_id) ? rows[0].company_id : null;
  function handleAdd() {
    startTransition(async () => {
      await createRow("employees", {
        name: "",
        company_id: soleCompany,
        employment_type: empSel[0]?.value ?? "FULL_TIME",
        role: roleSel[0]?.value ?? "MEMBER",
      });
      onChanged();
    });
  }

  const companyOpts = [{ value: "", label: "미배정" }, ...ctx.companies.map((c) => ({ value: c.id, label: c.name }))];
  const statusOpts = [{ value: "", label: "미지정" }, ...statusSel];
  const rankOpts = [{ value: "", label: "미지정" }, ...rankSel];
  const titleOpts = [{ value: "", label: "미지정" }, ...titleSel];
  const deptOpts = [{ value: "", label: "미지정" }, ...deptSel];

  const columns: GridCol<EmployeeRow>[] = [
    { key: "name", label: "이름", width: 110, edit: "text", text: (r) => r.name ?? "" },
    { key: "nickname", label: "닉네임", width: 100, edit: "text", text: (r) => r.nickname ?? "" },
    {
      key: "company_id",
      label: "소속",
      width: 140,
      edit: "select",
      options: companyOpts,
      text: (r) => (r.company_id ? companyName.get(r.company_id) ?? "" : "미배정"),
    },
    {
      key: "employment_type",
      label: "고용형태",
      width: 100,
      edit: "select",
      options: empSel,
      text: (r) => empLabel[r.employment_type] ?? r.employment_type,
    },
    {
      key: "department",
      label: "부서",
      width: 100,
      edit: "select",
      options: deptOpts,
      text: (r) => (r.department ? deptLabel[r.department] ?? r.department : ""),
    },
    { key: "role", label: "권한", width: 90, edit: "select", options: roleSel, text: (r) => roleLabel[r.role] ?? r.role },
    {
      key: "job_rank",
      label: "직급",
      width: 90,
      edit: "select",
      options: rankOpts,
      text: (r) => (r.job_rank ? rankLabel[r.job_rank] ?? r.job_rank : ""),
    },
    {
      key: "job_title",
      label: "직책",
      width: 90,
      edit: "select",
      options: titleOpts,
      text: (r) => (r.job_title ? titleLabel[r.job_title] ?? r.job_title : ""),
    },
    {
      key: "status",
      label: "상태",
      width: 90,
      edit: "select",
      options: statusOpts,
      text: (r) => (r.status ? statusLabel[r.status] ?? r.status : ""),
    },
    { key: "phone", label: "연락처", width: 130, edit: "text", text: (r) => r.phone ?? "" },
    { key: "email", label: "이메일", width: 160, edit: "text", text: (r) => r.email ?? "" },
    { key: "hired_on", label: "입사일", width: 120, edit: "date", text: (r) => r.hired_on ?? "" },
    {
      key: "base_salary",
      label: "기본급(월)",
      width: 110,
      align: "right",
      edit: "number",
      text: (r) => (r.base_salary != null ? r.base_salary.toLocaleString() : ""),
    },
    {
      key: "hourly_wage",
      label: "시급",
      width: 90,
      align: "right",
      edit: "number",
      text: (r) => (r.hourly_wage != null ? r.hourly_wage.toLocaleString() : ""),
    },
    { key: "bank_name", label: "은행", width: 80, edit: "text", text: (r) => r.bank_name ?? "" },
    { key: "account_number", label: "계좌번호", width: 140, edit: "text", text: (r) => r.account_number ?? "" },
    { key: "account_holder", label: "예금주", width: 90, edit: "text", text: (r) => r.account_holder ?? "" },
    // 인적사항·근로조건 — 기본 표시되지만 ‘👁 컬럼 표시’로 숨길 수 있음
    { key: "birth", label: "생년월일", width: 120, edit: "date", text: (r) => r.birth ?? "" },
    { key: "address", label: "주소", width: 180, edit: "text", text: (r) => r.address ?? "" },
    { key: "emergency_contact", label: "비상연락처", width: 130, edit: "text", text: (r) => r.emergency_contact ?? "" },
    {
      key: "dependents",
      label: "부양가족",
      width: 80,
      align: "right",
      edit: "number",
      text: (r) => (r.dependents != null ? String(r.dependents) : ""),
    },
    {
      key: "children_under20",
      label: "20세이하자녀",
      width: 95,
      align: "right",
      edit: "number",
      text: (r) => (r.children_under20 != null ? String(r.children_under20) : ""),
    },
    {
      key: "weekly_hours",
      label: "주근로(h)",
      width: 90,
      align: "right",
      edit: "number",
      text: (r) => (r.weekly_hours != null ? String(r.weekly_hours) : ""),
    },
    { key: "memo", label: "메모", width: 160, edit: "text", text: (r) => r.memo ?? "" },
    {
      key: "_open",
      label: "상세",
      width: 64,
      align: "center",
      render: (r) => (
        <button
          onClick={() => onOpenDetail(r.id)}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          열기 ↗
        </button>
      ),
    },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 px-1 text-xs text-neutral-400">
        셀을 클릭하면 바로 수정됩니다 · 맨 아래 <b>+ 직원 행 추가</b>로 연속 입력 · 헤더 드래그로 순서 변경, 우측 경계 드래그로 폭 조정
      </p>
      <ExcelGrid
        storageKey="erp_employees_grid"
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        onEdit={handleEdit}
        onAddRow={handleAdd}
        addLabel="+ 직원 행 추가"
        accent={(r) => !r.name?.trim()}
        empty="직원이 없습니다. ‘+ 직원 행 추가’로 시작하세요."
        pageSize={30}
        searchPlaceholder="🔍 이름·닉네임·연락처·소속 검색"
        selectable
        renderBulk={(ids, clear) => (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => startTransition(async () => { await bulkSetRowActive("employees", ids, true); clear(); onChanged(); })}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >재직(활성)</button>
            <button
              onClick={() => startTransition(async () => { await bulkSetRowActive("employees", ids, false); clear(); onChanged(); })}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >비활성</button>
            <button
              onClick={() => { if (confirm(`선택한 ${ids.length}명을 삭제할까요? 되돌릴 수 없습니다.`)) startTransition(async () => { await bulkDeleteRows("employees", ids); clear(); onChanged(); }); }}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
            >🗑 삭제</button>
          </div>
        )}
      />
    </div>
  );
}

// 업로드 가능한 아바타(클릭·드래그·붙여넣기) — 작게 리사이즈해 photo_url(data URL)로 저장
function AvatarUpload({ emp, onChanged }: { emp: EmployeeRow; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState(false);

  function resizeAndSave(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const max = 256;
        let w = img.width;
        let h = img.height;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cx = canvas.getContext("2d");
        if (!cx) return;
        cx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        startTransition(async () => {
          await updateRow("employees", emp.id, { photo_url: dataUrl });
          onChanged();
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await it.getType(type);
          resizeAndSave(new File([blob], "paste.png", { type }));
          return;
        }
      }
      alert("클립보드에 이미지가 없습니다.");
    } catch {
      alert("붙여넣기를 사용할 수 없습니다. 클릭하거나 드래그로 올려주세요.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) resizeAndSave(f);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) resizeAndSave(f);
        }}
        title="클릭 또는 드래그해서 사진 업로드"
        className={`group/av relative h-32 w-32 shrink-0 cursor-pointer overflow-hidden rounded-3xl shadow-lg ring-4 ring-white/50 ${
          drag ? "opacity-70 ring-white" : ""
        }`}
      >
        {emp.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/90 text-5xl font-bold text-neutral-400">
            {emp.name?.[0] ?? "?"}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-center text-[10px] leading-tight text-white opacity-0 transition group-hover/av:opacity-100">
          {pending ? "저장중…" : "클릭·드래그"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={pasteFromClipboard}
          className="rounded-md bg-white/20 px-2 py-0.5 text-[11px] text-white hover:bg-white/30"
        >
          📋 붙여넣기
        </button>
        {emp.photo_url && (
          <button
            onClick={() =>
              startTransition(async () => {
                await updateRow("employees", emp.id, { photo_url: null });
                onChanged();
              })
            }
            className="rounded-md px-1 py-0.5 text-[11px] text-white/70 hover:text-white"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

// 아바타(사진 또는 이니셜)
function Avatar({ emp, size, ring }: { emp: EmployeeRow; size: number; ring?: boolean }) {
  const cls = `shrink-0 rounded-2xl object-cover ${ring ? "ring-2 ring-white/40" : ""}`;
  const dim = { width: size * 4, height: size * 4 };
  if (emp.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={emp.photo_url} alt="" className={cls} style={dim} />;
  }
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-neutral-200 font-bold text-neutral-500 ${ring ? "ring-2 ring-white/40" : ""}`}
      style={{ ...dim, fontSize: size * 1.6 }}
    >
      {emp.name?.[0] ?? "?"}
    </div>
  );
}

/** 근속기간(입사~퇴사 또는 현재) → "N년 M개월". */
function tenure(from: string | null, to: string | null): string {
  if (!from) return "";
  const start = new Date(`${from}T00:00:00`);
  const end = to ? new Date(`${to}T00:00:00`) : new Date();
  if (isNaN(start.getTime())) return "";
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months--;
  if (months < 0) return "";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y > 0 ? `${y}년 ` : ""}${m}개월`;
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}

function HeaderBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium backdrop-blur transition ${
        danger ? "bg-rose-500/90 text-white hover:bg-rose-600" : "bg-white/20 text-white hover:bg-white/30"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- 기본정보·계좌 탭 ----------
function InfoTab({
  emp,
  ctx,
  empSel,
  roleSel,
  statusSel,
  empLabel,
  roleLabel,
  statusLabel,
  rankLabel,
  titleLabel,
  deptLabel,
  empColor,
  onEdit,
  onManage,
}: {
  emp: EmployeeRow;
  ctx: ImportCtx;
  empSel: { value: string; label: string }[];
  roleSel: { value: string; label: string }[];
  statusSel: { value: string; label: string }[];
  empLabel: Record<string, string>;
  roleLabel: Record<string, string>;
  statusLabel: Record<string, string>;
  rankLabel: Record<string, string>;
  titleLabel: Record<string, string>;
  deptLabel: Record<string, string>;
  empColor: Record<string, string>;
  onEdit: () => void;
  onManage: (catKey: string) => void;
}) {
  const withCurrent = (
    sel: { value: string; label: string }[],
    labels: Record<string, string>,
    value: string
  ) => (sel.some((o) => o.value === value) ? sel : [{ value, label: labels[value] ?? value }, ...sel]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">🧾 기본 정보</h3>
          <button onClick={onEdit} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
            수정
          </button>
        </div>
        <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
          <Row label="이름">{emp.name}</Row>
          <Row label="닉네임">{emp.nickname || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="연락처">{emp.phone || "-"}</Row>
          <Row label="이메일">{emp.email || "-"}</Row>
          <Row
            label="소속"
            action={
              <Link
                href="/companies"
                title="사업자 추가·수정·삭제"
                aria-label="사업자 관리"
                className="text-neutral-300 transition-colors hover:text-neutral-700"
              >
                ⚙
              </Link>
            }
          >
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="company_id"
              value={emp.company_id ?? ""}
              placeholder="미배정"
              options={ctx.companies.map((c) => ({ value: c.id, label: c.name }))}
              tone={emp.company_id ? toneClass("teal") : toneClass("amber")}
            />
          </Row>
          <Row label="고용형태" action={<GearBtn onClick={() => onManage("employment_type")} title="고용형태 항목 관리" />}>
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="employment_type"
              value={emp.employment_type}
              options={withCurrent(empSel, empLabel, emp.employment_type)}
              tone={toneClass(empColor[emp.employment_type])}
            />
          </Row>
          <Row label="권한" action={<GearBtn onClick={() => onManage("role")} title="권한 항목 관리" />}>
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="role"
              value={emp.role}
              options={withCurrent(roleSel, roleLabel, emp.role)}
            />
          </Row>
          <Row label="부서" action={<GearBtn onClick={() => onManage("department")} title="부서 항목 관리" />}>
            {emp.department ? (deptLabel[emp.department] ?? emp.department) : <span className="text-neutral-300">미지정</span>}
          </Row>
          <Row label="직급" action={<GearBtn onClick={() => onManage("job_rank")} title="직급 항목 관리" />}>
            {emp.job_rank ? (rankLabel[emp.job_rank] ?? emp.job_rank) : <span className="text-neutral-300">미지정</span>}
          </Row>
          <Row label="직책" action={<GearBtn onClick={() => onManage("job_title")} title="직책 항목 관리" />}>
            {emp.job_title ? (titleLabel[emp.job_title] ?? emp.job_title) : <span className="text-neutral-300">미지정</span>}
          </Row>
          <Row label="상태" action={<GearBtn onClick={() => onManage("employee_status")} title="상태 항목 관리" />}>
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="status"
              value={emp.status ?? ""}
              placeholder="미지정"
              options={withCurrent(statusSel, statusLabel, emp.status ?? "")}
            />
          </Row>
          <Row label="입사일">{emp.hired_on || "-"}</Row>
          <Row label="급여기준">
            {emp.employment_type === "HOURLY" ? `${krw(emp.hourly_wage)} /시` : krw(emp.base_salary)}
          </Row>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">🏦 계좌 정보</h3>
          <button onClick={onEdit} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
            수정
          </button>
        </div>
        <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
          <Row label="은행명">{emp.bank_name || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="계좌번호">{emp.account_number || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="예금주">{emp.account_holder || <span className="text-neutral-300">미등록</span>}</Row>
        </dl>
        <div className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-400">메모: {emp.memo || "-"}</div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white lg:col-span-2">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">👤 인사기록(인적사항)</h3>
          <button onClick={onEdit} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
            수정
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 px-5 py-1 text-sm sm:grid-cols-2">
          <Row label="생년월일">{emp.birth || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="주민등록번호">
            {emp.resident_no ? maskResident(emp.resident_no) : <span className="text-neutral-300">미등록</span>}
          </Row>
          <Row label="주소">{emp.address || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="비상연락처">
            {emp.emergency_contact ? (
              <>
                {emp.emergency_contact}
                {emp.emergency_relation ? <span className="text-neutral-400"> ({emp.emergency_relation})</span> : null}
              </>
            ) : (
              <span className="text-neutral-300">미등록</span>
            )}
          </Row>
          <Row label="부양가족 수">
            {emp.dependents != null ? `${emp.dependents}명` : <span className="text-neutral-300">미등록</span>}
          </Row>
          <Row label="20세 이하 자녀">
            {emp.children_under20 != null ? `${emp.children_under20}명` : <span className="text-neutral-300">미등록</span>}
          </Row>
        </dl>
        <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">
          ※ 부양가족·자녀 수는 간이세액표(소득세) 정확도 향상에 사용됩니다.
        </p>
      </section>
    </div>
  );
}

// 주민등록번호 뒷자리 마스킹
function maskResident(v: string): string {
  const m = v.replace(/\s/g, "");
  if (m.length >= 8) return `${m.slice(0, 6)}-${m[7] ?? "*"}******`;
  return v;
}

function Row({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="flex shrink-0 items-center gap-1 text-neutral-400">
        {label}
        {action}
      </dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
    </div>
  );
}

/** 항목(목록) 설정 톱니 버튼 — 라벨 옆에 붙여 해당 목록 편집/추가/삭제 모달을 연다. */
function GearBtn({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="text-neutral-300 transition-colors hover:text-neutral-700"
    >
      ⚙
    </button>
  );
}

// ---------- 급여·퇴직정산 탭 ----------
function PayTab({ emp, payrolls, leaves }: { emp: EmployeeRow; payrolls: PayrollRow[]; leaves: LeaveRequestRow[] }) {
  const total = payrolls.reduce((s, p) => s + (p.net_pay ?? 0), 0);
  const asOf = emp.resigned_on ? new Date(`${emp.resigned_on}T00:00:00`) : new Date();

  // 최저임금 검증
  const mw = checkMinWage({
    employmentType: emp.employment_type,
    hourlyWage: emp.hourly_wage,
    baseSalary: emp.base_salary,
    weeklyHours: emp.weekly_hours,
  });

  // 퇴직금 추정 (최근 3개월 급여총액 = 기본급+수당+비과세)
  const recentGross = payrolls
    .slice(0, 3)
    .map((p) => p.base_pay + p.allowance + p.nontax_allowance);
  const sev = severanceEstimate({ hiredOn: emp.hired_on, asOf, recentMonthlyGross: recentGross });

  // 연차수당 추정
  const usedAnnual = leaves
    .filter((l) => l.status === "APPROVED" && (l.leave_type === "ANNUAL" || l.leave_type === "HALF_DAY"))
    .reduce((s, l) => s + (l.days ?? 0), 0);
  const la = leaveAllowance({
    hiredOn: emp.hired_on,
    asOf,
    usedDays: usedAnnual,
    monthlyOrdinaryWage: emp.base_salary,
  });

  return (
    <div className="space-y-4">
      {/* 최저임금 검증 */}
      {mw && (
        <div
          className={`rounded-2xl border px-5 py-3 text-sm ${
            mw.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"
          }`}
        >
          {mw.ok ? "✅ " : "⚠️ "}
          <b>최저임금 {mw.ok ? "충족" : "미달"}</b> — 환산 시급 <b>{krw(mw.hourly)}</b> / 최저 {krw(mw.min)}
          {!mw.ok && <> · 시급 <b>{krw(mw.shortfall)}</b> 부족</>}
          <span className="ml-1 text-xs opacity-70">(2026년 기준, 월급제는 209h 환산)</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 퇴직금 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">🏵 퇴직금 추정</h3>
          </div>
          {!sev ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-400">입사일을 입력하면 계산됩니다.</p>
          ) : (
            <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
              <Row label="재직기간">
                {sev.serviceYears.toFixed(2)}년 ({sev.serviceDays.toLocaleString()}일)
                {!sev.eligible && <span className="ml-2 text-xs text-amber-600">1년 미만 — 지급의무 없음</span>}
              </Row>
              <Row label="1일 평균임금">{krw(sev.avgDailyWage)}</Row>
              <Row label="퇴직금(추정)">
                <b className={sev.eligible ? "text-neutral-900" : "text-neutral-400"}>{krw(sev.amount)}</b>
              </Row>
            </dl>
          )}
          <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">
            ※ 평균임금 = 최근 3개월 급여총액 ÷ 91.25일 근사. 상여·연장수당 미반영 추정치.
          </p>
        </section>

        {/* 연차수당 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">🌴 미사용 연차수당 추정</h3>
          </div>
          {!la ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-400">기본급(통상임금)을 입력하면 계산됩니다.</p>
          ) : (
            <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
              <Row label="발생 연차">{la.accrued}일</Row>
              <Row label="사용 연차">{la.used}일</Row>
              <Row label="잔여 연차">
                <b>{la.remaining}일</b>
              </Row>
              <Row label="1일 통상임금">{krw(la.dailyOrdinaryWage)}</Row>
              <Row label="연차수당(추정)">
                <b className="text-neutral-900">{krw(la.amount)}</b>
              </Row>
            </dl>
          )}
          <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">
            ※ 1일 통상임금 = 기본급 ÷ 209h × 8h 근사.
          </p>
        </section>
      </div>

      {/* 급여 내역 */}
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">💰 급여 내역</h3>
          <span className="text-sm text-neutral-500">
            총 지급액 <b className="text-neutral-900">{krw(total)}</b> · {payrolls.length}건
          </span>
        </div>
        {payrolls.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">
            급여 내역이 없습니다.{" "}
            <Link href="/hr" className="text-indigo-600 underline">
              급여·인사에서 생성 →
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-100 text-xs text-neutral-500">
                <tr>
                  <th className="px-5 py-2">월</th>
                  <th className="px-3 py-2 text-right">기본급</th>
                  <th className="px-3 py-2 text-right">수당</th>
                  <th className="px-3 py-2 text-right">공제</th>
                  <th className="px-5 py-2 text-right">실지급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {payrolls.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2 font-medium">{p.year_month}</td>
                    <td className="px-3 py-2 text-right tabular">{krw(p.base_pay)}</td>
                    <td className="px-3 py-2 text-right tabular">{krw(p.allowance + p.nontax_allowance)}</td>
                    <td className="px-3 py-2 text-right tabular text-rose-600">
                      −{krw(p.income_tax + p.insurance + p.other_deduction)}
                    </td>
                    <td className="px-5 py-2 text-right tabular font-semibold">{krw(p.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-neutral-100 px-5 py-2 text-right">
          <Link href="/hr" className="text-xs text-neutral-500 hover:text-neutral-800">
            급여대장 관리 →
          </Link>
        </div>
      </section>
    </div>
  );
}

// ---------- 근로조건·4대보험 탭 ----------
function dday(dateStr: string | null, asOf: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - asOf.getTime()) / 86400000);
}

function WorkTab({ emp, onEdit, onChanged }: { emp: EmployeeRow; onEdit: () => void; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const now = new Date();
  const contractDday = dday(emp.contract_end, now);
  const probationDday = dday(emp.probation_end, now);

  function toggleIns(field: "ins_pension" | "ins_health" | "ins_employment" | "ins_industrial", next: boolean) {
    startTransition(async () => {
      await updateRow("employees", emp.id, { [field]: next });
      onChanged();
    });
  }

  return (
    <div className="space-y-4">
      {/* 알림 */}
      {(contractDday != null || probationDday != null) && (
        <div className="flex flex-wrap gap-2">
          {contractDday != null && (
            <span
              className={`rounded-xl border px-4 py-2 text-sm ${
                contractDday < 0
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : contractDday <= 30
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              📑 계약 만료 {emp.contract_end}{" "}
              {contractDday < 0 ? `(${-contractDday}일 경과)` : `(D-${contractDday})`}
              {contractDday >= 0 && contractDday <= 30 && " · 갱신/무기전환 검토"}
            </span>
          )}
          {probationDday != null && (
            <span
              className={`rounded-xl border px-4 py-2 text-sm ${
                probationDday >= 0 && probationDday <= 14
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              🧪 수습 종료 {emp.probation_end}{" "}
              {probationDday < 0 ? "(종료됨)" : `(D-${probationDday})`}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 근로조건 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">📋 근로조건</h3>
            <button onClick={onEdit} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
              수정
            </button>
          </div>
          <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
            <Row label="주 소정근로시간">
              {emp.weekly_hours != null ? `${emp.weekly_hours}시간` : <span className="text-neutral-300">미등록</span>}
            </Row>
            <Row label="근무요일">{emp.work_days || <span className="text-neutral-300">미등록</span>}</Row>
            <Row label="근무시간">
              {emp.work_start || emp.work_end ? `${emp.work_start || "-"} ~ ${emp.work_end || "-"}` : <span className="text-neutral-300">미등록</span>}
            </Row>
            <Row label="수습 종료일">{emp.probation_end || <span className="text-neutral-300">없음</span>}</Row>
            <Row label="계약 만료일">{emp.contract_end || <span className="text-neutral-300">기간 없음(정규)</span>}</Row>
          </dl>
        </section>

        {/* 4대보험 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">🛡 4대보험</h3>
            <button onClick={onEdit} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
              취득/상실일 수정
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 px-5 py-4">
            {([
              ["ins_pension", "국민연금"],
              ["ins_health", "건강보험"],
              ["ins_employment", "고용보험"],
              ["ins_industrial", "산재보험"],
            ] as const).map(([f, label]) => {
              const on = emp[f] ?? false;
              return (
                <label
                  key={f}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    on ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-neutral-200 bg-neutral-50 text-neutral-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={pending}
                    onChange={(e) => toggleIns(f, e.target.checked)}
                  />
                  {label} {on ? "가입" : "미가입"}
                </label>
              );
            })}
          </div>
          <dl className="divide-y divide-neutral-50 border-t border-neutral-100 px-5 py-1 text-sm">
            <Row label="자격취득일">{emp.ins_acquired_on || <span className="text-neutral-300">미등록</span>}</Row>
            <Row label="자격상실일">{emp.ins_lost_on || <span className="text-neutral-300">재직 중</span>}</Row>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ---------- 휴가·연차 탭 ----------
function LeaveTab({
  emp,
  leaves,
  onChanged,
}: {
  emp: EmployeeRow;
  leaves: LeaveRequestRow[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ leave_type: "ANNUAL" as LeaveType, start_date: "", end_date: "", reason: "" });

  const usedAnnual = leaves
    .filter((l) => l.status === "APPROVED" && (l.leave_type === "ANNUAL" || l.leave_type === "HALF_DAY"))
    .reduce((s, l) => s + (l.days ?? 0), 0);

  function daysBetween(a: string, b: string) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 1;
  }
  function add() {
    if (!d.start_date || !d.end_date) return;
    startTransition(async () => {
      await createLeave({
        company_id: emp.company_id ?? "",
        employee_id: emp.id,
        leave_type: d.leave_type,
        start_date: d.start_date,
        end_date: d.end_date,
        days: d.leave_type === "HALF_DAY" ? 0.5 : daysBetween(d.start_date, d.end_date),
        reason: d.reason || null,
        status: "PENDING",
      });
      setAdding(false);
      setD({ leave_type: "ANNUAL", start_date: "", end_date: "", reason: "" });
      onChanged();
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">
          🌴 휴가·연차 <span className="ml-2 text-sm font-normal text-neutral-500">사용 연차 {usedAnnual}일</span>
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={!emp.company_id}
          title={emp.company_id ? "" : "소속 사업자를 먼저 지정하세요"}
          className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40"
        >
          + 휴가 추가
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-2 gap-2 border-b border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-5">
          <SelectInput value={d.leave_type} onChange={(e) => setD({ ...d, leave_type: e.target.value as LeaveType })}>
            {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </SelectInput>
          <TextInput type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })} />
          <TextInput type="date" value={d.end_date} onChange={(e) => setD({ ...d, end_date: e.target.value })} />
          <TextInput value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="사유" />
          <button
            onClick={add}
            disabled={pending || !d.start_date || !d.end_date}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            등록
          </button>
        </div>
      )}

      {leaves.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">휴가 신청 내역이 없습니다.</p>
      ) : (
        <div className="divide-y divide-neutral-50">
          {leaves.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <div>
                <span className="font-medium">{LEAVE_TYPE_LABEL[l.leave_type]}</span>
                <span className="ml-2 text-neutral-500">
                  {l.start_date}
                  {l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ""} · {l.days}일
                </span>
                {l.reason && <span className="ml-2 text-xs text-neutral-400">{l.reason}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "neutral"}>
                  {LEAVE_STATUS_LABEL[l.status]}
                </Badge>
                {l.status === "PENDING" && (
                  <>
                    <button
                      onClick={() => startTransition(async () => { await reviewLeave(l.id, "APPROVED"); onChanged(); })}
                      className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => startTransition(async () => { await reviewLeave(l.id, "REJECTED"); onChanged(); })}
                      className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                    >
                      반려
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (confirm("삭제할까요?")) startTransition(async () => { await deleteLeave(l.id); onChanged(); });
                  }}
                  className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// 파일 → data URL (계약서·서류 첨부). 너무 크면 null 반환.
function fileToDataUrl(file: File, maxMB = 3): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > maxMB * 1024 * 1024) {
      alert(`파일이 너무 큽니다(최대 ${maxMB}MB).`);
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ---------- 서류·계약 탭 ----------
function DocsTab({
  emp,
  certs,
  contracts,
  docs,
  empLabel,
  onChanged,
  templates,
  issues,
  company,
  labels,
}: {
  emp: EmployeeRow;
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
  empLabel: Record<string, string>;
  onChanged: () => void;
  templates: DocumentTemplateRow[];
  issues: DocumentIssueRow[];
  company: VarCompany | null;
  labels: VarLabels;
}) {
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({ position: "", department: "", purpose: "", submit_to: "" });

  // 근로계약서 추가 폼
  // 서류 추가 폼
  const [dAdding, setDAdding] = useState(false);
  const [doc, setDoc] = useState({ doc_type: "통장사본", title: "", issued_on: "", expires_on: "", file_url: "", memo: "" });

  function issue() {
    startTransition(async () => {
      await createCertificate({
        company_id: emp.company_id ?? "",
        employee_id: emp.id,
        employee_name: emp.name,
        hired_on: emp.hired_on,
        employment_type: empLabel[emp.employment_type] ?? emp.employment_type,
        position: form.position || null,
        department: form.department || null,
        purpose: form.purpose || null,
        submit_to: form.submit_to || null,
      });
      setIssuing(false);
      setForm({ position: "", department: "", purpose: "", submit_to: "" });
      onChanged();
    });
  }

  function addDoc() {
    startTransition(async () => {
      await createDocument({
        employee_id: emp.id,
        doc_type: doc.doc_type || null,
        title: doc.title || null,
        issued_on: doc.issued_on || null,
        expires_on: doc.expires_on || null,
        file_url: doc.file_url || null,
        memo: doc.memo || null,
      });
      setDAdding(false);
      setDoc({ doc_type: "통장사본", title: "", issued_on: "", expires_on: "", file_url: "", memo: "" });
      onChanged();
    });
  }

  const wageLabel = (t: string | null) => (t === "HOURLY" ? "시급" : "월급");

  return (
    <div className="space-y-4">
      {/* 서류 양식 발행·보관 */}
      <DocumentIssuePanel
        employee={emp}
        company={company}
        labels={labels}
        today={todayStr}
        templates={templates}
        issues={issues}
        companyId={emp.company_id ?? null}
        actions={{ create: createIssue, saveSigned: saveSignedFile, remove: deleteIssue }}
      />

      {/* 근로계약서: 신규는 위 '서류 발행'에서 '표준 근로계약서' 양식으로 발행. 여기는 과거 기록(읽기전용)만. */}
      {contracts.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">
              📝 기존 근로계약서 <span className="ml-1 text-xs font-normal text-neutral-400">{contracts.length}건 · 이력</span>
            </h3>
            <span className="text-[11px] text-neutral-400">신규는 ‘서류 발행’ 사용</span>
          </div>
          <div className="divide-y divide-neutral-50">
            {contracts.map((ct) => (
              <div key={ct.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{ct.contract_type || "근로계약"}</span>
                  <span className="ml-2 text-neutral-500">
                    {ct.start_date || "?"}
                    {ct.end_date ? ` ~ ${ct.end_date}` : " ~ (기간없음)"}
                  </span>
                  {ct.wage_amount != null && (
                    <span className="ml-2 text-xs text-neutral-400">
                      {wageLabel(ct.wage_type)} {krw(ct.wage_amount)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ct.file_url && (
                    <a href={ct.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                      첨부보기
                    </a>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("삭제할까요?")) startTransition(async () => { await deleteContract(ct.id); onChanged(); });
                    }}
                    className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 재직증명서 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">📄 재직증명서</h3>
            <button
              onClick={() => setIssuing((v) => !v)}
              disabled={!emp.company_id}
              title={emp.company_id ? "" : "소속 사업자를 먼저 지정하세요"}
              className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40"
            >
              + 발급
            </button>
          </div>
          {issuing && (
            <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <TextInput value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="부서" />
                <TextInput value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="직위" />
                <TextInput value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="용도" />
                <TextInput value={form.submit_to} onChange={(e) => setForm({ ...form, submit_to: e.target.value })} placeholder="제출처" />
              </div>
              <button onClick={issue} disabled={pending} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
                발급
              </button>
            </div>
          )}
          {certs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-400">발급 이력이 없습니다.</p>
          ) : (
            <div className="divide-y divide-neutral-50">
              {certs.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{cert.cert_no}</span>
                    <span className="ml-2 text-neutral-500">{cert.issued_on}</span>
                    {cert.purpose && <span className="ml-2 text-xs text-neutral-400">{cert.purpose}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/cert/${cert.id}`} target="_blank" className="text-xs text-indigo-600 underline">
                      보기/인쇄
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm("삭제할까요?")) startTransition(async () => { await deleteCertificate(cert.id); onChanged(); });
                      }}
                      className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 증빙 서류함 */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <h3 className="font-semibold text-neutral-800">
              🗂 첨부 보관함 <span className="ml-1 text-xs font-normal text-neutral-400">{docs.length}건 · 스캔본·증빙</span>
            </h3>
            <button onClick={() => setDAdding((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">
              + 서류 추가
            </button>
          </div>
          {dAdding && (
            <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <SelectInput value={doc.doc_type} onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}>
                  {["통장사본", "주민등록등본", "자격증", "이직확인서", "건강검진", "기타"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </SelectInput>
                <TextInput value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder="제목" />
                <label className="text-xs text-neutral-500">발급일<TextInput type="date" value={doc.issued_on} onChange={(e) => setDoc({ ...doc, issued_on: e.target.value })} /></label>
                <label className="text-xs text-neutral-500">만료일<TextInput type="date" value={doc.expires_on} onChange={(e) => setDoc({ ...doc, expires_on: e.target.value })} /></label>
              </div>
              <FileButton
                accept="image/*,application/pdf"
                label="파일 선택 (이미지·PDF)"
                onFile={async (f) => {
                  const url = await fileToDataUrl(f);
                  if (url) setDoc((p) => ({ ...p, file_url: url }));
                }}
              />
              <div className="text-right">
                <button onClick={addDoc} disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
                  저장
                </button>
              </div>
            </div>
          )}
          {docs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-400">등록된 서류가 없습니다.</p>
          ) : (
            <div className="divide-y divide-neutral-50">
              {docs.map((d) => {
                const exp = dday(d.expires_on, new Date());
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{d.doc_type || "서류"}</span>
                      <span className="ml-2 font-medium">{d.title || "-"}</span>
                      {d.expires_on && (
                        <span className={`ml-2 text-xs ${exp != null && exp < 30 ? "text-rose-500" : "text-neutral-400"}`}>
                          만료 {d.expires_on}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                          보기
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("삭제할까요?")) startTransition(async () => { await deleteDocument(d.id); onChanged(); });
                        }}
                        className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- 인사이력·메모 탭 ----------
function HistoryTab({ emp, events, memos, onChanged }: { emp: EmployeeRow; events: EmployeeEventRow[]; memos: EmployeeMemoRow[]; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [memo, setMemo] = useState("");
  const [adding, setAdding] = useState(false);
  const [e, setE] = useState({ event_date: "", event_type: "발령", title: "", detail: "" });

  function saveMemo() {
    const text = memo.trim();
    if (!text) return;
    startTransition(async () => {
      const r = await addEmployeeMemo(emp.id, text);
      if (!r.ok) { alert(r.error); return; }
      setMemo("");
      onChanged();
    });
  }
  function addEvent() {
    if (!e.title && !e.event_type) return;
    startTransition(async () => {
      await createEvent({
        employee_id: emp.id,
        event_date: e.event_date || null,
        event_type: e.event_type || null,
        title: e.title || null,
        detail: e.detail || null,
      });
      setAdding(false);
      setE({ event_date: "", event_type: "발령", title: "", detail: "" });
      onChanged();
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">
            📌 인사 발령·변동 이력 <span className="ml-1 text-xs font-normal text-neutral-400">{events.length}건</span>
          </h3>
          <button onClick={() => setAdding((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">
            + 이력 추가
          </button>
        </div>
        {adding && (
          <div className="grid grid-cols-2 gap-2 border-b border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-5">
            <TextInput type="date" value={e.event_date} onChange={(ev) => setE({ ...e, event_date: ev.target.value })} />
            <SelectInput value={e.event_type} onChange={(ev) => setE({ ...e, event_type: ev.target.value })}>
              {["입사", "승진", "부서이동", "급여변동", "휴직", "복직", "계약갱신", "퇴사", "기타"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </SelectInput>
            <TextInput value={e.title} onChange={(ev) => setE({ ...e, title: ev.target.value })} placeholder="제목" />
            <TextInput value={e.detail} onChange={(ev) => setE({ ...e, detail: ev.target.value })} placeholder="상세" />
            <button onClick={addEvent} disabled={pending} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
              등록
            </button>
          </div>
        )}
        {events.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">등록된 인사 이력이 없습니다.</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="text-neutral-500">{ev.event_date || "-"}</span>
                  <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{ev.event_type || "-"}</span>
                  {ev.title && <span className="ml-2 font-medium">{ev.title}</span>}
                  {ev.detail && <span className="ml-2 text-xs text-neutral-400">{ev.detail}</span>}
                </div>
                <button
                  onClick={() => {
                    if (confirm("삭제할까요?")) startTransition(async () => { await deleteEvent(ev.id); onChanged(); });
                  }}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">📝 메모 <span className="ml-1 text-xs font-normal text-neutral-400">{memos.length}건</span></h3>
        </div>
        <div className="space-y-3 p-5">
          {/* 새 메모 입력 → 누적 기록 */}
          <div className="space-y-2">
            <textarea
              value={memo}
              onChange={(ev) => setMemo(ev.target.value)}
              onKeyDown={(ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") saveMemo(); }}
              rows={3}
              placeholder="메모를 입력하면 시각·작성자와 함께 계속 기록됩니다… (Ctrl+Enter로 저장)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <div className="text-right">
              <button
                onClick={saveMemo}
                disabled={pending || !memo.trim()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                기록 추가
              </button>
            </div>
          </div>

          {/* 누적 메모 로그(최신순) */}
          {memos.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">기록된 메모가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {memos.map((m) => (
                <li key={m.id} className="group rounded-xl border border-neutral-100 bg-neutral-50/60 px-3.5 py-2.5">
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-400">
                    <span className="font-medium text-neutral-500">{m.author_name ?? "작성자"}</span>
                    <span className="tabular-nums">{m.created_at.slice(0, 16).replace("T", " ")}</span>
                    <button
                      onClick={() => { if (confirm("이 메모를 삭제할까요?")) startTransition(async () => { await deleteEmployeeMemo(m.id); onChanged(); }); }}
                      className="ml-auto text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-500"
                    >
                      🗑
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-neutral-700">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------- 공용 모달 ----------
function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className={`mt-12 w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-neutral-200 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- 직원 추가/수정 ----------
function EditModal({
  mode,
  emp,
  ctx,
  empSel,
  roleSel,
  statusSel,
  rankSel,
  titleSel,
  deptSel,
  roles,
  accountInfo,
  onAccountChanged,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  emp?: EmployeeRow;
  ctx: ImportCtx;
  empSel: { value: string; label: string }[];
  roleSel: { value: string; label: string }[];
  statusSel: { value: string; label: string }[];
  rankSel: { value: string; label: string }[];
  titleSel: { value: string; label: string }[];
  deptSel: { value: string; label: string }[];
  roles: { key: string; label: string }[];
  accountInfo?: AccountInfo | null;
  onAccountChanged?: () => void;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const numOrNull = (s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  };
  const [d, setD] = useState({
    name: emp?.name ?? "",
    nickname: emp?.nickname ?? "",
    phone: emp?.phone ?? "",
    email: emp?.email ?? "",
    company_id: emp?.company_id ?? "",
    employment_type: emp?.employment_type ?? empSel[0]?.value ?? "",
    role: emp?.role ?? roleSel[0]?.value ?? "",
    department: emp?.department ?? "",
    job_rank: emp?.job_rank ?? "",
    job_title: emp?.job_title ?? "",
    status: emp?.status ?? "",
    hired_on: emp?.hired_on ?? "",
    base_salary: emp?.base_salary?.toString() ?? "",
    hourly_wage: emp?.hourly_wage?.toString() ?? "",
    bank_name: emp?.bank_name ?? "",
    account_number: emp?.account_number ?? "",
    account_holder: emp?.account_holder ?? "",
    photo_url: emp?.photo_url ?? "",
    memo: emp?.memo ?? "",
    // 인사기록
    birth: emp?.birth ?? "",
    resident_no: emp?.resident_no ?? "",
    address: emp?.address ?? "",
    emergency_contact: emp?.emergency_contact ?? "",
    emergency_relation: emp?.emergency_relation ?? "",
    dependents: emp?.dependents?.toString() ?? "",
    children_under20: emp?.children_under20?.toString() ?? "",
    // 근로조건
    weekly_hours: emp?.weekly_hours?.toString() ?? "",
    work_days: emp?.work_days ?? "",
    work_start: emp?.work_start ?? "",
    work_end: emp?.work_end ?? "",
    probation_end: emp?.probation_end ?? "",
    contract_end: emp?.contract_end ?? "",
    // 4대보험
    ins_acquired_on: emp?.ins_acquired_on ?? "",
    ins_lost_on: emp?.ins_lost_on ?? "",
    // 퇴사
    resigned_on: emp?.resigned_on ?? "",
    resign_reason: emp?.resign_reason ?? "",
  });

  function save() {
    if (!d.name.trim()) {
      setError("이름은 필수입니다");
      return;
    }
    const value = {
      name: d.name.trim(),
      nickname: d.nickname.trim() || null,
      phone: d.phone.trim() || null,
      email: d.email.trim() || null,
      company_id: d.company_id || null,
      employment_type: d.employment_type,
      role: d.role,
      department: d.department || null,
      job_rank: d.job_rank || null,
      job_title: d.job_title || null,
      status: d.status || null,
      hired_on: d.hired_on || null,
      base_salary: numOrNull(d.base_salary),
      hourly_wage: numOrNull(d.hourly_wage),
      bank_name: d.bank_name.trim() || null,
      account_number: d.account_number.trim() || null,
      account_holder: d.account_holder.trim() || null,
      photo_url: d.photo_url.trim() || null,
      memo: d.memo.trim() || null,
      birth: d.birth || null,
      resident_no: d.resident_no.trim() || null,
      address: d.address.trim() || null,
      emergency_contact: d.emergency_contact.trim() || null,
      emergency_relation: d.emergency_relation.trim() || null,
      dependents: numOrNull(d.dependents),
      children_under20: numOrNull(d.children_under20),
      weekly_hours: numOrNull(d.weekly_hours),
      work_days: d.work_days.trim() || null,
      work_start: d.work_start.trim() || null,
      work_end: d.work_end.trim() || null,
      probation_end: d.probation_end || null,
      contract_end: d.contract_end || null,
      ins_acquired_on: d.ins_acquired_on || null,
      ins_lost_on: d.ins_lost_on || null,
      resigned_on: d.resigned_on || null,
      resign_reason: d.resign_reason.trim() || null,
    };
    startTransition(async () => {
      const res = mode === "edit" && emp
        ? await updateRow("employees", emp.id, value)
        : await createRow("employees", value);
      if (res.ok) onSaved(emp?.id);
      else setError(res.error ?? "오류");
    });
  }

  const colSpan2 = "col-span-2";

  return (
    <Modal title={mode === "add" ? "직원 등록" : `${emp?.name} 수정`} onClose={onClose} wide>
      <div className="space-y-3 bg-neutral-50 p-4">
        {/* 1. 기본 정보 */}
        <FormSection no={1} title="기본 정보">
          <Field label="이름" required><TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="닉네임"><TextInput value={d.nickname} onChange={(e) => setD({ ...d, nickname: e.target.value })} placeholder="호칭·별칭" /></Field>
          <Field label="연락처"><TextInput value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
          <Field label="이메일"><TextInput value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="name@example.com" /></Field>
          <Field label="소속 사업자">
            <SelectInput value={d.company_id} onChange={(e) => setD({ ...d, company_id: e.target.value })}>
              <option value="">미배정</option>
              {ctx.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="상태">
            <SelectInput value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
              <option value="">미지정</option>
              {statusSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="고용형태">
            <SelectInput value={d.employment_type} onChange={(e) => setD({ ...d, employment_type: e.target.value })}>
              {empSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="권한">
            <SelectInput value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
              {roleSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="부서">
            <SelectInput value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })}>
              <option value="">미지정</option>
              {deptSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="직급">
            <SelectInput value={d.job_rank} onChange={(e) => setD({ ...d, job_rank: e.target.value })}>
              <option value="">미지정</option>
              {rankSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="직책">
            <SelectInput value={d.job_title} onChange={(e) => setD({ ...d, job_title: e.target.value })}>
              <option value="">미지정</option>
              {titleSel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </Field>
        </FormSection>

        {/* 2. 급여·계좌 */}
        <FormSection no={2} title="급여 · 계좌">
          <Field label="입사일"><TextInput type="date" value={d.hired_on} onChange={(e) => setD({ ...d, hired_on: e.target.value })} /></Field>
          <div />
          <Field label="기본급 (월, 원)"><NumberInput value={d.base_salary} onChange={(v) => setD({ ...d, base_salary: v })} placeholder="2,800,000" /></Field>
          <Field label="시급 (원)"><NumberInput value={d.hourly_wage} onChange={(v) => setD({ ...d, hourly_wage: v })} placeholder="12,000" /></Field>
          <Field label="은행명"><TextInput value={d.bank_name} onChange={(e) => setD({ ...d, bank_name: e.target.value })} placeholder="국민·신한 등" /></Field>
          <Field label="계좌번호"><TextInput value={d.account_number} onChange={(e) => setD({ ...d, account_number: e.target.value })} placeholder="숫자만" /></Field>
          <Field label="예금주"><TextInput value={d.account_holder} onChange={(e) => setD({ ...d, account_holder: e.target.value })} placeholder="본인과 다를 경우" /></Field>
        </FormSection>

        {/* 3. 인사기록 */}
        <FormSection no={3} title="인사기록(인적사항)" desc="부양가족 수는 소득세 계산에 사용">
          <Field label="생년월일"><TextInput type="date" value={d.birth} onChange={(e) => setD({ ...d, birth: e.target.value })} /></Field>
          <Field label="주민등록번호"><TextInput value={d.resident_no} onChange={(e) => setD({ ...d, resident_no: e.target.value })} placeholder="000000-0000000" /></Field>
          <div className={colSpan2}>
            <Field label="주소"><TextInput value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="도로명 주소" /></Field>
          </div>
          <Field label="비상연락처"><TextInput value={d.emergency_contact} onChange={(e) => setD({ ...d, emergency_contact: e.target.value })} placeholder="010-0000-0000" /></Field>
          <Field label="비상연락 관계"><TextInput value={d.emergency_relation} onChange={(e) => setD({ ...d, emergency_relation: e.target.value })} placeholder="배우자·부모 등" /></Field>
          <Field label="부양가족 수 (본인 포함)"><NumberInput value={d.dependents} onChange={(v) => setD({ ...d, dependents: v })} placeholder="1" /></Field>
          <Field label="20세 이하 자녀 수"><NumberInput value={d.children_under20} onChange={(v) => setD({ ...d, children_under20: v })} placeholder="0" /></Field>
        </FormSection>

        {/* 4. 근로조건 */}
        <FormSection no={4} title="근로조건">
          <Field label="주 소정근로시간 (h)"><NumberInput value={d.weekly_hours} onChange={(v) => setD({ ...d, weekly_hours: v })} placeholder="40" /></Field>
          <Field label="근무요일"><TextInput value={d.work_days} onChange={(e) => setD({ ...d, work_days: e.target.value })} placeholder="월~금" /></Field>
          <Field label="근무 시작"><TextInput value={d.work_start} onChange={(e) => setD({ ...d, work_start: e.target.value })} placeholder="09:00" /></Field>
          <Field label="근무 종료"><TextInput value={d.work_end} onChange={(e) => setD({ ...d, work_end: e.target.value })} placeholder="18:00" /></Field>
          <Field label="수습 종료일"><TextInput type="date" value={d.probation_end} onChange={(e) => setD({ ...d, probation_end: e.target.value })} /></Field>
          <Field label="계약 만료일 (계약직)"><TextInput type="date" value={d.contract_end} onChange={(e) => setD({ ...d, contract_end: e.target.value })} /></Field>
        </FormSection>

        {/* 5. 4대보험 · 퇴사 */}
        <FormSection no={5} title="4대보험 · 퇴사" desc="보험 가입여부는 ‘근로조건·4대보험’ 탭에서">
          <Field label="4대보험 취득일"><TextInput type="date" value={d.ins_acquired_on} onChange={(e) => setD({ ...d, ins_acquired_on: e.target.value })} /></Field>
          <Field label="4대보험 상실일"><TextInput type="date" value={d.ins_lost_on} onChange={(e) => setD({ ...d, ins_lost_on: e.target.value })} /></Field>
          <Field label="퇴사일"><TextInput type="date" value={d.resigned_on} onChange={(e) => setD({ ...d, resigned_on: e.target.value })} /></Field>
          <Field label="퇴사사유"><TextInput value={d.resign_reason} onChange={(e) => setD({ ...d, resign_reason: e.target.value })} placeholder="자진/권고/계약만료/해고" /></Field>
        </FormSection>

        {/* 6. 메모 */}
        <FormSection no={6} title="메모">
          <div className={colSpan2}>
            <textarea
              value={d.memo}
              onChange={(e) => setD({ ...d, memo: e.target.value })}
              rows={3}
              placeholder="이 직원에 대한 메모…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
        </FormSection>

        {/* 7. 로그인 계정 (수정 모드 전용 — 직원이 존재해야 발급 가능) */}
        <FormSection no={7} title="로그인 계정" desc="직원이 본인 아이디·비밀번호로 로그인(개인 페이지 /me)">
          <div className={colSpan2}>
            {mode === "edit" && emp ? (
              <AccountPanel
                employee={emp}
                info={accountInfo ?? null}
                roles={roles}
                onSaved={() => onAccountChanged?.()}
              />
            ) : (
              <p className="rounded-lg bg-neutral-100 px-3 py-3 text-sm text-neutral-500">
                먼저 직원을 <b>저장</b>한 뒤, 목록에서 다시 열면 여기서 아이디·비밀번호를 발급할 수 있습니다.
              </p>
            )}
          </div>
        </FormSection>
      </div>

      {error && <p className="bg-neutral-50 px-5 pb-1 text-sm text-rose-600">{error}</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
  );
}

// 로그인 계정 발급·관리 패널 — AccountModal(독립 모달)과 EditModal(수정 모달 내 섹션) 공용
function AccountPanel({
  employee,
  info,
  roles,
  onSaved,
}: {
  employee: EmployeeRow;
  info: AccountInfo | null;
  roles: { key: string; label: string }[];
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 발급 폼
  const [username, setUsername] = useState(employee.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("EMPLOYEE");
  // 관리 폼
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function issue() {
    setError(null);
    startTransition(async () => {
      const res = await issueEmployeeAccount(employee.id, username, password, role);
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  function changeRole(next: AppRole) {
    if (!info) return;
    startTransition(async () => {
      const res = await setEmployeeAccountRole(info.profileId, next);
      if (!res.ok) setError(res.error ?? "오류");
      else onSaved();
    });
  }

  function resetPw() {
    if (!info) return;
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await resetEmployeePassword(info.profileId, newPw);
      if (res.ok) {
        setMsg("비밀번호가 변경되었습니다");
        setNewPw("");
      } else setError(res.error ?? "오류");
    });
  }

  function revoke() {
    if (!info) return;
    if (!confirm("이 직원의 로그인 계정을 삭제할까요? (직원 정보는 유지)")) return;
    startTransition(async () => {
      const res = await revokeEmployeeAccount(info.profileId);
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  if (!info) {
    return (
      <div className="space-y-3">
        <Field label="아이디" required>
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} placeholder="로그인 아이디" />
        </Field>
        <Field label="비밀번호 (4자 이상)" required>
          <TextInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="임시 비밀번호" />
        </Field>
        <Field label="권한(등급)">
          <SelectInput value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </SelectInput>
        </Field>
        <p className="text-xs text-neutral-400">
          직원은 이 <b>아이디</b>와 비밀번호로 로그인합니다(이메일 불필요).
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end">
          <button
            onClick={issue}
            disabled={pending || !username.trim() || password.length < 4}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {pending ? "발급 중…" : "계정 발급"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        <span className="text-neutral-500">아이디</span>{" "}
        <span className="font-semibold">{info.username ?? "(이메일 로그인)"}</span>
      </div>
      <Field label="권한(등급)">
        <SelectInput value={info.role} disabled={pending} onChange={(e) => changeRole(e.target.value as AppRole)}>
          {!roles.some((r) => r.key === info.role) && <option value={info.role}>{info.role}</option>}
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </SelectInput>
      </Field>
      <div>
        <Field label="비밀번호 재설정 (4자 이상)">
          <div className="flex gap-2">
            <TextInput value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새 비밀번호" />
            <button
              onClick={resetPw}
              disabled={pending || newPw.length < 4}
              className="shrink-0 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              변경
            </button>
          </div>
        </Field>
        {msg && <p className="mt-1 text-xs text-emerald-600">{msg}</p>}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button onClick={revoke} disabled={pending} className="text-sm text-rose-500 hover:text-rose-700">
        계정 해제(삭제)
      </button>
    </div>
  );
}

function AccountModal({
  employee,
  info,
  roles,
  onClose,
  onSaved,
}: {
  employee: EmployeeRow;
  info: AccountInfo | null;
  roles: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-16 w-full max-w-sm rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">
            {employee.name} · 로그인 계정 {info ? "관리" : "발급"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
        <div className="p-5">
          <AccountPanel employee={employee} info={info} roles={roles} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
