"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, SelectInput, Badge } from "@/components/ui";
import type { ProfileRow, AppRole } from "@/lib/supabase/database.types";
import { createUser, setUserRole, setUserActive, deleteUser } from "./actions";

type Role = { key: string; label: string };

export function UsersClient({
  users,
  roles,
  selfId,
}: {
  users: ProfileRow[];
  roles: Role[];
  selfId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const roleLabel = new Map(roles.map((r) => [r.key, r.label]));

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) alert(res.error);
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
        <button onClick={() => setAdding(true)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
          + 사용자 추가
        </button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">권한</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
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
          <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "생성 중…" : "발급"}
          </button>
        </div>
      </div>
    </div>
  );
}
