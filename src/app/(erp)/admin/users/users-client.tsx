"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, SelectInput, Badge } from "@/components/ui";
import type { ProfileRow, AppRole } from "@/lib/supabase/database.types";
import { createUser, setUserRole, setUserActive, deleteUser, setUserCompanies, bulkSetUsersRole, bulkSetUsersActive, bulkDeleteUsers } from "./actions";
import { useTableSelection, SelectAllCell, SelectRowCell, BulkBar, BulkButton } from "@/components/bulk-select";

type Role = { key: string; label: string };
type CompanyOpt = { id: string; name: string; relation_type: string };

export function UsersClient({
  users,
  roles,
  selfId,
  companies,
  memberships,
}: {
  users: ProfileRow[];
  roles: Role[];
  selfId: string;
  companies: CompanyOpt[];
  memberships: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [assignFor, setAssignFor] = useState<ProfileRow | null>(null);
  const roleLabel = new Map(roles.map((r) => [r.key, r.label]));

  // 본인 계정은 일괄 대상에서 제외(권한/비활성/삭제 불가)
  const selectable = users.filter((u) => u.id !== selfId);
  const sel = useTableSelection(selectable);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  }

  function runBulk(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { alert(res.error); return; }
      sel.clear();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">사용자 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">직원 계정 발급과 권한(관리자/일반)을 관리합니다.</p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
          + 사용자 추가
        </button>
      </div>

      <BulkBar count={sel.count} onClear={sel.clear}>
        <select
          disabled={pending}
          defaultValue=""
          onChange={(e) => {
            const role = e.target.value as AppRole;
            e.currentTarget.value = "";
            if (role) runBulk(() => bulkSetUsersRole(sel.selected, role));
          }}
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700"
        >
          <option value="">권한 일괄변경…</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}(으)로</option>
          ))}
        </select>
        <BulkButton onClick={() => runBulk(() => bulkSetUsersActive(sel.selected, true))} disabled={pending}>활성화</BulkButton>
        <BulkButton onClick={() => runBulk(() => bulkSetUsersActive(sel.selected, false))} disabled={pending}>비활성화</BulkButton>
        <BulkButton
          tone="danger"
          disabled={pending}
          onClick={() => {
            if (confirm(`선택한 ${sel.count}개 계정을 완전히 삭제할까요? 되돌릴 수 없습니다.`))
              runBulk(() => bulkDeleteUsers(sel.selected));
          }}
        >
          🗑 삭제
        </BulkButton>
      </BulkBar>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-500">
            <tr>
              <SelectAllCell checked={sel.allChecked} someChecked={sel.someChecked} onToggle={sel.toggleAll} />
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">권한</th>
              <th className="px-4 py-3">담당 사업자</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.map((u) => (
              <tr key={u.id} className={`${u.is_active ? "" : "opacity-50"} ${sel.isSelected(u.id) ? "bg-indigo-50/50" : ""}`}>
                {u.id === selfId ? (
                  <td className="w-9 px-3 py-3" />
                ) : (
                  <SelectRowCell checked={sel.isSelected(u.id)} onToggle={() => sel.toggle(u.id)} />
                )}
                <td className="px-4 py-3 font-medium">{u.email}{u.id === selfId && " (나)"}</td>
                <td className="px-4 py-3">{u.name ?? "-"}</td>
                <td className="px-4 py-3">
                  <SelectInput
                    value={u.role}
                    disabled={pending || u.id === selfId}
                    onChange={(e) => act(() => setUserRole(u.id, e.target.value as AppRole))}
                    className="py-1"
                  >
                    {!roles.some((r) => r.key === u.role) && (
                      <option value={u.role}>{roleLabel.get(u.role) ?? u.role}</option>
                    )}
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </SelectInput>
                </td>
                <td className="px-4 py-3">
                  {u.role === "ADMIN" ? (
                    <span className="text-xs text-neutral-400">전체 (관리자)</span>
                  ) : (
                    (() => {
                      const n = (memberships[u.id] ?? []).length;
                      return (
                        <button
                          onClick={() => setAssignFor(u)}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                        >
                          {n === 0 ? "전체 (미배정)" : `${n}곳 배정`} 🏢
                        </button>
                      );
                    })()
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => act(() => setUserActive(u.id, !u.is_active))} disabled={pending || u.id === selfId}>
                    {u.is_active ? <Badge tone="green">활성</Badge> : <Badge>비활성</Badge>}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== selfId && (
                    <button
                      onClick={() => {
                        if (confirm("이 계정을 완전히 삭제할까요?")) act(() => deleteUser(u.id));
                      }}
                      disabled={pending}
                      className="text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {adding && (
        <AddUserModal
          roles={roles}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
      {assignFor && (
        <AssignCompaniesModal
          user={assignFor}
          companies={companies}
          initial={memberships[assignFor.id] ?? []}
          onClose={() => setAssignFor(null)}
          onSaved={() => {
            setAssignFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignCompaniesModal({
  user,
  companies,
  initial,
  onClose,
  onSaved,
}: {
  user: ProfileRow;
  companies: CompanyOpt[];
  initial: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const owned = companies.filter((c) => c.relation_type !== "MANAGED");
  const managed = companies.filter((c) => c.relation_type === "MANAGED");

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function save() {
    startTransition(async () => {
      const r = await setUserCompanies(user.id, [...sel]);
      if (!r.ok) { alert(r.error); return; }
      onSaved();
    });
  }

  const group = (label: string, list: CompanyOpt[]) =>
    list.length === 0 ? null : (
      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-500">{label}</p>
        <div className="space-y-1">
          {list.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-14 w-full max-w-sm rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">담당 사업자 — {user.name ?? user.email}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          <p className="text-xs text-neutral-500">체크한 사업자만 이 사용자에게 보입니다. <b>하나도 선택 안 하면 전체 접근</b>(하위호환).</p>
          {group("자사", owned)}
          {group("수임업체 (대리)", managed)}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({
  roles,
  onClose,
  onSaved,
}: {
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({ email: "", password: "", name: "", role: "MEMBER" as AppRole });

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createUser(d.email, d.password, d.name, d.role);
      if (res.ok) onSaved();
      else setError(res.error ?? "오류");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-16 w-full max-w-sm rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">사용자 추가</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <Field label="이메일" required><TextInput type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <Field label="임시 비밀번호 (6자 이상)" required><TextInput value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} /></Field>
          <Field label="이름"><TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="권한(등급)">
            <SelectInput value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as AppRole })}>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </SelectInput>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {pending ? "생성 중…" : "발급"}
          </button>
        </div>
      </div>
    </div>
  );
}
