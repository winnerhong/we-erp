"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InlineSelect } from "@/components/inline-select";
import { OptionsManager } from "@/components/options-manager";
import { BulkImport } from "@/components/bulk-import";
import { Field, TextInput, SelectInput, Badge, FormSection } from "@/components/ui";
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
} from "@/lib/supabase/database.types";
import type { ImportCtx } from "@/lib/import-specs";
import { createRow, updateRow, deleteRow } from "@/app/(erp)/actions";
import {
  createCertificate,
  deleteCertificate,
  createLeave,
  reviewLeave,
  deleteLeave,
  createContract,
  deleteContract,
  createDocument,
  deleteDocument,
  createEvent,
  deleteEvent,
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
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
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

type TabKey = "info" | "work" | "pay" | "leave" | "docs" | "history";

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
  initialSelectedId?: string | null;
  initialTab?: string | null;
}) {
  const router = useRouter();
  const [mgrOpen, setMgrOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [acctFor, setAcctFor] = useState<EmployeeRow | null>(null);
  const [editFor, setEditFor] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState("");
  const TAB_KEYS: TabKey[] = ["info", "work", "pay", "leave", "docs", "history"];
  const [tab, setTab] = useState<TabKey>(
    initialTab && (TAB_KEYS as string[]).includes(initialTab) ? (initialTab as TabKey) : "info"
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? rows[0]?.id ?? null);

  const companyName = new Map(ctx.companies.map((c) => [c.id, c.name]));
  const optsOf = (cat: string) => options.filter((o) => o.category === cat && o.is_active);
  const labelOf = (cat: string) =>
    Object.fromEntries(options.filter((o) => o.category === cat).map((o) => [o.value, o.label]));
  const colorOf = (cat: string): Record<string, string> =>
    Object.fromEntries(options.filter((o) => o.category === cat).map((o) => [o.value, o.color ?? ""]));
  const empSel = optsOf("employment_type").map((o) => ({ value: o.value, label: o.label }));
  const roleSel = optsOf("role").map((o) => ({ value: o.value, label: o.label }));
  const statusSel = optsOf("employee_status").map((o) => ({ value: o.value, label: o.label }));
  const empLabel = labelOf("employment_type");
  const roleLabel = labelOf("role");
  const statusLabel = labelOf("employee_status");
  const statusColor = colorOf("employee_status");
  const empColor = colorOf("employment_type");

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    !q
      ? true
      : `${r.name} ${r.nickname ?? ""} ${r.phone ?? ""} ${accounts[r.id]?.username ?? ""} ${
          companyName.get(r.company_id ?? "") ?? ""
        }`
          .toLowerCase()
          .includes(q)
  );
  const selected = rows.find((r) => r.id === selectedId) ?? filtered[0] ?? rows[0] ?? null;

  const refresh = () => router.refresh();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">직원 관리</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setMgrOpen(true)}
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
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            ＋ 직원 등록
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* 좌측 목록 */}
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 이름·닉네임·연락처·아이디"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <p className="mt-2 px-1 text-xs text-neutral-400">직원 {filtered.length}명</p>
          </div>
          <div className="max-h-[70vh] divide-y divide-neutral-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-400">직원이 없습니다.</p>
            ) : (
              filtered.map((r) => {
                const on = selected?.id === r.id;
                const acc = accounts[r.id];
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                      on ? "bg-indigo-50" : "hover:bg-neutral-50"
                    }`}
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
            {/* 헤더 카드 */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-6 text-white shadow-sm">
              <div className="flex flex-wrap items-start gap-4">
                <AvatarUpload emp={selected} onChanged={refresh} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    {selected.nickname && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{selected.nickname}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-white/70">
                    {companyName.get(selected.company_id ?? "") ?? "미배정"} ·{" "}
                    {empLabel[selected.employment_type] ?? selected.employment_type}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
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
                    <HeaderField label="입사일" value={selected.hired_on || "-"} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <HeaderBtn onClick={() => setEditFor(selected)}>✏️ 수정</HeaderBtn>
                <HeaderBtn onClick={() => setAcctFor(selected)}>🔑 계정·비번</HeaderBtn>
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
                ["work", "📋 근로조건·4대보험"],
                ["pay", "💰 급여·퇴직정산"],
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
                empColor={empColor}
                onEdit={() => setEditFor(selected)}
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
              />
            )}
            {tab === "history" && (
              <HistoryTab emp={selected} events={eventsByEmp[selected.id] ?? []} onChanged={refresh} />
            )}
          </div>
        )}
      </div>

      {mgrOpen && (
        <OptionsManager
          options={options}
          cats={[
            { key: "employment_type", title: "고용형태", hint: "정규직·시급제·일일알바 등" },
            { key: "role", title: "권한", hint: "직원·부서장·관리자 등" },
            { key: "employee_status", title: "상태", hint: "재직·휴직·퇴사·계약종료 등" },
          ]}
          onClose={() => {
            setMgrOpen(false);
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
        className={`group/av relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-2xl ring-2 ring-white/40 ${
          drag ? "opacity-70 ring-white" : ""
        }`}
      >
        {emp.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/90 text-2xl font-bold text-neutral-500">
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
  empColor,
  onEdit,
}: {
  emp: EmployeeRow;
  ctx: ImportCtx;
  empSel: { value: string; label: string }[];
  roleSel: { value: string; label: string }[];
  statusSel: { value: string; label: string }[];
  empLabel: Record<string, string>;
  roleLabel: Record<string, string>;
  statusLabel: Record<string, string>;
  empColor: Record<string, string>;
  onEdit: () => void;
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
          <Row label="소속">
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
          <Row label="고용형태">
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="employment_type"
              value={emp.employment_type}
              options={withCurrent(empSel, empLabel, emp.employment_type)}
              tone={toneClass(empColor[emp.employment_type])}
            />
          </Row>
          <Row label="권한">
            <InlineSelect
              kind="employees"
              id={emp.id}
              field="role"
              value={emp.role}
              options={withCurrent(roleSel, roleLabel, emp.role)}
            />
          </Row>
          <Row label="상태">
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
    </div>
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
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
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
}: {
  emp: EmployeeRow;
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
  empLabel: Record<string, string>;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({ position: "", department: "", purpose: "", submit_to: "" });

  // 근로계약서 추가 폼
  const [cAdding, setCAdding] = useState(false);
  const [c, setC] = useState({
    contract_type: "",
    start_date: "",
    end_date: "",
    wage_type: "MONTHLY",
    wage_amount: "",
    signed_on: "",
    file_url: "",
    memo: "",
  });

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

  function addContract() {
    startTransition(async () => {
      await createContract({
        company_id: emp.company_id ?? undefined,
        employee_id: emp.id,
        contract_type: c.contract_type || null,
        start_date: c.start_date || null,
        end_date: c.end_date || null,
        wage_type: c.wage_type,
        wage_amount: c.wage_amount ? Number(c.wage_amount.replace(/[^\d.-]/g, "")) : null,
        signed_on: c.signed_on || null,
        file_url: c.file_url || null,
        memo: c.memo || null,
      });
      setCAdding(false);
      setC({ contract_type: "", start_date: "", end_date: "", wage_type: "MONTHLY", wage_amount: "", signed_on: "", file_url: "", memo: "" });
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
      {/* 근로계약서 */}
      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">
            📝 근로계약서 <span className="ml-1 text-xs font-normal text-neutral-400">{contracts.length}건</span>
          </h3>
          <button onClick={() => setCAdding((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">
            + 계약서 등록
          </button>
        </div>
        {cAdding && (
          <div className="grid grid-cols-2 gap-2 border-b border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-3">
            <TextInput value={c.contract_type} onChange={(e) => setC({ ...c, contract_type: e.target.value })} placeholder="계약형태(정규/계약/시급)" />
            <SelectInput value={c.wage_type} onChange={(e) => setC({ ...c, wage_type: e.target.value })}>
              <option value="MONTHLY">월급</option>
              <option value="HOURLY">시급</option>
            </SelectInput>
            <TextInput inputMode="numeric" value={c.wage_amount} onChange={(e) => setC({ ...c, wage_amount: e.target.value })} placeholder="임금액" />
            <label className="text-xs text-neutral-500">시작일<TextInput type="date" value={c.start_date} onChange={(e) => setC({ ...c, start_date: e.target.value })} /></label>
            <label className="text-xs text-neutral-500">종료일(계약직)<TextInput type="date" value={c.end_date} onChange={(e) => setC({ ...c, end_date: e.target.value })} /></label>
            <label className="text-xs text-neutral-500">서명일<TextInput type="date" value={c.signed_on} onChange={(e) => setC({ ...c, signed_on: e.target.value })} /></label>
            <div className="col-span-2 sm:col-span-3">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const url = await fileToDataUrl(f);
                    if (url) setC((p) => ({ ...p, file_url: url }));
                  }
                }}
                className="text-xs"
              />
              {c.file_url && <span className="ml-2 text-xs text-emerald-600">첨부됨 ✓</span>}
            </div>
            <div className="col-span-2 flex gap-2 sm:col-span-3">
              <TextInput value={c.memo} onChange={(e) => setC({ ...c, memo: e.target.value })} placeholder="메모" />
              <button onClick={addContract} disabled={pending} className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
                저장
              </button>
            </div>
          </div>
        )}
        {contracts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">등록된 근로계약서가 없습니다. (미작성 시 과태료 대상)</p>
        ) : (
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
        )}
      </section>

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
              <button onClick={issue} disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
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
              🗂 증빙 서류함 <span className="ml-1 text-xs font-normal text-neutral-400">{docs.length}건</span>
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
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const url = await fileToDataUrl(f);
                    if (url) setDoc((p) => ({ ...p, file_url: url }));
                  }
                }}
                className="text-xs"
              />
              {doc.file_url && <span className="ml-2 text-xs text-emerald-600">첨부됨 ✓</span>}
              <div className="text-right">
                <button onClick={addDoc} disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
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
function HistoryTab({ emp, events, onChanged }: { emp: EmployeeRow; events: EmployeeEventRow[]; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [memo, setMemo] = useState(emp.memo ?? "");
  const [adding, setAdding] = useState(false);
  const [e, setE] = useState({ event_date: "", event_type: "발령", title: "", detail: "" });

  function saveMemo() {
    startTransition(async () => {
      await updateRow("employees", emp.id, { memo: memo.trim() || null });
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
            <button onClick={addEvent} disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
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
        <div className="border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">📝 메모</h3>
        </div>
        <div className="space-y-2 p-5">
          <textarea
            value={memo}
            onChange={(ev) => setMemo(ev.target.value)}
            rows={6}
            placeholder="이 직원에 대한 메모…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <div className="text-right">
            <button
              onClick={saveMemo}
              disabled={pending || memo === (emp.memo ?? "")}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              메모 저장
            </button>
          </div>
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
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  emp?: EmployeeRow;
  ctx: ImportCtx;
  empSel: { value: string; label: string }[];
  roleSel: { value: string; label: string }[];
  statusSel: { value: string; label: string }[];
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
        </FormSection>

        {/* 2. 급여·계좌 */}
        <FormSection no={2} title="급여 · 계좌">
          <Field label="입사일"><TextInput type="date" value={d.hired_on} onChange={(e) => setD({ ...d, hired_on: e.target.value })} /></Field>
          <div />
          <Field label="기본급 (월, 원)"><TextInput inputMode="numeric" value={d.base_salary} onChange={(e) => setD({ ...d, base_salary: e.target.value })} placeholder="2,800,000" /></Field>
          <Field label="시급 (원)"><TextInput inputMode="numeric" value={d.hourly_wage} onChange={(e) => setD({ ...d, hourly_wage: e.target.value })} placeholder="12,000" /></Field>
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
          <Field label="부양가족 수 (본인 포함)"><TextInput inputMode="numeric" value={d.dependents} onChange={(e) => setD({ ...d, dependents: e.target.value })} placeholder="1" /></Field>
          <Field label="20세 이하 자녀 수"><TextInput inputMode="numeric" value={d.children_under20} onChange={(e) => setD({ ...d, children_under20: e.target.value })} placeholder="0" /></Field>
        </FormSection>

        {/* 4. 근로조건 */}
        <FormSection no={4} title="근로조건">
          <Field label="주 소정근로시간 (h)"><TextInput inputMode="numeric" value={d.weekly_hours} onChange={(e) => setD({ ...d, weekly_hours: e.target.value })} placeholder="40" /></Field>
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
      </div>

      {error && <p className="bg-neutral-50 px-5 pb-1 text-sm text-rose-600">{error}</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </Modal>
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 발급 폼
  const [username, setUsername] = useState(employee.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("MEMBER");
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

        {!info ? (
          <div className="space-y-3 p-5">
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
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-lg bg-neutral-50 p-3 text-sm">
              <span className="text-neutral-500">아이디</span>{" "}
              <span className="font-semibold">{info.username ?? "(이메일 로그인)"}</span>
            </div>
            <Field label="권한(등급)">
              <SelectInput
                value={info.role}
                disabled={pending}
                onChange={(e) => changeRole(e.target.value as AppRole)}
              >
                {!roles.some((r) => r.key === info.role) && (
                  <option value={info.role}>{info.role}</option>
                )}
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
                    className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
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
        )}

        {!info && (
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
            <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
              취소
            </button>
            <button
              onClick={issue}
              disabled={pending}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "발급 중…" : "계정 발급"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
