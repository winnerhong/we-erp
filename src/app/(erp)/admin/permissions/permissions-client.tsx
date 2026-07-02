"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, TextInput } from "@/components/ui";
import type { MenuItem } from "@/lib/menus";
import { setMenuPermission, createRole, renameRole, deleteRole, reorderRoles } from "./actions";

export interface RoleInfo {
  key: string;
  label: string;
  isAdmin: boolean;
  builtin: boolean;
}

export function PermissionsClient({
  roles,
  menus,
  matrix,
}: {
  roles: RoleInfo[];
  menus: MenuItem[];
  matrix: Record<string, Record<string, boolean>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [grid, setGrid] = useState(matrix);
  const [newRole, setNewRole] = useState("");
  const [order, setOrder] = useState<string[]>(roles.map((r) => r.key));
  const [dragKey, setDragKey] = useState<string | null>(null);

  const nonAdmin = roles.filter((r) => !r.isAdmin);

  // order 상태 기준으로 정렬 + 신규/삭제 등급 반영
  const roleByKey = new Map(roles.map((r) => [r.key, r]));
  const orderedRoles: RoleInfo[] = [
    ...order.filter((k) => roleByKey.has(k)).map((k) => roleByKey.get(k)!),
    ...roles.filter((r) => !order.includes(r.key)),
  ];

  function refresh() {
    router.refresh();
  }

  function onDropRole(targetKey: string) {
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      return;
    }
    const keys = orderedRoles.map((r) => r.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setOrder(keys);
    setDragKey(null);
    startTransition(async () => {
      const res = await reorderRoles(keys);
      if (!res.ok) alert(res.error);
      refresh();
    });
  }

  function toggle(roleKey: string, href: string) {
    const next = !grid[roleKey]?.[href];
    setGrid((g) => ({ ...g, [roleKey]: { ...g[roleKey], [href]: next } }));
    startTransition(async () => {
      const res = await setMenuPermission(roleKey, href, next);
      if (!res.ok) {
        setGrid((g) => ({ ...g, [roleKey]: { ...g[roleKey], [href]: !next } }));
        alert(res.error);
      }
      refresh();
    });
  }

  function addRole() {
    const label = newRole.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await createRole(label);
      if (!res.ok) alert(res.error);
      else setNewRole("");
      refresh();
    });
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-neutral-900">권한 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          등급(역할)을 만들고, 등급별로 볼 수 있는 메뉴를 켜고 끕니다. 관리자는 항상 전체 접근입니다.
        </p>
      </div>

      {/* 등급 관리 */}
      <h2 className="mb-2 text-sm font-semibold text-neutral-700">등급</h2>
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap gap-2">
          {orderedRoles.map((r) => (
            <div
              key={r.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropRole(r.key)}
              className={`flex items-center rounded-lg ${dragKey === r.key ? "opacity-40" : ""}`}
            >
              <span
                draggable
                onDragStart={() => setDragKey(r.key)}
                onDragEnd={() => setDragKey(null)}
                title="드래그해서 순서 변경"
                className="cursor-grab select-none px-1 text-neutral-300 hover:text-neutral-500"
              >
                ⠿
              </span>
              <RoleChip role={r} onChanged={refresh} disabled={pending} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-400">⠿ 손잡이를 드래그하면 등급 순서를 바꿀 수 있습니다.</p>
        <div className="mt-3 flex max-w-xs gap-2 border-t border-neutral-100 pt-3">
          <TextInput
            className="flex-1"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="새 등급 이름 (예: 경리, 매니저)"
            onKeyDown={(e) => e.key === "Enter" && addRole()}
          />
          <button
            onClick={addRole}
            disabled={pending || !newRole.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            + 등급 추가
          </button>
        </div>
      </Card>

      {/* 메뉴 접근 매트릭스 */}
      <h2 className="mb-2 text-sm font-semibold text-neutral-700">메뉴 접근</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-3">메뉴</th>
              <th className="px-4 py-3 text-center">관리자</th>
              {nonAdmin.map((r) => (
                <th key={r.key} className="px-4 py-3 text-center">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {menus.map((m) => (
              <tr key={m.href}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="mr-2">{m.icon}</span>
                  <span className="font-medium text-neutral-800">{m.label}</span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-neutral-400">✓ 항상</td>
                {nonAdmin.map((r) => (
                  <td key={r.key} className="px-4 py-3 text-center">
                    <Switch on={!!grid[r.key]?.[m.href]} disabled={pending} onClick={() => toggle(r.key, m.href)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-3 text-xs text-neutral-400">
        ※ 메뉴 숨김은 화면 표시 기준입니다. 데이터 쓰기 보안(관리자 전용 기능 등)은 서버 액션 가드로 별도 보호됩니다.
      </p>
    </div>
  );
}

function RoleChip({ role, onChanged, disabled }: { role: RoleInfo; onChanged: () => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(role.label);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await renameRole(role.key, label);
      if (!res.ok) alert(res.error);
      else setEditing(false);
      onChanged();
    });
  }
  function remove() {
    if (!confirm(`'${role.label}' 등급을 삭제할까요? 이 등급의 사용자는 '일반'으로 이동합니다.`)) return;
    startTransition(async () => {
      const res = await deleteRole(role.key);
      if (!res.ok) alert(res.error);
      onChanged();
    });
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-24 text-sm focus:outline-none"
        />
        <button onClick={save} disabled={pending} className="text-xs text-emerald-600">저장</button>
        <button onClick={() => { setEditing(false); setLabel(role.label); }} className="text-xs text-neutral-400">취소</button>
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
        role.isAdmin ? "border-amber-200 bg-amber-50 text-amber-700" : "border-neutral-200 bg-neutral-50 text-neutral-700"
      }`}
    >
      <span className="font-medium">{role.label}</span>
      {role.isAdmin && <span className="text-[10px]">전체접근</span>}
      {!role.builtin && (
        <>
          <button onClick={() => setEditing(true)} disabled={disabled} className="text-xs text-neutral-400 hover:text-neutral-700">✎</button>
          <button onClick={remove} disabled={disabled} className="text-xs text-rose-400 hover:text-rose-600">🗑</button>
        </>
      )}
    </span>
  );
}

function Switch({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-emerald-500" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
