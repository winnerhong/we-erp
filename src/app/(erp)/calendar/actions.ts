"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/tasks";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

interface Ctx {
  profileId: string;
  profileName: string;
  db: ReturnType<typeof createAdminClient>;
  employeeId: string | null;
  isAdmin: boolean;
  canAssign: boolean; // ADMIN 또는 매니저 → 타인 배정 가능
}

/** 현재 사용자 업무 컨텍스트(프로필·본인 직원·권한). */
async function taskCtx(): Promise<{ ctx?: Ctx; error?: string }> {
  const g = await ensureUser();
  if (g.error) return { error: g.error };
  const db = createAdminClient();
  const { data: emp } = await db
    .from("employees")
    .select("id, is_manager, name")
    .eq("profile_id", g.profile!.id)
    .maybeSingle();
  const e = emp as { id: string; is_manager: boolean; name: string } | null;
  const isAdmin = g.profile!.role === "ADMIN";
  return {
    ctx: {
      profileId: g.profile!.id,
      profileName: e?.name ?? g.profile!.username ?? g.profile!.email ?? "사용자",
      db,
      employeeId: e?.id ?? null,
      isAdmin,
      canAssign: isAdmin || e?.is_manager === true,
    },
  };
}

/** 이 업무를 편집(수정/삭제/배정변경)할 수 있나 — 관리자·매니저 또는 등록자. */
async function canManage(ctx: Ctx, taskId: string): Promise<boolean> {
  if (ctx.canAssign) return true;
  const { data } = await ctx.db.from("tasks").select("created_by").eq("id", taskId).maybeSingle();
  return (data as { created_by: string | null } | null)?.created_by === ctx.profileId;
}

/** 이 업무의 상태/진행률을 바꿀 수 있나 — 편집권한자 또는 담당자 본인. */
async function canProgress(ctx: Ctx, taskId: string): Promise<boolean> {
  if (await canManage(ctx, taskId)) return true;
  if (!ctx.employeeId) return false;
  const { data } = await ctx.db
    .from("task_assignees")
    .select("employee_id")
    .eq("task_id", taskId)
    .eq("employee_id", ctx.employeeId)
    .maybeSingle();
  return !!data;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  priority?: string;
  start_date?: string | null;
  due_date?: string | null;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  company_id?: string | null;
  assigneeIds?: string[];
}

function cleanStatus(v: string | undefined): TaskStatus {
  return (TASK_STATUSES as string[]).includes(v ?? "") ? (v as TaskStatus) : "TODO";
}
function cleanPriority(v: string | undefined): TaskPriority {
  return (TASK_PRIORITIES as string[]).includes(v ?? "") ? (v as TaskPriority) : "NORMAL";
}

/** 업무 생성. 매니저·관리자는 자유 배정, 일반 직원은 본인에게만 배정. */
export async function createTask(input: TaskInput): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요" };

  // 담당자 결정
  let assignees = (input.assigneeIds ?? []).filter(Boolean);
  if (!ctx.canAssign) {
    // 일반 직원: 본인에게만
    if (!ctx.employeeId) return { ok: false, error: "연결된 직원 정보가 없어 업무를 만들 수 없습니다." };
    assignees = [ctx.employeeId];
  }

  const { data, error: iErr } = await ctx.db
    .from("tasks")
    .insert({
      company_id: input.company_id ?? null,
      title,
      description: input.description?.trim() || null,
      category: input.category || null,
      status: cleanStatus(input.status),
      priority: cleanPriority(input.priority),
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      all_day: input.all_day !== false,
      start_time: input.all_day === false ? input.start_time || null : null,
      end_time: input.all_day === false ? input.end_time || null : null,
      created_by: ctx.profileId,
    } as never)
    .select("id")
    .single();
  if (iErr) return { ok: false, error: iErr.message };
  const taskId = (data as { id: string }).id;

  if (assignees.length > 0) {
    await ctx.db.from("task_assignees").insert(
      assignees.map((employee_id) => ({ task_id: taskId, employee_id })) as never
    );
  }
  revalidatePath("/calendar");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true, id: taskId };
}

