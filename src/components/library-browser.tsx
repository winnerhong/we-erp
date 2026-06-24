"use client";

import { useMemo, useState, useTransition } from "react";
import { fmtSize, fileIcon, VISIBILITY_LABEL } from "@/lib/library";
import type { LibraryVisibility } from "@/lib/supabase/database.types";
import { getDownloadUrl, toggleFavorite } from "@/app/(erp)/library/actions";

export interface LibFolder {
  id: string;
  name: string;
  parentId: string | null;
}
export interface LibFile {
  id: string;
  folderId: string | null;
  title: string;
  description: string | null;
  fileName: string;
  mime: string | null;
  size: number;
  version: number;
  visibility: string;
  companyId: string | null;
  companyName: string | null;
  department: string | null;
  departmentLabel: string | null;
  uploaderName: string | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

type FolderSel = "all" | "fav" | "recent" | "none" | string;

export function LibraryBrowser({
  folders,
  files,
  favorites,
  canManage,
  onUpload,
  onEdit,
  onDelete,
  onRefresh,
}: {
  folders: LibFolder[];
  files: LibFile[];
  favorites: string[];
  canManage: boolean;
  onUpload?: (folderId: string | null) => void;
  onEdit?: (file: LibFile) => void;
  onDelete?: (file: LibFile) => void;
  onRefresh: () => void;
}) {
  const [sel, setSel] = useState<FolderSel>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"new" | "downloads" | "name">("new");
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const recentCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  const countIn = (folderId: string | null) => files.filter((f) => f.folderId === folderId).length;

  const shown = useMemo(() => {
    let list = files.slice();
    if (sel === "fav") list = list.filter((f) => favSet.has(f.id));
    else if (sel === "recent") list = list.filter((f) => f.createdAt >= recentCutoff);
    else if (sel === "none") list = list.filter((f) => !f.folderId);
    else if (sel !== "all") list = list.filter((f) => f.folderId === sel);

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((f) => f.title.toLowerCase().includes(q) || f.fileName.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q));

    list.sort((a, b) => {
      if (sort === "downloads") return b.downloadCount - a.downloadCount;
      if (sort === "name") return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [files, sel, search, sort, favSet, recentCutoff]);

  return (
    <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
      {/* 사이드: 폴더 */}
      <aside className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-2">
        <SideBtn active={sel === "all"} icon="📁" label="전체" n={files.length} onClick={() => setSel("all")} />
        <SideBtn active={sel === "fav"} icon="⭐" label="즐겨찾기" n={favorites.length} onClick={() => setSel("fav")} />
        <SideBtn active={sel === "recent"} icon="🆕" label="최근 7일" onClick={() => setSel("recent")} />
        <div className="my-1 border-t border-neutral-100" />
        {folders.map((f) => <SideBtn key={f.id} active={sel === f.id} icon="🗂️" label={f.name} n={countIn(f.id)} onClick={() => setSel(f.id)} />)}
        <SideBtn active={sel === "none"} icon="📦" label="미분류" n={countIn(null)} onClick={() => setSel("none")} />
        {canManage && onUpload && (
          <button onClick={() => onUpload(sel !== "all" && sel !== "fav" && sel !== "recent" && sel !== "none" ? sel : null)}
            className="mt-2 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
            ⬆ 파일 올리기
          </button>
        )}
      </aside>

      {/* 파일 목록 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 자료 검색"
            className="w-48 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none" />
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="new">최신순</option>
            <option value="downloads">다운로드순</option>
            <option value="name">이름순</option>
          </select>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-16 text-center text-sm text-neutral-400">자료가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((f) => (
              <FileRow key={f.id} f={f} fav={favSet.has(f.id)} canManage={canManage}
                onEdit={onEdit} onDelete={onDelete} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SideBtn({ active, icon, label, n, onClick }: { active: boolean; icon: string; label: string; n?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
    >
      <span>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {n !== undefined && n > 0 && <span className={`text-xs ${active ? "text-neutral-300" : "text-neutral-400"}`}>{n}</span>}
    </button>
  );
}

function FileRow({
  f, fav, canManage, onEdit, onDelete, onRefresh,
}: {
  f: LibFile; fav: boolean; canManage: boolean;
  onEdit?: (file: LibFile) => void; onDelete?: (file: LibFile) => void; onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      const r = await getDownloadUrl(f.id);
      if (!r.ok || !r.url) { alert(r.error ?? "다운로드 실패"); return; }
      const a = document.createElement("a");
      a.href = r.url;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      onRefresh();
    });
  }
  function star() {
    startTransition(async () => {
      const r = await toggleFavorite(f.id, !fav);
      if (!r.ok) { alert(r.error); return; }
      onRefresh();
    });
  }

  const vis = f.visibility as LibraryVisibility;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 hover:border-neutral-300">
      <div className="text-2xl">{fileIcon(f.fileName, f.mime)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-neutral-800">{f.title}</span>
          {f.version > 1 && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">v{f.version}</span>}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${vis === "ALL" ? "bg-emerald-50 text-emerald-600" : vis === "COMPANY" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
            {VISIBILITY_LABEL[vis] ?? f.visibility}{f.companyName ? ` · ${f.companyName}` : ""}{f.departmentLabel ? ` · ${f.departmentLabel}` : ""}
          </span>
        </div>
        {f.description && <p className="mt-0.5 truncate text-xs text-neutral-500">{f.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-400">
          <span className="truncate">{f.fileName}</span>
          <span>{fmtSize(f.size)}</span>
          <span>⬇ {f.downloadCount}</span>
          {f.uploaderName && <span>{f.uploaderName}</span>}
          <span className="tabular-nums">{f.createdAt.slice(0, 10)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={star} disabled={pending} title="즐겨찾기" className="rounded-lg px-2 py-1.5 text-lg hover:bg-neutral-100">{fav ? "⭐" : "☆"}</button>
        <button onClick={download} disabled={pending} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50">
          {pending ? "…" : "⬇ 받기"}
        </button>
        {canManage && (
          <>
            {onEdit && <button onClick={() => onEdit(f)} title="수정" className="rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-100">✏️</button>}
            {onDelete && <button onClick={() => onDelete(f)} title="삭제" className="rounded-lg px-2 py-1.5 text-sm text-rose-400 hover:bg-rose-50">🗑</button>}
          </>
        )}
      </div>
    </div>
  );
}
