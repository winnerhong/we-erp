"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Field, TextInput, NumberInput, SelectInput, EmptyState, Badge } from "@/components/ui";
import { OptionsManager } from "@/components/options-manager";
import { LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL, krw } from "@/lib/labels";
import { estimateInsurance, computeNet, fullInsurance, freelanceWithholding } from "@/lib/payroll";
import { buildCSV } from "@/lib/csv";
import type {
  EmployeeRow,
  LeaveRequestRow,
  LeaveType,
  LeaveStatus,
  PayrollRow,
  EmploymentCertificateRow,
  PaybackRow,
  FieldOptionRow,
} from "@/lib/supabase/database.types";
import type { LeaveBalance } from "./page";
import {
  createLeave,
  reviewLeave,
  deleteLeave,
  savePayroll,
  deletePayroll,
  generatePayrolls,
  createCertificate,
  deleteCertificate,
} from "./actions";

const leaveTypeOptions = Object.entries(LEAVE_TYPE_LABEL) as [LeaveType, string][];

interface Props {
  employees: EmployeeRow[];
  balances: LeaveBalance[];
  leaves: LeaveRequestRow[];
  payrolls: PayrollRow[];
  certificates: EmploymentCertificateRow[];
  paybacks: PaybackRow[];
  nontaxItems: FieldOptionRow[];
  month: string;
  activeCompanyId: string | null;
}