/** 업무 전체 수정(편집권한자: 관리자·매니저·등록자). 담당자 목록도 교체. */
export async function updateTask(taskId: string, input: TaskInput): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  if (!(await canManage(ctx, taskId))) return { ok: false, error: "이 업무를 수정할 권한이 없습니다." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요" };

  const { error: uErr } = await ctx.db
    .from("tasks")
    .update({
      company_id: input.company_id ?? null,
      title,
      description: input.description?.trim() || null,
      category: input.category || null,
      status: cleanStatus(input.status),
      priority: cleanPriority(input.priority),
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      all_day: input.all_day !== false,
      start_time: input.all_day === false ? input.start_time || null : null,
      end_time: input.all_day === false ? input.end_time || null : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", taskId);
  if (uErr) return { ok: false, error: uErr.message };

  // 담당자 교체(관리자·매니저만 자유 배정 — 일반 등록자는 담당자 변경 불가)
  if (ctx.canAssign && input.assigneeIds) {
    await ctx.db.from("task_assignees").delete().eq("task_id", taskId);
    const ids = input.assigneeIds.filter(Boolean);
    if (ids.length > 0) {
      await ctx.db.from("task_assignees").insert(
        ids.map((employee_id) => ({ task_id: taskId, employee_id })) as never
      );
    }
  }
  revalidatePath("/calendar");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true };
}

/** 상태 변경(담당자 본인 또는 편집권한자). 완료 시 진행률 100. */
export async function setTaskStatus(taskId: string, status: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  if (!(await canProgress(ctx, taskId))) return { ok: false, error: "상태를 변경할 권한이 없습니다." };
  const s = cleanStatus(status);
  const patch: Record<string, unknown> = { status: s, updated_at: new Date().toISOString() };
  if (s === "DONE") patch.progress = 100;
  const { error: uErr } = await ctx.db.from("tasks").update(patch as never).eq("id", taskId);
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true };
}

/** 진행률 변경(0~100). 100이면 완료, 0이면 대기로 상태 동기화. */
export async function setTaskProgress(taskId: string, progress: number): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  if (!(await canProgress(ctx, taskId))) return { ok: false, error: "진행률을 변경할 권한이 없습니다." };
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  const patch: Record<string, unknown> = { progress: p, updated_at: new Date().toISOString() };
  if (p === 100) patch.status = "DONE";
  else if (p === 0) patch.status = "TODO";
  else patch.status = "DOING";
  const { error: uErr } = await ctx.db.from("tasks").update(patch as never).eq("id", taskId);
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  if (!(await canManage(ctx, taskId))) return { ok: false, error: "이 업무를 삭제할 권한이 없습니다." };
  const { error: dErr } = await ctx.db.from("tasks").delete().eq("id", taskId);
  if (dErr) return { ok: false, error: dErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true };
}

// ---------------- 댓글 ----------------

export async function addTaskComment(taskId: string, body: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  const text = body.trim();
  if (!text) return { ok: false, error: "내용을 입력하세요" };
  const { error: iErr } = await ctx.db.from("task_comments").insert({
    task_id: taskId,
    author_id: ctx.profileId,
    author_name: ctx.profileName,
    body: text,
  } as never);
  if (iErr) return { ok: false, error: iErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteTaskComment(commentId: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  // 본인 댓글 또는 관리자만 삭제
  const { data } = await ctx.db.from("task_comments").select("author_id").eq("id", commentId).maybeSingle();
  const authorId = (data as { author_id: string | null } | null)?.author_id;
  if (!ctx.isAdmin && authorId !== ctx.profileId) return { ok: false, error: "본인 댓글만 삭제할 수 있습니다." };
  const { error: dErr } = await ctx.db.from("task_comments").delete().eq("id", commentId);
  if (dErr) return { ok: false, error: dErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}

// ---------------- 체크리스트 ----------------

export async function addChecklistItem(taskId: string, label: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  if (!(await canProgress(ctx, taskId))) return { ok: false, error: "권한이 없습니다." };
  const text = label.trim();
  if (!text) return { ok: false, error: "내용을 입력하세요" };
  const { data: last } = await ctx.db
    .from("task_checklist")
    .select("sort_order")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const next = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;
  const { error: iErr } = await ctx.db
    .from("task_checklist")
    .insert({ task_id: taskId, label: text, sort_order: next } as never);
  if (iErr) return { ok: false, error: iErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  const { data } = await ctx.db.from("task_checklist").select("task_id").eq("id", itemId).maybeSingle();
  const taskId = (data as { task_id: string } | null)?.task_id;
  if (!taskId || !(await canProgress(ctx, taskId))) return { ok: false, error: "권한이 없습니다." };
  const { error: uErr } = await ctx.db.from("task_checklist").update({ done } as never).eq("id", itemId);
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteChecklistItem(itemId: string): Promise<Result> {
  const { ctx, error } = await taskCtx();
  if (error || !ctx) return { ok: false, error: error ?? "권한 없음" };
  const { data } = await ctx.db.from("task_checklist").select("task_id").eq("id", itemId).maybeSingle();
  const taskId = (data as { task_id: string } | null)?.task_id;
  if (!taskId || !(await canProgress(ctx, taskId))) return { ok: false, error: "권한이 없습니다." };
  const { error: dErr } = await ctx.db.from("task_checklist").delete().eq("id", itemId);
  if (dErr) return { ok: false, error: dErr.message };
  revalidatePath("/calendar");
  revalidatePath("/me");
  return { ok: true };
}
