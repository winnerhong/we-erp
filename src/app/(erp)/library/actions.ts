"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUser, ensureManager } from "@/lib/auth-guard";
import { fileVisibleTo, VISIBILITIES } from "@/lib/library";
import type { LibraryFileRow, LibraryVisibility } from "@/lib/supabase/database.types";

const BUCKET = "library";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
  url?: string;
}

function cleanVis(v: string | undefined): LibraryVisibility {
  return (VISIBILITIES as string[]).includes(v ?? "") ? (v as LibraryVisibility) : "ALL";
}

// ---------------- 폴더 ----------------

export async function createFolder(name: string, parentId: string | null): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const nm = name.trim();
  if (!nm) return { ok: false, error: "폴더명을 입력하세요" };
  const db = createAdminClient();
  const { data: last } = await db.from("library_folders").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const next = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;
  const { data, error } = await db.from("library_folders").insert({ name: nm, parent_id: parentId, sort_order: next } as never).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true, id: (data as { id: string }).id };
}

export async function renameFolder(id: string, name: string): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const nm = name.trim();
  if (!nm) return { ok: false, error: "폴더명을 입력하세요" };
  const db = createAdminClient();
  const { error } = await db.from("library_folders").update({ name: nm } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true };
}

export async function deleteFolder(id: string): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  // 폴더 내 파일이 있으면 막기(실수 방지)
  const { count } = await db.from("library_files").select("*", { count: "exact", head: true }).eq("folder_id", id);
  if ((count ?? 0) > 0) return { ok: false, error: "폴더에 파일이 있습니다. 먼저 파일을 옮기거나 삭제하세요." };
  const { error } = await db.from("library_folders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true };
}

// ---------------- 파일 ----------------

export interface UploadInput {
  folderId: string | null;
  title: string;
  description?: string | null;
  fileName: string;
  base64: string;
  mime?: string | null;
  visibility?: string;
  companyId?: string | null;
  department?: string | null;
}

export async function uploadFile(input: UploadInput): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const title = input.title.trim() || input.fileName;
  if (!input.fileName || !input.base64) return { ok: false, error: "파일이 없습니다" };

  const db = createAdminClient();
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length > 24 * 1024 * 1024) return { ok: false, error: "파일이 너무 큽니다(최대 24MB)." };
  const ext = input.fileName.includes(".") ? input.fileName.toLowerCase().split(".").pop() : "bin";
  const path = `${crypto.randomUUID()}.${ext}`;

  const up = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: input.mime ?? "application/octet-stream",
    upsert: false,
  });
  if (up.error) return { ok: false, error: `업로드 실패: ${up.error.message}` };

  const vis = cleanVis(input.visibility);
  const { data, error } = await db.from("library_files").insert({
    folder_id: input.folderId,
    title,
    description: input.description?.trim() || null,
    file_name: input.fileName,
    mime: input.mime ?? null,
    size_bytes: bytes.length,
    storage_path: path,
    visibility: vis,
    company_id: vis === "ALL" ? null : input.companyId ?? null,
    department: vis === "DEPT" ? input.department ?? null : null,
    uploaded_by: g.profile!.id,
    uploader_name: g.employee?.name ?? g.profile!.username ?? g.profile!.email ?? "관리자",
  } as never).select("id").single();
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  revalidatePath("/library");
  revalidatePath("/me");
  return { ok: true, id: (data as { id: string }).id };
}

export interface FileMetaInput {
  title: string;
  description?: string | null;
  folderId?: string | null;
  visibility?: string;
  companyId?: string | null;
  department?: string | null;
}

export async function updateFileMeta(id: string, input: FileMetaInput): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 입력하세요" };
  const vis = cleanVis(input.visibility);
  const db = createAdminClient();
  const { error } = await db.from("library_files").update({
    title,
    description: input.description?.trim() || null,
    folder_id: input.folderId ?? null,
    visibility: vis,
    company_id: vis === "ALL" ? null : input.companyId ?? null,
    department: vis === "DEPT" ? input.department ?? null : null,
    updated_at: new Date().toISOString(),
  } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  revalidatePath("/me");
  return { ok: true };
}

/** 새 버전 업로드(파일 교체) — 이전 객체는 삭제, version++. */
export async function replaceFileVersion(id: string, fileName: string, base64: string, mime: string | null): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  if (!fileName || !base64) return { ok: false, error: "파일이 없습니다" };
  const db = createAdminClient();
  const { data: row } = await db.from("library_files").select("storage_path, version").eq("id", id).maybeSingle();
  const cur = row as { storage_path: string; version: number } | null;
  if (!cur) return { ok: false, error: "파일을 찾을 수 없습니다" };

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 24 * 1024 * 1024) return { ok: false, error: "파일이 너무 큽니다(최대 24MB)." };
  const ext = fileName.includes(".") ? fileName.toLowerCase().split(".").pop() : "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime ?? "application/octet-stream", upsert: false });
  if (up.error) return { ok: false, error: `업로드 실패: ${up.error.message}` };

  const { error } = await db.from("library_files").update({
    file_name: fileName, mime, size_bytes: bytes.length, storage_path: path,
    version: cur.version + 1, updated_at: new Date().toISOString(),
  } as never).eq("id", id);
  if (error) { await db.storage.from(BUCKET).remove([path]); return { ok: false, error: error.message }; }
  await db.storage.from(BUCKET).remove([cur.storage_path]);
  revalidatePath("/library");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteFile(id: string): Promise<Result> {
  const g = await ensureManager();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: row } = await db.from("library_files").select("storage_path").eq("id", id).maybeSingle();
  const path = (row as { storage_path: string } | null)?.storage_path;
  const { error } = await db.from("library_files").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (path) await db.storage.from(BUCKET).remove([path]);
  revalidatePath("/library");
  revalidatePath("/me");
  return { ok: true };
}

/** 다운로드용 서명 URL 발급(공개범위 확인 + 다운로드수 +1). */
export async function getDownloadUrl(id: string): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { data: row } = await db.from("library_files").select("*").eq("id", id).maybeSingle();
  const file = row as LibraryFileRow | null;
  if (!file || !file.is_active) return { ok: false, error: "파일을 찾을 수 없습니다" };

  const isAdmin = g.profile!.role === "ADMIN";
  if (!isAdmin) {
    const { data: emp } = await db.from("employees").select("company_id, department, is_manager").eq("profile_id", g.profile!.id).maybeSingle();
    const e = emp as { company_id: string | null; department: string | null; is_manager: boolean } | null;
    const canSee = (e?.is_manager === true) || (e && fileVisibleTo(file, e));
    if (!canSee) return { ok: false, error: "이 파일에 접근할 권한이 없습니다." };
  }

  const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !signed) return { ok: false, error: error?.message ?? "다운로드 링크 생성 실패" };
  await db.from("library_files").update({ download_count: file.download_count + 1 } as never).eq("id", id);
  revalidatePath("/library");
  return { ok: true, url: signed.signedUrl };
}

export async function toggleFavorite(fileId: string, on: boolean): Promise<Result> {
  const g = await ensureUser();
  if (g.error) return { ok: false, error: g.error };
  const db = createAdminClient();
  if (on) {
    const { error } = await db.from("library_favorites").upsert({ profile_id: g.profile!.id, file_id: fileId } as never);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from("library_favorites").delete().eq("profile_id", g.profile!.id).eq("file_id", fileId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/library");
  revalidatePath("/me");
  return { ok: true };
}
