"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TONES, toneClass, TONE_SWATCH } from "@/lib/field-tones";
import type { FieldOptionRow } from "@/lib/supabase/database.types";
import {
  addFieldOption,
  updateFieldOption,
  deleteFieldOption,
  reorderFieldOptions,
} from "@/app/(erp)/actions";

export interface OptionCat {
  key: string;
  title: string;
  hint?: string;
  /** 항목별 '연동 대상'(거래처/직원) 선택 UI 표시 (예: 통장 구분) */
  linkable?: boolean;
}

// 색상 팔레트 (편집할 때만 펼쳐짐)
function TonePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TONES.map((t) => (
        <button
          key={t}
          type="button"
          title={t}
          onClick={() => onChange(t)}
          className={`flex h-7 w-7 items-center justify-center rounded-full ${TONE_SWATCH[t]} transition ${
            value === t ? "ring-2 ring-neutral-800 ring-offset-2" : "ring-1 ring-black/10 hover:scale-110"
          }`}
        >
          {value === t && <span className="text-xs font-bold text-white">✓</span>}
        </button>
      ))}
    </div>
  );
}

function OptionEditor({
  initialLabel,
  initialColor,
  pending,
  onSave,
  onCancel,
}: {
  initialLabel: string;
  initialColor: string;
  pending: boolean;
  onSave: (label: string, color: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [color, setColor] = useState(initialColor);
  return (
    <div className="space-y-3 rounded-xl border-2 border-neutral-800 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && label.trim()) onSave(label.trim(), color);
            if (e.key === "Escape") onCancel();
          }}
          placeholder="이름"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${toneClass(color)}`}>
          {label.trim() || "미리보기"}
        </span>
      </div>
      <TonePicker value={color} onChange={setColor} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">취소</button>
        <button
          onClick={() => label.trim() && onSave(label.trim(), color)}
          disabled={pending || !label.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  );
}

export function OptionsManager({
  options,
  cats,
  onClose,
}: {
  options: FieldOptionRow[];
  cats: OptionCat[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // 옵션 id 또는 'new:<cat>'

  // 카테고리별 표시 순서(드래그로 즉시 반영, 서버 반영 후 props 로 재동기화)
  const buildLists = (rows: FieldOptionRow[]) =>
    Object.fromEntries(cats.map((c) => [c.key, rows.filter((o) => o.category === c.key)]));
  const [lists, setLists] = useState<Record<string, FieldOptionRow[]>>(() => buildLists(options));
  // props(options) 가 바뀌면(추가/수정/삭제/정렬 후 refresh) 렌더 중 동기화
  const [prevOptions, setPrevOptions] = useState(options);
  if (prevOptions !== options) {
    setPrevOptions(options);
    setLists(buildLists(options));
  }

  const dragRef = useRef<{ cat: string; id: string } | null>(null);

  function onDragEnter(cat: string, overId: string) {
    const d = dragRef.current;
    if (!d || d.cat !== cat || d.id === overId) return;
    setLists((prev) => {
      const arr = [...(prev[cat] ?? [])];
      const from = arr.findIndex((o) => o.id === d.id);
      const to = arr.findIndex((o) => o.id === overId);
      if (from < 0 || to < 0) return prev;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      return { ...prev, [cat]: arr };
    });
  }

  function onDrop(cat: string) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const ids = (lists[cat] ?? []).map((o) => o.id);
    run(() => reorderFieldOptions(cat, ids));
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) alert(r.error);
      else setEditing(null);
      router.refresh();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900">항목 관리</h2>
            <p className="text-xs text-neutral-500">드롭다운에 보일 종류·색을 만들고, 드래그(⠿)로 순서를 바꿉니다</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">✕</button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-6">
          {cats.map((cat) => {
            const list = lists[cat.key] ?? [];
            const addingKey = `new:${cat.key}`;
            return (
              <section key={cat.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-bold text-neutral-800">{cat.title}</h3>
                  {cat.hint && <span className="text-xs text-neutral-400">{cat.hint}</span>}
                </div>

                <div className="space-y-2">
                  {list.map((o) =>
                    editing === o.id ? (
                      <OptionEditor
                        key={o.id}
                        initialLabel={o.label}
                        initialColor={o.color ?? "neutral"}
                        pending={pending}
                        onSave={(label, color) => run(() => updateFieldOption(o.id, { label, color }))}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <div
                        key={o.id}
                        draggable={!pending}
                        onDragStart={() => (dragRef.current = { cat: cat.key, id: o.id })}
                        onDragEnter={() => onDragEnter(cat.key, o.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(cat.key)}
                        onDragEnd={() => (dragRef.current = null)}
                        className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
                      >
                        <span
                          title="드래그해서 순서 변경"
                          className="cursor-grab select-none px-1 text-neutral-300 hover:text-neutral-500 active:cursor-grabbing"
                        >
                          ⠿
                        </span>
                        <span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${toneClass(o.color)}`}>
                          {o.label}
                        </span>
                        {cat.linkable && (
                          <select
                            value={o.link_type ?? ""}
                            onChange={(e) =>
                              run(() => updateFieldOption(o.id, { link_type: e.target.value || null }))
                            }
                            disabled={pending}
                            title="이 구분 선택 시 연결할 대상"
                            className="ml-2 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600"
                          >
                            <option value="">거래처 연동</option>
                            <option value="employee">직원(급여) 연동</option>
                          </select>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={() => setEditing(o.id)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`'${o.label}' 삭제할까요?`)) run(() => deleteFieldOption(o.id));
                            }}
                            disabled={pending}
                            title="삭제"
                            className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {editing === addingKey ? (
                    <OptionEditor
                      initialLabel=""
                      initialColor="blue"
                      pending={pending}
                      onSave={(label, color) => run(() => addFieldOption(cat.key, label, color))}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setEditing(addingKey)}
                      className="w-full rounded-xl border-2 border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
                    >
                      + 새 {cat.title} 추가
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="border-t border-neutral-200 px-6 py-3 text-right">
          <button onClick={onClose} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200">완료</button>
        </div>
      </div>
    </div>
  );
}
