"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser } from "@/lib/auth-guard";
import { isSolapiConfigured, sendAlimtalk } from "@/lib/notify";
import type { NoticeRow } from "@/lib/supabase/database.types";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  info?: string;
}

export interface NoticeInput {
  company_id: string | null;
  title: string;
  body?: string | null;
  audience: string;
  partner_ids?: string[];
  group_tag?: string | null;
  pinned?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

function payload(input: NoticeInput) {
  return {
    company_id: input.company_id ?? null,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    audience: input.audience,
    partner_ids: input.audience === "PARTNERS" ? (input.partner_ids ?? []) : [],
    group_tag: input.audience === "GROUP" ? input.group_tag || null : null,
    pinned: input.pinned ?? false,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
  };
}

export async function createNotice(input: NoticeInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.title.trim()) return { ok: false, error: "제목을 입력하세요" };
  const db = createAdminClient();
  const { data, error } = await db.from("notices").insert({
    ...payload(input),
    created_by: g.profile!.id,
    author_name: g.profile!.username ?? g.profile!.email ?? "관리자",
  } as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateNotice(id: string, input: NoticeInput): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (!input.title.trim()) return { ok: false, error: "제목을 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("notices").update({ ...payload(input), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true };
}

export async function deleteNotice(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("notices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true };
}

export async function togglePin(id: string, pinned: boolean): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("notices").update({ pinned } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true };
}

// ---------- 일괄 ----------
export async function bulkDeleteNotices(ids: string[]): Promise<Result & { count?: number }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("notices").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true, count: ids.length };
}

export async function bulkSetNoticesPin(ids: string[], pinned: boolean): Promise<Result & { count?: number }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  if (ids.length === 0) return { ok: true, count: 0 };
  const db = createAdminClient();
  const { error } = await db.from("notices").update({ pinned } as never).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true, count: ids.length };
}

/** 여러 공지 일괄발행(각 건 알림톡 발송 로직 재사용). 이미 발행된 건 건너뜀. */
export async function bulkPublishNotices(ids: string[]): Promise<Result & { count?: number }> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  let count = 0;
  let firstErr: string | null = null;
  for (const id of ids) {
    const r = await publishNotice(id);
    if (!r.ok) { if (!firstErr) firstErr = r.error ?? null; continue; }
    count++;
  }
  if (count === 0 && firstErr) return { ok: false, error: firstErr };
  return { ok: true, count };
}

/** 공지 발행 — 게시판 노출 + (솔라피 키 있으면)알림톡 발송. */
export async function publishNotice(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data } = await db.from("notices").select("*").eq("id", id).maybeSingle();
  const notice = data as NoticeRow | null;
  if (!notice) return { ok: false, error: "공지를 찾을 수 없습니다" };

  // 대상 거래처 전화번호 수집(알림톡용)
  let recipients: string[] = [];
  if (isSolapiConfigured()) {
    let pq = db.from("partners").select("phone").eq("is_active", true).not("phone", "is", null);
    if (notice.audience === "COMPANY" && notice.company_id) pq = pq.eq("company_id", notice.company_id);
    else if (notice.audience === "GROUP" && notice.group_tag) pq = pq.eq("partner_group", notice.group_tag);
    else if (notice.audience === "PARTNERS" && notice.partner_ids.length) pq = pq.in("id", notice.partner_ids);
    const { data: ps } = await pq;
    recipients = ((ps ?? []) as { phone: string | null }[]).map((p) => p.phone!).filter(Boolean);
  }
  const send = await sendAlimtalk(recipients, `[공지] ${notice.title}`);

  const { error } = await db.from("notices").update({
    status: "PUBLISHED", published_at: new Date().toISOString(), sent_count: send.sent, updated_at: new Date().toISOString(),
  } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notices");
  return { ok: true, info: send.skipped ? "게시판에 발행됨(알림톡은 솔라피 키 연동 시 자동 발송)" : `발행 + 알림톡 ${send.sent}건 발송` };
}
