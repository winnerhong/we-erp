"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, TextInput, SelectInput, Badge } from "@/components/ui";
import { PaybackList, type PaybackBrief } from "@/components/payback-list";
import { krw, LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL } from "@/lib/labels";
import type {
  EmployeeRow,
  PayrollRow,
  LeaveRequestRow,
  LeaveType,
  EmploymentCertificateRow,
  LaborContractRow,
  EmployeeDocumentRow,
  EmployeeEventRow,
} from "@/lib/supabase/database.types";
import { requestLeave, cancelMyLeave, updateMyInfo, issueMyCertificate } from "./actions";

type Tab = "info" | "pay" | "point" | "leave" | "docs" | "history";

export function MeClient({
  employee,
  companyName,
  payrolls,
  leaves,
  certs,
  contracts,
  docs,
  events,
  paybacks,
}: {
  employee: EmployeeRow;
  companyName: string | null;
  payrolls: PayrollRow[];
  leaves: LeaveRequestRow[];
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
  events: EmployeeEventRow[];
  paybacks: PaybackBrief[];
}) {
  const [tab, setTab] = useState<Tab>("info");
  const emp = employee;

  return (
    <div className="space-y-4">
      {/* 헤더 카드 */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-6 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 text-2xl font-bold text-neutral-500">
            {emp.name?.[0] ?? "?"}
          </div>
          <div>
            <h1 className="text-xl font-bold">{emp.name}</h1>
            <p className="mt-0.5 text-sm text-white/70">
              {companyName ?? "미배정"} · {emp.employment_type || "-"}
              {emp.status ? ` · ${emp.status}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {([
          ["info", "🧾 내 정보"],
          ["pay", "💰 급여 명세"],
          ["point", "⭐ 포인트"],
          ["leave", "🌴 휴가·연차"],
          ["docs", "📄 서류"],
          ["history", "📌 인사이력"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "info" && <InfoTab emp={emp} companyName={companyName} />}
      {tab === "pay" && <PayTab payrolls={payrolls} />}
      {tab === "point" && <PaybackList rows={paybacks} title="⭐ 포인트" term="포인트" />}
      {tab === "leave" && <LeaveTab emp={emp} leaves={leaves} />}
      {tab === "docs" && <DocsTab certs={certs} contracts={contracts} docs={docs} />}
      {tab === "history" && <HistoryTab events={events} />}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="font-semibold text-neutral-800">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
    </div>
  );
}

// ---------- 내 정보 ----------
function InfoTab({ emp, companyName }: { emp: EmployeeRow; companyName: string | null }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section
        title="🧾 기본 정보"
        action={
          <button onClick={() => setEditing(true)} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">
            수정
          </button>
        }
      >
        <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
          <Row label="이름">{emp.name}</Row>
          <Row label="소속">{companyName ?? "미배정"}</Row>
          <Row label="고용형태">{emp.employment_type || "-"}</Row>
          <Row label="입사일">{emp.hired_on || "-"}</Row>
          <Row label="연락처">{emp.phone || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="이메일">{emp.email || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="주소">{emp.address || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="비상연락처">
            {emp.emergency_contact ? `${emp.emergency_contact}${emp.emergency_relation ? ` (${emp.emergency_relation})` : ""}` : <span className="text-neutral-300">미등록</span>}
          </Row>
        </dl>
      </Section>

      <Section title="🏦 계좌 정보">
        <dl className="divide-y divide-neutral-50 px-5 py-1 text-sm">
          <Row label="은행명">{emp.bank_name || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="계좌번호">{emp.account_number || <span className="text-neutral-300">미등록</span>}</Row>
          <Row label="예금주">{emp.account_holder || <span className="text-neutral-300">미등록</span>}</Row>
        </dl>
        <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">급여 입금 계좌입니다. 바뀌면 ‘수정’으로 변경하세요.</p>
      </Section>

      {editing && <EditModal emp={emp} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditModal({ emp, onClose }: { emp: EmployeeRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    phone: emp.phone ?? "",
    email: emp.email ?? "",
    address: emp.address ?? "",
    emergency_contact: emp.emergency_contact ?? "",
    emergency_relation: emp.emergency_relation ?? "",
    bank_name: emp.bank_name ?? "",
    account_number: emp.account_number ?? "",
    account_holder: emp.account_holder ?? "",
  });
  function save() {
    startTransition(async () => {
      const res = await updateMyInfo(d);
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">내 정보 수정</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          <Field label="연락처"><TextInput value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="010-0000-0000" /></Field>
          <Field label="이메일"><TextInput value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="주소"><TextInput value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field></div>
          <Field label="비상연락처"><TextInput value={d.emergency_contact} onChange={(e) => setD({ ...d, emergency_contact: e.target.value })} /></Field>
          <Field label="비상연락 관계"><TextInput value={d.emergency_relation} onChange={(e) => setD({ ...d, emergency_relation: e.target.value })} placeholder="배우자·부모 등" /></Field>
          <Field label="은행명"><TextInput value={d.bank_name} onChange={(e) => setD({ ...d, bank_name: e.target.value })} /></Field>
          <Field label="계좌번호"><TextInput value={d.account_number} onChange={(e) => setD({ ...d, account_number: e.target.value })} /></Field>
          <Field label="예금주"><TextInput value={d.account_holder} onChange={(e) => setD({ ...d, account_holder: e.target.value })} /></Field>
        </div>
        {error && <p className="px-5 pb-1 text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 급여 명세 ----------
function PayTab({ payrolls }: { payrolls: PayrollRow[] }) {
  return (
    <Section title="💰 급여 명세">
      {payrolls.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">급여 내역이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-2">월</th>
                <th className="px-3 py-2 text-right">기본급</th>
                <th className="px-3 py-2 text-right">수당</th>
                <th className="px-3 py-2 text-right">공제</th>
                <th className="px-5 py-2 text-right">실수령</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {payrolls.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2 font-medium">{p.year_month}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(p.base_pay)}</td>
                  <td className="px-3 py-2 text-right tabular">{krw(p.allowance + p.nontax_allowance)}</td>
                  <td className="px-3 py-2 text-right tabular text-rose-600">−{krw(p.income_tax + p.insurance + p.other_deduction)}</td>
                  <td className="px-5 py-2 text-right tabular font-semibold">{krw(p.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-neutral-50 px-5 py-2 text-xs text-neutral-400">공제는 추정치가 포함될 수 있습니다. 정확한 내역은 관리자에게 문의하세요.</p>
    </Section>
  );
}

// ---------- 휴가·연차 ----------
function LeaveTab({ emp, leaves }: { emp: EmployeeRow; leaves: LeaveRequestRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({ leave_type: "ANNUAL" as LeaveType, start_date: "", end_date: "", reason: "" });

  const usedAnnual = leaves
    .filter((l) => l.status === "APPROVED" && (l.leave_type === "ANNUAL" || l.leave_type === "HALF_DAY"))
    .reduce((s, l) => s + (l.days ?? 0), 0);

  function daysBetween(a: string, b: string) {
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 1;
  }
  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestLeave({
        leave_type: d.leave_type,
        start_date: d.start_date,
        end_date: d.end_date,
        days: d.leave_type === "HALF_DAY" ? 0.5 : daysBetween(d.start_date, d.end_date),
        reason: d.reason || null,
      });
      if (res.ok) {
        setAdding(false);
        setD({ leave_type: "ANNUAL", start_date: "", end_date: "", reason: "" });
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }

  return (
    <Section
      title={`🌴 휴가·연차 (승인 사용 ${usedAnnual}일)`}
      action={
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={!emp.company_id}
          title={emp.company_id ? "" : "소속 사업자가 없어 신청할 수 없습니다"}
          className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          + 휴가 신청
        </button>
      }
    >
      {adding && (
        <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SelectInput value={d.leave_type} onChange={(e) => setD({ ...d, leave_type: e.target.value as LeaveType })}>
              {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </SelectInput>
            <TextInput type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })} />
            <TextInput type="date" value={d.end_date} onChange={(e) => setD({ ...d, end_date: e.target.value })} />
            <TextInput value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="사유" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            onClick={submit}
            disabled={pending || !d.start_date || !d.end_date}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            신청
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
                  <button
                    onClick={() => {
                      if (confirm("이 휴가 신청을 취소할까요?"))
                        startTransition(async () => {
                          await cancelMyLeave(l.id);
                          router.refresh();
                        });
                    }}
                    className="rounded-md px-1.5 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------- 서류 ----------
function DocsTab({
  certs,
  contracts,
  docs,
}: {
  certs: EmploymentCertificateRow[];
  contracts: LaborContractRow[];
  docs: EmployeeDocumentRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState({ purpose: "", submit_to: "", department: "", position: "" });
  const [error, setError] = useState<string | null>(null);

  function issue() {
    setError(null);
    startTransition(async () => {
      const res = await issueMyCertificate({
        purpose: form.purpose || null,
        submit_to: form.submit_to || null,
        department: form.department || null,
        position: form.position || null,
      });
      if (res.ok) {
        setIssuing(false);
        setForm({ purpose: "", submit_to: "", department: "", position: "" });
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="space-y-4">
      <Section
        title="📄 재직증명서"
        action={
          <button onClick={() => setIssuing((v) => !v)} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700">
            + 발급
          </button>
        }
      >
        {issuing && (
          <div className="space-y-2 border-b border-neutral-100 bg-neutral-50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="부서(선택)" />
              <TextInput value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="직위(선택)" />
              <TextInput value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="용도(선택)" />
              <TextInput value={form.submit_to} onChange={(e) => setForm({ ...form, submit_to: e.target.value })} placeholder="제출처(선택)" />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button onClick={issue} disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
              발급
            </button>
          </div>
        )}
        {certs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">발급 이력이 없습니다.</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {certs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{c.cert_no}</span>
                  <span className="ml-2 text-neutral-500">{c.issued_on}</span>
                  {c.purpose && <span className="ml-2 text-xs text-neutral-400">{c.purpose}</span>}
                </div>
                <Link href={`/cert/${c.id}`} target="_blank" className="text-xs text-indigo-600 underline">
                  보기/인쇄
                </Link>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="📝 내 근로계약서">
        {contracts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">등록된 계약서가 없습니다.</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {contracts.map((ct) => (
              <div key={ct.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{ct.contract_type || "근로계약"}</span>
                  <span className="ml-2 text-neutral-500">
                    {ct.start_date || "?"}
                    {ct.end_date ? ` ~ ${ct.end_date}` : ""}
                  </span>
                </span>
                {ct.file_url && (
                  <a href={ct.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    첨부보기
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🗂 내 서류함">
        {docs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">등록된 서류가 없습니다.</p>
        ) : (
          <div className="divide-y divide-neutral-50">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{d.doc_type || "서류"}</span>
                  <span className="ml-2 font-medium">{d.title || "-"}</span>
                </span>
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">
                    보기
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------- 인사이력 ----------
function HistoryTab({ events }: { events: EmployeeEventRow[] }) {
  return (
    <Section title="📌 인사 발령·변동 이력">
      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutral-400">등록된 인사 이력이 없습니다.</p>
      ) : (
        <div className="divide-y divide-neutral-50">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
              <span className="text-neutral-500">{ev.event_date || "-"}</span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{ev.event_type || "-"}</span>
              {ev.title && <span className="font-medium">{ev.title}</span>}
              {ev.detail && <span className="text-xs text-neutral-400">{ev.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