export function HrClient(props: Props) {
  const [tab, setTab] = useState<"payroll" | "insurance" | "leave" | "cert">("payroll");

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-neutral-900">급여·인사</h1>
        <p className="mt-1 text-sm text-neutral-500">연차 자동발생·휴가 승인과 월별 급여대장. (공제는 추정치 — 검수 필요)</p>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
        {([
          ["payroll", "급여"],
          ["insurance", "4대보험·세금"],
          ["leave", "휴가·연차"],
          ["cert", "재직증명서"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-white shadow-sm" : "text-neutral-500"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "leave" ? (
        <LeaveTab {...props} />
      ) : tab === "payroll" ? (
        <PayrollTab {...props} />
      ) : tab === "insurance" ? (
        <InsuranceTab {...props} />
      ) : (
        <CertificateTab {...props} />
      )}
    </div>
  );
}

// ============ 4대보험·세금 (빠른 계산기 + 월별 집계) ============
function InsuranceTab({ payrolls, paybacks, month }: Props) {
  // ----- 빠른 계산기 -----
  const [mode, setMode] = useState<"REGULAR" | "FREELANCE">("REGULAR");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(3.3);
  const [industrial, setIndustrial] = useState("0.7");
  const amt = Number(amount.replace(/[^\d.]/g, "")) || 0;

  const fi = fullInsurance(amt, Number(industrial.replace(/[^\d.]/g, "")) || 0);
  const empTotal = fi.worker.total; // 근로자 공제 합계
  const erTotal = fi.employer.total; // 사업주 부담 합계
  const netRegular = amt - empTotal; // 소득세 제외 전(간이세액 미반영) — 근사
  const companyCost = amt + erTotal; // 회사 총부담

  const wh = freelanceWithholding(amt, rate);

  // ----- 월별 집계 -----
  const taxable = (p: PayrollRow) => p.base_pay + p.allowance; // 과세 보수(비과세 제외)
  const sumWorkerIns = payrolls.reduce((s, p) => s + p.insurance, 0);
  const sumEmployerIns = payrolls.reduce((s, p) => s + fullInsurance(taxable(p)).employer.total, 0);
  const sumGrossPay = payrolls.reduce((s, p) => s + p.base_pay + p.allowance + p.nontax_allowance, 0);
  const sumNetPay = payrolls.reduce((s, p) => s + p.net_pay, 0);
  const companyTotalCost = sumGrossPay + sumEmployerIns;

  const pbGross = paybacks.reduce((s, p) => s + p.gross_amount, 0);
  const pbTax = paybacks.reduce((s, p) => s + p.tax_amount, 0);
  const pbNet = paybacks.reduce((s, p) => s + p.net_amount, 0);

  return (
    <div className="space-y-6">
      {/* 빠른 계산기 */}
      <Card>
        <div className="border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">🧮 빠른 계산기</h3>
          <p className="text-xs text-neutral-400">금액을 넣으면 4대보험·원천징수가 자동 분해됩니다 (추정치).</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-lg bg-neutral-100 p-1 text-sm">
              {([
                ["REGULAR", "정규직(4대보험)"],
                ["FREELANCE", "프리랜서·기타소득"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`rounded-md px-3 py-1.5 font-medium ${mode === k ? "bg-white shadow-sm" : "text-neutral-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Field label="금액(월급/지급액)">
              <NumberInput value={amount} onChange={(v) => setAmount(v)} placeholder="2,800,000" />
            </Field>
            {mode === "REGULAR" ? (
              <Field label="산재요율(%)">
                <TextInput inputMode="decimal" value={industrial} onChange={(e) => setIndustrial(e.target.value)} placeholder="0.7" />
              </Field>
            ) : (
              <Field label="원천징수율(%)">
                <div className="flex items-center gap-1">
                  {[3.3, 8.8, 10, 13.3].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r)}
                      className={`rounded-md px-2 py-1.5 text-xs ${rate === r ? "bg-indigo-500 text-white" : "border border-neutral-300 hover:bg-neutral-50"}`}
                    >
                      {r}%
                    </button>
                  ))}
                  <input
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                    className="w-16 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  />
                </div>
              </Field>
            )}
          </div>

          {mode === "REGULAR" ? (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
                  <tr>
                    <th className="px-4 py-2">항목</th>
                    <th className="px-3 py-2 text-right">근로자 부담</th>
                    <th className="px-4 py-2 text-right">사업주 부담</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  <InsRow label="국민연금" w={fi.worker.pension} e={fi.employer.pension} />
                  <InsRow label="건강보험" w={fi.worker.health} e={fi.employer.health} />
                  <InsRow label="장기요양" w={fi.worker.care} e={fi.employer.care} />
                  <InsRow label="고용보험" w={fi.worker.employment} e={fi.employer.employment} />
                  <InsRow label="산재보험" w={0} e={fi.employer.industrial} />
                </tbody>
                <tfoot className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2">합계</td>
                    <td className="px-3 py-2 text-right tabular text-rose-600">−{krw(empTotal)}</td>
                    <td className="px-4 py-2 text-right tabular text-blue-600">{krw(erTotal)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 p-4 sm:grid-cols-3">
                <Mini label="실수령액(4대보험 공제 후)" value={krw(netRegular)} hint="소득세 별도(간이세액 미반영)" />
                <Mini label="회사 총부담" value={krw(companyCost)} hint="급여 + 사업주 4대보험" tone="blue" />
                <Mini label="근로자 공제" value={krw(empTotal)} hint="4대보험 근로자분" tone="rose" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-4">
              <Mini label="지급총액" value={krw(wh.gross)} />
              <Mini label="소득세" value={krw(wh.income)} tone="rose" />
              <Mini label="지방소득세" value={krw(wh.local)} tone="rose" hint="소득세 × 10%" />
              <Mini label="실지급액" value={krw(wh.net)} tone="blue" hint={`원천징수 ${rate}% 제외`} />
            </div>
          )}
        </div>
      </Card>

      {/* 월별 집계 */}
      <Card>
        <div className="border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">📊 {month} 집계</h3>
          <p className="text-xs text-neutral-400">이번달 급여대장·지급완료 페이백 기준 (추정치).</p>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-600">직원 급여 ({payrolls.length}명)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="급여 총액" value={krw(sumGrossPay)} />
              <Mini label="근로자 4대보험" value={krw(sumWorkerIns)} tone="rose" hint="급여서 공제" />
              <Mini label="사업주 4대보험" value={krw(sumEmployerIns)} tone="blue" hint="회사 추가 부담" />
              <Mini label="회사 총 인건비" value={krw(companyTotalCost)} tone="blue" hint="급여 + 사업주분" />
            </div>
            <p className="mt-1 text-xs text-neutral-400">실지급(직원) 합계 {krw(sumNetPay)}</p>
          </div>
          <div className="border-t border-neutral-100 pt-4">
            <p className="mb-2 text-sm font-medium text-neutral-600">프리랜서·페이백 원천징수 ({paybacks.length}건)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Mini label="지급총액" value={krw(pbGross)} />
              <Mini label="원천징수 제외" value={krw(pbTax)} tone="rose" hint="소득세+지방세" />
              <Mini label="실지급액" value={krw(pbNet)} tone="blue" />
            </div>
          </div>
        </div>
      </Card>

      <p className="text-xs text-neutral-400">
        ※ 요율은 2026년 근사값입니다. 국민연금 상·하한, 정산, 간이세액표는 미반영된 추정치이므로 실제 신고 전 검수하세요.
      </p>
    </div>
  );
}

function InsRow({ label, w, e }: { label: string; w: number; e: number }) {
  return (
    <tr>
      <td className="px-4 py-2 text-neutral-700">{label}</td>
      <td className="px-3 py-2 text-right tabular">{w ? krw(w) : <span className="text-neutral-300">-</span>}</td>
      <td className="px-4 py-2 text-right tabular">{e ? krw(e) : <span className="text-neutral-300">-</span>}</td>
    </tr>
  );
}

function Mini({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "rose" | "blue" }) {
  const c = tone === "rose" ? "text-rose-600" : tone === "blue" ? "text-blue-600" : "text-neutral-900";
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-base font-bold ${c}`}>{value}</p>
      {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

// ============ 재직증명서 ============
function CertificateTab({ employees, certificates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  function remove(id: string) {
    if (!confirm("이 발급 이력을 삭제할까요?")) return;
    startTransition(async () => {
      await deleteCertificate(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setAdding(true)}
          disabled={employees.length === 0}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          + 재직증명서 발급
        </button>
      </div>

      <Card>
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">발급 이력</div>
        {certificates.length === 0 ? (
          <EmptyState message="발급한 재직증명서가 없습니다. ‘+ 재직증명서 발급’으로 시작하세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2">발급번호</th>
                  <th className="px-4 py-2">성명</th>
                  <th className="px-4 py-2">직위/부서</th>
                  <th className="px-4 py-2">발급일</th>
                  <th className="px-4 py-2">용도</th>
                  <th className="px-4 py-2 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {certificates.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 tabular text-neutral-500">{c.cert_no}</td>
                    <td className="px-4 py-2 font-medium">{c.employee_name}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {[c.position, c.department].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{c.issued_on}</td>
                    <td className="px-4 py-2 text-neutral-500">{c.purpose ?? "-"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <a
                        href={`/cert/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-blue-600 hover:text-blue-800"
                      >
                        인쇄/보기
                      </a>
                      <button onClick={() => remove(c.id)} disabled={pending} className="text-red-500 hover:text-red-700">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding && (
        <CertModal
          employees={employees}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CertModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: EmployeeRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = employees[0];
  const [d, setD] = useState({
    employee_id: first?.id ?? "",
    birth: "",
    address: "",
    department: "",
    position: "",
    employment_type: first?.employment_type ?? "",
    hired_on: first?.hired_on ?? "",
    purpose: "제출용",
    submit_to: "",
  });

  function onPickEmployee(id: string) {
    const e = employees.find((x) => x.id === id);
    setD((prev) => ({
      ...prev,
      employee_id: id,
      employment_type: e?.employment_type ?? prev.employment_type,
      hired_on: e?.hired_on ?? prev.hired_on,
    }));
  }

  function save() {
    setError(null);
    const emp = employees.find((e) => e.id === d.employee_id);
    if (!emp) {
      setError("직원을 선택하세요");
      return;
    }
    if (!emp.company_id) {
      setError("소속 사업자가 없는 직원입니다. 직원 화면에서 소속을 먼저 지정하세요.");
      return;
    }
    startTransition(async () => {
      const res = await createCertificate({
        company_id: emp.company_id!,
        employee_id: emp.id,
        employee_name: emp.name,
        birth: d.birth.trim() || null,
        address: d.address.trim() || null,
        department: d.department.trim() || null,
        position: d.position.trim() || null,
        employment_type: d.employment_type.trim() || null,
        hired_on: d.hired_on || null,
        purpose: d.purpose.trim() || null,
        submit_to: d.submit_to.trim() || null,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title="재직증명서 발급" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="직원">
            <SelectInput value={d.employee_id} onChange={(e) => onPickEmployee(e.target.value)}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        <Field label="생년월일/주민번호"><TextInput value={d.birth} onChange={(e) => setD({ ...d, birth: e.target.value })} placeholder="1990-01-01" /></Field>
        <Field label="입사일"><TextInput type="date" value={d.hired_on} onChange={(e) => setD({ ...d, hired_on: e.target.value })} /></Field>
        <Field label="직위"><TextInput value={d.position} onChange={(e) => setD({ ...d, position: e.target.value })} placeholder="대리" /></Field>
        <Field label="부서"><TextInput value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} placeholder="영업부" /></Field>
        <Field label="고용형태"><TextInput value={d.employment_type} onChange={(e) => setD({ ...d, employment_type: e.target.value })} /></Field>
        <Field label="용도"><TextInput value={d.purpose} onChange={(e) => setD({ ...d, purpose: e.target.value })} placeholder="은행 제출용 등" /></Field>
        <div className="col-span-2">
          <Field label="주소"><TextInput value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        </div>
        <div className="col-span-2">
          <Field label="제출처"><TextInput value={d.submit_to} onChange={(e) => setD({ ...d, submit_to: e.target.value })} placeholder="○○은행" /></Field>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ModalFooter onClose={onClose} onSave={save} pending={pending} />
    </Modal>
  );
}

// ============ 휴가·연차 ============
function LeaveTab({ employees, balances, leaves }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const empName = new Map(employees.map((e) => [e.id, e.name]));

  function review(id: string, status: LeaveStatus) {
    startTransition(async () => {
      await reviewLeave(id, status);
      router.refresh();
    });
  }
  function remove(id: string) {
    if (!confirm("삭제할까요?")) return;
    startTransition(async () => {
      await deleteLeave(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setAdding(true)}
          disabled={employees.length === 0}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          + 휴가 신청
        </button>
      </div>

      <Card>
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">연차 현황 (올해)</div>
        {balances.length === 0 ? (
          <EmptyState message="직원이 없습니다. 직원 메뉴에서 먼저 등록하세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2">직원</th>
                  <th className="px-4 py-2">입사일</th>
                  <th className="px-4 py-2 text-right">발생</th>
                  <th className="px-4 py-2 text-right">사용</th>
                  <th className="px-4 py-2 text-right">잔여</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {balances.map((b) => (
                  <tr key={b.employee.id}>
                    <td className="px-4 py-2 font-medium">{b.employee.name}</td>
                    <td className="px-4 py-2 text-neutral-500">{b.employee.hired_on ?? "-"}</td>
                    <td className="px-4 py-2 text-right tabular">{b.accrued}일</td>
                    <td className="px-4 py-2 text-right tabular">{b.used}일</td>
                    <td className={`px-4 py-2 text-right tabular font-semibold ${b.remaining < 0 ? "text-red-600" : ""}`}>
                      {b.remaining}일
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">휴가 신청 내역</div>
        {leaves.length === 0 ? (
          <EmptyState message="휴가 신청이 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2">직원</th>
                  <th className="px-4 py-2">종류</th>
                  <th className="px-4 py-2">기간</th>
                  <th className="px-4 py-2 text-right">일수</th>
                  <th className="px-4 py-2">상태</th>
                  <th className="px-4 py-2 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {leaves.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-medium">{empName.get(l.employee_id) ?? "?"}</td>
                    <td className="px-4 py-2">{LEAVE_TYPE_LABEL[l.leave_type]}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {l.start_date}{l.end_date !== l.start_date && ` ~ ${l.end_date}`}
                    </td>
                    <td className="px-4 py-2 text-right tabular">{l.days}일</td>
                    <td className="px-4 py-2">
                      <Badge tone={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "neutral"}>
                        {LEAVE_STATUS_LABEL[l.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.status === "PENDING" && (
                        <>
                          <button onClick={() => review(l.id, "APPROVED")} disabled={pending} className="mr-2 text-blue-600 hover:text-blue-800">승인</button>
                          <button onClick={() => review(l.id, "REJECTED")} disabled={pending} className="mr-2 text-neutral-500 hover:text-neutral-700">반려</button>
                        </>
                      )}
                      <button onClick={() => remove(l.id)} disabled={pending} className="text-red-500 hover:text-red-700">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding && (
        <LeaveModal
          employees={employees}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function dayDiff(a: string, b: string): number {
  const d1 = new Date(a + "T00:00:00").getTime();
  const d2 = new Date(b + "T00:00:00").getTime();
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
  return Math.round((d2 - d1) / 86400000) + 1;
}

function LeaveModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: EmployeeRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    employee_id: employees[0]?.id ?? "",
    leave_type: "ANNUAL" as LeaveType,
    start_date: "",
    end_date: "",
    days: "1",
    reason: "",
  });

  function recalcDays(next: typeof d) {
    if (next.leave_type === "HALF_DAY") return "0.5";
    if (next.start_date && next.end_date) return String(dayDiff(next.start_date, next.end_date));
    return next.days;
  }

  function save() {
    setError(null);
    const emp = employees.find((e) => e.id === d.employee_id);
    if (!emp) {
      setError("직원을 선택하세요");
      return;
    }
    if (!d.start_date || !d.end_date) {
      setError("기간을 입력하세요");
      return;
    }
    if (!emp.company_id) {
      setError("소속 사업자가 없는 직원입니다. 직원 화면에서 소속을 먼저 지정하세요.");
      return;
    }
    const companyId = emp.company_id;
    startTransition(async () => {
      const res = await createLeave({
        company_id: companyId,
        employee_id: emp.id,
        leave_type: d.leave_type,
        start_date: d.start_date,
        end_date: d.end_date,
        days: Number(d.days) || 1,
        reason: d.reason.trim() || null,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <Modal title="휴가 신청" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="직원">
            <SelectInput value={d.employee_id} onChange={(e) => setD({ ...d, employee_id: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </SelectInput>
          </Field>
        </div>
        <Field label="종류">
          <SelectInput
            value={d.leave_type}
            onChange={(e) => {
              const next = { ...d, leave_type: e.target.value as LeaveType };
              setD({ ...next, days: recalcDays(next) });
            }}
          >
            {leaveTypeOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectInput>
        </Field>
        <Field label="일수"><TextInput inputMode="decimal" value={d.days} onChange={(e) => setD({ ...d, days: e.target.value })} /></Field>
        <Field label="시작일">
          <TextInput type="date" value={d.start_date} onChange={(e) => {
            const next = { ...d, start_date: e.target.value, end_date: d.end_date || e.target.value };
            setD({ ...next, days: recalcDays(next) });
          }} />
        </Field>
        <Field label="종료일">
          <TextInput type="date" value={d.end_date} onChange={(e) => {
            const next = { ...d, end_date: e.target.value };
            setD({ ...next, days: recalcDays(next) });
          }} />
        </Field>
        <div className="col-span-2">
          <Field label="사유"><TextInput value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ModalFooter onClose={onClose} onSave={save} pending={pending} />
    </Modal>
  );
}

// ============ 급여 ============
function PayrollTab({ employees, payrolls, nontaxItems, month, activeCompanyId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [nontaxMgr, setNontaxMgr] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const empName = new Map(employees.map((e) => [e.id, e.name]));

  function generate() {
    if (!activeCompanyId) {
      setMsg("자동 생성은 특정 사업자 선택 후 가능합니다.");
      return;
    }
    startTransition(async () => {
      const res = await generatePayrolls(activeCompanyId, month);
      setMsg(res.ok ? `${res.created}건 생성됨` : `오류: ${res.error}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("삭제할까요?")) return;
    startTransition(async () => {
      await deletePayroll(id);
      router.refresh();
    });
  }

  function exportCsv() {
    const headers = ["직원", "기본급", "과세수당", "비과세수당", "소득세", "4대보험", "기타공제", "실지급액"];
    const rows = payrolls.map((p) => [
      empName.get(p.employee_id) ?? "",
      String(p.base_pay), String(p.allowance), String(p.nontax_allowance),
      String(p.income_tax), String(p.insurance), String(p.other_deduction), String(p.net_pay),
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `급여대장_${month}.csv`;
    a.click();
  }

  const totalNet = payrolls.reduce((s, p) => s + p.net_pay, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => router.push(`/hr?m=${e.target.value}`)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button onClick={() => setNontaxMgr(true)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">⚙ 비과세 항목</button>
          <button onClick={generate} disabled={pending} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">급여대장 자동 생성</button>
          <button onClick={exportCsv} disabled={payrolls.length === 0} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">CSV 내보내기</button>
        </div>
      </div>
      {msg && <p className="text-sm text-neutral-500">{msg}</p>}

      <Card>
        {payrolls.length === 0 ? (
          <EmptyState message={`${month} 급여 내역이 없습니다. ‘급여대장 자동 생성’으로 만드세요.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2 text-right">기본급</th>
                  <th className="px-3 py-2 text-right">과세수당</th>
                  <th className="px-3 py-2 text-right">비과세</th>
                  <th className="px-3 py-2 text-right">소득세</th>
                  <th className="px-3 py-2 text-right">4대보험</th>
                  <th className="px-3 py-2 text-right">기타공제</th>
                  <th className="px-3 py-2 text-right">실지급</th>
                  <th className="px-3 py-2 text-right">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {payrolls.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/employees?e=${p.employee_id}&tab=pay`}
                        className="text-neutral-900 underline-offset-2 hover:text-indigo-600 hover:underline"
                        title="직원 급여·퇴직정산으로 이동"
                      >
                        {empName.get(p.employee_id) ?? "?"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{p.base_pay.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{p.allowance.toLocaleString()}</td>
                    <td
                      className="px-3 py-2 text-right"
                      title={
                        p.nontax_items && Object.keys(p.nontax_items).length
                          ? Object.entries(p.nontax_items)
                              .map(([k, v]) => `${k}: ${Number(v).toLocaleString()}`)
                              .join(" · ")
                          : ""
                      }
                    >
                      {p.nontax_allowance.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">{p.income_tax.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{p.insurance.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{p.other_deduction.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.net_pay.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(p)} className="mr-2 text-neutral-600 hover:text-neutral-900">수정</button>
                      <button onClick={() => remove(p.id)} disabled={pending} className="text-red-500 hover:text-red-700">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={7}>실지급 합계 ({payrolls.length}명)</td>
                  <td className="px-3 py-2 text-right">{totalNet.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <PayrollModal
          row={editing}
          employeeName={empName.get(editing.employee_id) ?? ""}
          nontaxItems={nontaxItems}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {nontaxMgr && (
        <OptionsManager
          options={nontaxItems}
          cats={[{ key: "nontax_item", title: "비과세 항목", hint: "식대·차량유지비·보육수당 등 (급여 수정 시 항목별 입력)" }]}
          onClose={() => {
            setNontaxMgr(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PayrollModal({
  row,
  employeeName,
  nontaxItems,
  onClose,
  onSaved,
}: {
  row: PayrollRow;
  employeeName: string;
  nontaxItems: FieldOptionRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const n = (s: string) => Number(s.replace(/[^\d.-]/g, "")) || 0;

  const activeItems = nontaxItems.filter((o) => o.is_active);
  // 비과세 항목별 초기값(저장된 nontax_items 우선)
  const [nontax, setNontax] = useState<Record<string, string>>(() => {
    const saved = (row.nontax_items ?? {}) as Record<string, number>;
    const init: Record<string, string> = {};
    for (const o of activeItems) init[o.value] = saved[o.value] != null ? String(saved[o.value]) : "";
    // 저장돼 있으나 항목 목록에서 빠진 값도 보존
    for (const [k, v] of Object.entries(saved)) if (!(k in init)) init[k] = String(v);
    return init;
  });
  const nontaxSum = Object.values(nontax).reduce((s, v) => s + n(v), 0);

  const [d, setD] = useState({
    base_pay: String(row.base_pay),
    allowance: String(row.allowance),
    income_tax: String(row.income_tax),
    insurance: String(row.insurance),
    other_deduction: String(row.other_deduction),
    memo: row.memo ?? "",
  });
  const net = computeNet({
    base_pay: n(d.base_pay), allowance: n(d.allowance), nontax_allowance: nontaxSum,
    income_tax: n(d.income_tax), insurance: n(d.insurance), other_deduction: n(d.other_deduction),
  });

  function autoInsurance() {
    const est = estimateInsurance(n(d.base_pay) + n(d.allowance)).total;
    setD({ ...d, insurance: String(est) });
  }

  function save() {
    setError(null);
    const items: Record<string, number> = {};
    for (const [k, v] of Object.entries(nontax)) {
      const amt = n(v);
      if (amt > 0) items[k] = amt;
    }
    startTransition(async () => {
      const res = await savePayroll(row.company_id, row.employee_id, row.year_month, {
        base_pay: n(d.base_pay), allowance: n(d.allowance), nontax_allowance: nontaxSum,
        income_tax: n(d.income_tax), insurance: n(d.insurance), other_deduction: n(d.other_deduction),
        memo: d.memo.trim() || null,
        nontax_items: items,
      });
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  const f = (k: keyof typeof d, label: string) => (
    <Field label={label}>
      <NumberInput value={d[k]} onChange={(v) => setD({ ...d, [k]: v })} />
    </Field>
  );

  const itemKeys = Object.keys(nontax);

  return (
    <Modal title={`급여 수정 — ${employeeName} (${row.year_month})`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {f("base_pay", "기본급")}
        {f("allowance", "과세수당")}
        {f("income_tax", "소득세(+지방세)")}
        {f("other_deduction", "기타공제")}
        <div className="col-span-2 flex items-end gap-2">
          <div className="flex-1">{f("insurance", "4대보험(근로자)")}</div>
          <button onClick={autoInsurance} className="mb-0.5 rounded-lg border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">추정 채우기</button>
        </div>
      </div>

      {/* 비과세 항목별 입력 */}
      <div className="mt-3 rounded-xl border border-neutral-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-700">비과세수당 (항목별)</span>
          <span className="text-sm text-neutral-500">합계 <b className="text-neutral-900">{krw(nontaxSum)}</b></span>
        </div>
        {itemKeys.length === 0 ? (
          <p className="py-2 text-center text-xs text-neutral-400">
            등록된 비과세 항목이 없습니다. 상단 ‘⚙ 비과세 항목’에서 추가하세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {itemKeys.map((k) => {
              const label = activeItems.find((o) => o.value === k)?.label ?? k;
              return (
                <Field key={k} label={label}>
                  <NumberInput
                    value={nontax[k]}
                    onChange={(v) => setNontax((p) => ({ ...p, [k]: v }))}
                    placeholder="0"
                  />
                </Field>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-neutral-400">
          ※ 비과세 한도(예: 식대·차량유지비·보육수당 각 월 20만)는 검수하세요. 비과세는 4대보험·소득세 과세표준에서 제외됩니다.
        </p>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <div className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          실지급: <span className="font-bold">{krw(net)}</span>
        </div>
      </div>
      <div className="mt-3">
        <Field label="메모"><TextInput value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} /></Field>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ModalFooter onClose={onClose} onSave={save} pending={pending} />
    </Modal>
  );
}

// ---------- 공용 모달 셸 ----------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, pending }: { onClose: () => void; onSave: () => void; pending: boolean }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
      <button onClick={onSave} disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
        {pending ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
