"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { createNotice, updateNotice, deleteNotice, togglePin, publishNotice } from "./actions";

export interface NoticeItem {
  id: string; title: string; body: string | null; audience: string;
  partnerIds: string[]; partnerNames: string[]; groupTag: string | null;
  pinned: boolean; startDate: string | null; endDate: string | null;
  status: string; publishedAt: string | null; sentCount: number; authorName: string | null; createdAt: string;
}
type Emp = { id: string; name: string };

const AUDIENCE: Record<string, string> = { ALL: "전체 기관", COMPANY: "사업자 전체", GROUP: "그룹", PARTNERS: "특정 기관" };
const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function NoticesClient({
  items, companyId, partners, groups,
}: {
  items: NoticeItem[]; companyId: string | null; partners: Emp[]; groups: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<NoticeItem | "new" | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; info?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok) alert(r.error); else { if (r.info) alert(r.info); router.refresh(); } });

  return (
    <div>
      <PageHeader title="📢 공지" description="기관 대상 공지·안내문 발행 (게시판 + 알림톡 연동 준비)"
        actions={<button onClick={() => setEditing("new")} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">+ 공지 작성</button>} />

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">작성된 공지가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className={`rounded-2xl border bg-white p-4 ${n.pinned ? "border-amber-300" : "border-neutral-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.pinned && <span title="상단고정">📌</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${n.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{n.status === "PUBLISHED" ? "발행됨" : "작성중"}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{AUDIENCE[n.audience] ?? n.audience}{n.audience === "GROUP" && n.groupTag ? `: ${n.groupTag}` : ""}{n.audience === "PARTNERS" ? `: ${n.partnerNames.slice(0, 2).join(", ")}${n.partnerNames.length > 2 ? ` 외 ${n.partnerNames.length - 2}` : ""}` : ""}</span>
                    <h4 className="font-bold text-neutral-800">{n.title}</h4>
                  </div>
                  {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{n.body}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
                    {n.authorName && <span>{n.authorName}</span>}
                    <span>{n.createdAt.slice(0, 10)}</span>
                    {(n.startDate || n.endDate) && <span>게시 {n.startDate ?? ""}~{n.endDate ?? ""}</span>}
                    {n.status === "PUBLISHED" && n.sentCount > 0 && <span className="text-emerald-500">알림톡 {n.sentCount}건</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {n.status !== "PUBLISHED" && <button onClick={() => run(() => publishNotice(n.id))} disabled={pending} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">발행</button>}
                  <button onClick={() => run(() => togglePin(n.id, !n.pinned))} disabled={pending} title="상단고정" className="rounded-lg px-2 py-1 text-xs hover:bg-neutral-100">{n.pinned ? "📌" : "📍"}</button>
                  <button onClick={() => setEditing(n)} className="rounded-lg px-2 py-1 text-xs hover:bg-neutral-100">✏️</button>
                  <button onClick={() => { if (confirm("이 공지를 삭제할까요?")) run(() => deleteNotice(n.id)); }} disabled={pending} className="rounded-lg px-2 py-1 text-xs text-rose-400 hover:bg-rose-50">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <NoticeModal notice={editing === "new" ? null : editing} companyId={companyId} partners={partners} groups={groups}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
      )}
    </div>
  );
}

function NoticeModal({
  notice, companyId, partners, groups, onClose, onSaved,
}: {
  notice: NoticeItem | null; companyId: string | null; partners: Emp[]; groups: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !notice;
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [audience, setAudience] = useState(notice?.audience ?? "ALL");
  const [picked, setPicked] = useState<Set<string>>(new Set(notice?.partnerIds ?? []));
  const [groupTag, setGroupTag] = useState(notice?.groupTag ?? "");
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [start, setStart] = useState(notice?.startDate ?? "");
  const [end, setEnd] = useState(notice?.endDate ?? "");

  function save() {
    if (!title.trim()) { alert("제목을 입력하세요"); return; }
    if (audience === "PARTNERS" && picked.size === 0) { alert("대상 기관을 선택하세요"); return; }
    if (audience === "GROUP" && !groupTag) { alert("그룹을 선택하세요"); return; }
    const input = { company_id: companyId, title, body, audience, partner_ids: [...picked], group_tag: groupTag || null, pinned, start_date: start || null, end_date: end || null };
    startTransition(async () => {
      const r = isNew ? await createNotice(input) : await updateNotice(notice!.id, input);
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">{isNew ? "공지 작성" : "공지 수정"}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="max-h-[68vh] space-y-3 overflow-y-auto p-5">
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">제목</span><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 7월 휴강 안내" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">내용</span><textarea className={inputCls + " min-h-[120px]"} value={body} onChange={(e) => setBody(e.target.value)} placeholder="안내문 내용" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">발행 대상</span>
            <select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)}>
              {Object.entries(AUDIENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {audience === "GROUP" && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">그룹</span>
              <select className={inputCls} value={groupTag} onChange={(e) => setGroupTag(e.target.value)}>
                <option value="">선택</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          )}
          {audience === "PARTNERS" && (
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-500">대상 기관 ({picked.size})</span>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                {partners.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    {p.name}
                  </label>
                ))}
                {partners.length === 0 && <p className="text-xs text-neutral-400">거래처가 없습니다.</p>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">게시 시작</span><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">게시 종료</span><input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 상단 고정</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{pending ? "저장 중…" : isNew ? "작성" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
