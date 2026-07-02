import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/active-company";
import { getCurrentProfile } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { LibraryClient, type LibFile, type LibFolder } from "./library-client";
import type { LibraryFolderRow, LibraryFileRow, LibraryFavoriteRow } from "@/lib/supabase/database.types";

export const metadata = { title: "자료실" };

export default async function LibraryPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const profile = await getCurrentProfile();

  const [{ data: folders }, { data: files }, { data: deptOpts }] = await Promise.all([
    supabase.from("library_folders").select("*").order("sort_order"),
    supabase.from("library_files").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("field_options").select("value, label").eq("category", "department"),
  ]);

  // 즐겨찾기 + 관리 권한(관리자 전용)
  const db = createAdminClient();
  let favorites: string[] = [];
  const canManage = profile?.role === "ADMIN";
  if (profile) {
    const { data: favs } = await db.from("library_favorites").select("file_id").eq("profile_id", profile.id);
    favorites = ((favs ?? []) as LibraryFavoriteRow[]).map((f) => f.file_id);
  }

  const companies = ctx.companies.map((c) => ({ id: c.id, name: c.name }));
  const compName = new Map(companies.map((c) => [c.id, c.name]));
  const deptLabel = new Map(((deptOpts ?? []) as { value: string; label: string }[]).map((o) => [o.value, o.label]));

  const fileRows: LibFile[] = ((files ?? []) as LibraryFileRow[]).map((f) => ({
    id: f.id, folderId: f.folder_id, title: f.title, description: f.description,
    fileName: f.file_name, mime: f.mime, size: f.size_bytes, version: f.version,
    visibility: f.visibility, companyId: f.company_id,
    companyName: f.company_id ? compName.get(f.company_id) ?? null : null,
    department: f.department, departmentLabel: f.department ? deptLabel.get(f.department) ?? f.department : null,
    uploaderName: f.uploader_name, downloadCount: f.download_count, createdAt: f.created_at, updatedAt: f.updated_at,
  }));
  const folderRows: LibFolder[] = ((folders ?? []) as LibraryFolderRow[]).map((f) => ({ id: f.id, name: f.name, parentId: f.parent_id }));

  return (
    <LibraryClient
      folders={folderRows}
      files={fileRows}
      favorites={favorites}
      companies={companies}
      departments={((deptOpts ?? []) as { value: string; label: string }[])}
      canManage={canManage}
    />
  );
}
