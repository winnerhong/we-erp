"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { krw } from "@/lib/labels";
import type { ApprovalRow, ApprovalStepRow } from "@/lib/supabase/database.types";
import { createApproval, actOnApproval, cancelApproval } from "./actions";

type UserOpt = { id: string; name: string; role: string };

const DOC_TYPE: Record<string, string> = { GENERAL: "일반", EXPENSE: "지출결의", PURCHASE: "구매", LEAVE: "휴가" };
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "진행중", cls: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "승인", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "반려", cls: "bg-rose-50 text-rose-700" },
  CANCELED: { label: "회수", cls: "bg-neutral-100 text-neutral-500" },
};
const STEP_STATUS: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "대기", cls: "text-neutral-400" },
  APPROVED: { label: "승인", cls: "text-emerald-600" },
  REJECTED: { label: "반려", cls: "text-rose-600" },
};
const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function ApprovalsClient({
  approvals,
  stepsByApproval,
  users,
  meId,
  activeCompanyId,
}: {
  approvals: ApprovalRow[];
  stepsByApproval: Record<string, ApprovalStepRow[]>;
  users: UserOpt[];
  meId: string;
  activeCompanyId: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "mine" | "all">("todo");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // 현재 단계 결재자가 나인 진행중 문서 = 내 결재 대기
  const currentApprover = (a: ApprovalRow) =>
    (stepsByApproval[a.id] ?? []).find((s) => s.step_order === a.current_step)?.approver_id ?? null;
  const isMyTurn = (a: ApprovalRow) => a.status === "PENDING" && currentApprover(a) === meId;

  const todoCount = approvals.filter(isMyTurn).length;
  const mineCount = approvals.filter((a) => a.requester_id === meId).length;

  const list = useMemo(() => {
    if (tab === "todo") return approvals.filter(isMyTurn);
    if (tab === "mine") return approvals.filter((a) => a.requester_id === meId);
    return approvals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, approvals]);

  const detail = detailId ? approvals.find((a) => a.id === detailId) ?? null : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">🗳️ 전자결재</h1>
          <p className="mt-0.5 text-sm text-neutral-500">지출결의·구매·휴가·일반 문서를 결재선(순차 승인)으로 처리합니다.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
          ＋ 결재 올리기
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {([
          ["todo", `내 결재 대기 ${todoCount}`],
          ["mine", `올린 결재 ${mineCount}`],
          ["all", `전체 ${approvals.length}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-indigo-500 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">
          {tab === "todo" ? "결재할 문서가 없습니다 👍" : tab === "mine" ? "올린 결재가 없습니다." : "결재 문서가 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((a) => {
            const steps = stepsByApproval[a.id] ?? [];
            const done = steps.filter((s) => s.status === "APPROVED").length;
            const st = STATUS[a.status] ?? STATUS.PENDING;
            return (
              <button
                key={a.id}
                onClick={() => setDetailId(a.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:border-neutral-300"
              >
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">{DOC_TYPE[a.doc_type] ?? a.doc_type}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-neutral-800">{a.title}</span>
                    {isMyTurn(a) && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">내 차례</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {a.requester_name ?? "요청자"} · {a.created_at.slice(0, 10)} · 결재 {done}/{steps.length}
                  </span>
                </span>
                {a.amount != null && <span className="shrink-0 tabular-nums text-sm font-semibold text-neutral-700">{krw(a.amount)}</span>}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {detail && (
        <DetailModal
          approval={detail}
          steps={stepsByApproval[detail.id] ?? []}
          meId={meId}
          myTurn={isMyTurn(detail)}
          onClose={() => setDetailId(null)}
          onChanged={() => { setDetailId(null); router.refresh(); }}
        />
      )}
      {createOpen && (
        <CreateModal
          users={users}
          meId={meId}
          activeCompanyId={activeCompanyId}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function DetailModal({
  approval, steps, meId, myTurn, onClose, onChanged,
}: {
  approval: ApprovalRow; steps: ApprovalStepRow[]; meId: string; myTurn: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const st = STATUS[approval.status] ?? STATUS.PENDING;
  const isRequester = approval.requester_id === meId;

  function act(decision: "APPROVE" | "REJECT") {
    if (decision === "REJECT" && !comment.trim() && !confirm("반려 사유 없이 반려할까요?")) return;
    startTransition(async () => {
      const r = await actOnApproval(approval.id, decision, comment);
      if (!r.ok) { alert(r.error); return; }
      onChanged();
    });
  }
  function cancel() {
    if (!confirm("이 결재를 회수할까요?")) return;
    startTransition(async () => {
      const r = await cancelApproval(approval.id);
      if (!r.ok) { alert(r.error); return; }
      onChanged();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">{DOC_TYPE[approval.doc_type] ?? approval.doc_type}</span>
            <h2 className="font-semibold">{approval.title}</h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
            <span>상신 {approval.requester_name ?? "-"}</span>
            <span>{approval.created_at.slice(0, 16).replace("T", " ")}</span>
            {approval.amount != null && <span className="font-semibold text-neutral-800">{krw(approval.amount)}</span>}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
          </div>
          {approval.content && (
            <div className="whitespace-pre-wrap rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">{approval.content}</div>
          )}

          {/* 결재선 */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">결재선</p>
            <ol className="space-y-1.5">
              {steps.map((s) => {
                const cur = approval.status === "PENDING" && s.step_order === approval.current_step;
                const ss = STEP_STATUS[s.status] ?? STEP_STATUS.WAITING;
                return (
                  <li key={s.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cur ? "border-amber-300 bg-amber-50/50" : "border-neutral-100"}`}>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-500">{s.step_order}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-neutral-800">{s.approver_name ?? "결재자"}</span>
                      {cur && <span className="ml-1.5 text-[10px] font-bold text-amber-600">대기중</span>}
                      {s.comment && <span className="block truncate text-xs text-neutral-400">“{s.comment}”</span>}
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${ss.cls}`}>{ss.label}{s.acted_at ? ` · ${s.acted_at.slice(5, 10)}` : ""}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {myTurn && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-xs font-semibold text-amber-700">내 결재 차례입니다</p>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="의견(반려 시 사유)…" className={inputCls} />
              <div className="flex justify-end gap-2">
                <button onClick={() => act("REJECT")} disabled={pending} className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50">반려</button>
                <button onClick={() => act("APPROVE")} disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">승인</button>
              </div>
            </div>
          )}
          {isRequester && approval.status === "PENDING" && !myTurn && (
            <div className="flex justify-end">
              <button onClick={cancel} disabled={pending} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">결재 회수</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateModal({
  users, meId, activeCompanyId, onClose, onSaved,
}: {
  users: UserOpt[]; meId: string; activeCompanyId: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState("EXPENSE");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [chain, setChain] = useState<string[]>([]); // approver id 순서

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const addable = users.filter((u) => u.id !== meId && !chain.includes(u.id));

  function save() {
    if (!title.trim()) { alert("제목을 입력하세요"); return; }
    if (chain.length === 0) { alert("결재자를 1명 이상 지정하세요"); return; }
    startTransition(async () => {
      const r = await createApproval({
        company_id: activeCompanyId,
        doc_type: docType,
        title,
        amount: amount || null,
        content: content || null,
        approverIds: chain,
      });
      if (!r.ok) { alert(r.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold">결재 올리기</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">유형</span>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputCls}>
                {Object.entries(DOC_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-neutral-500">금액(선택)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "") ? Number(e.target.value.replace(/[^\d]/g, "")).toLocaleString() : "")} placeholder="0" className={`${inputCls} text-right tabular-nums`} />
            </label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">제목</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 6월 교구 구매 지출결의" className={inputCls} />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-500">내용</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="상세 내용…" className={inputCls} />
          </label>

          {/* 결재선 구성 */}
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">결재선 (승인 순서)</span>
            {chain.length === 0 ? (
              <p className="mb-2 text-xs text-neutral-400">아래에서 결재자를 순서대로 추가하세요.</p>
            ) : (
              <ol className="mb-2 space-y-1">
                {chain.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600">{i + 1}</span>
                    <span className="flex-1 truncate">{nameOf.get(id)}</span>
                    <button onClick={() => setChain((c) => c.filter((x) => x !== id))} className="text-xs text-neutral-400 hover:text-rose-500">제거</button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap gap-1">
              {addable.map((u) => (
                <button key={u.id} onClick={() => setChain((c) => [...c, u.id])} className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50">
                  + {u.name}
                </button>
              ))}
              {addable.length === 0 && <span className="text-xs text-neutral-400">추가할 결재자가 없습니다.</span>}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">취소</button>
          <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">
            {pending ? "상신 중…" : "상신"}
          </button>
        </div>
      </div>
    </div>
  );
}
