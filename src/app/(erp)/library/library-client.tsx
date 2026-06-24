"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, FileButton } from "@/components/ui";
import { LibraryBrowser, type LibFile, type LibFolder } from "@/components/library-browser";
import { VISIBILITIES, VISIBILITY_LABEL } from "@/lib/library";
import type { LibraryVisibility } from "@/lib/supabase/database.types";
import {
  uploadFile, updateFileMeta, replaceFileVersion, deleteFile,
  createFolder, renameFolder, deleteFolder,
} from "./actions";

export type { LibFile, LibFolder } from "@/components/library-browser";

type Company = { id: string; name: string };
type Dept = { value: string; label: string };

function readBase64(file: File): Promise<{ base64: string; mime: string; name: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve({ base64: s.split(",")[1] ?? "", mime: file.type || "application/octet-stream", name: file.name });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function LibraryClient({
  folders, files, favorites, companies, departments, canManage,
}: {
  folders: LibFolder[];
  files: LibFile[];
  favorites: string[];
  companies: Company[];
  departments: Dept[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [uploadFor, setUploadFor] = useState<string | null | undefined>(undefined); // undefined=닫힘
  const [editFile, setEditFile] = useState<LibFile | null>(null);
  const [folderMgr, setFolderMgr] = useState(false);
  const refresh = () => router.refresh();

  function onDelete(f: LibFile) {
    if (!confirm(`'${f.title}' 자료를 삭제할까요?`)) return;
    void deleteFile(f.id).then((r) => { if (!r.ok) alert(r.error); else refresh(); });
  }

  return (
    <div>
      <PageHeader
        title="📚 자료실"
        description="회사 업무자료를 폴더로 정리하고 직원이 다운로드"
        actions={canManage ? (
          <div className="flex gap-2">
            <button onClick={() => setFolderMgr(true)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">🗂️ 폴더 관리</button>
            <button onClick={() => setUploadFor(null)} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">⬆ 파일 올리기</button>
          </div>
        ) : null}
      />

      <LibraryBrowser
        folders={folders} files={files} favorites={favorites} canManage={canManage}
        onUpload={canManage ? (fid) => setUploadFor(fid) : undefined}
        onEdit={canManage ? (f) => setEditFile(f) : undefined}
        onDelete={canManage ? onDelete : undefined}
        onRefresh={refresh}
      />

      {uploadFor !== undefined && (
        <UploadModal folders={folders} companies={companies} departments={departments} initialFolder={uploadFor}
          onClose={() => setUploadFor(undefined)} onSaved={() => { setUploadFor(undefined); refresh(); }} />
      )}
      {editFile && (
        <EditModal file={editFile} folders={folders} companies={companies} departments={departments}
          onClose={() => setEditFile(null)} onSaved={() => { setEditFile(null); refresh(); }} />
      )}
      {folderMgr && (
        <FolderManager folders={folders} onClose={() => setFolderMgr(false)} onChanged={refresh} />
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

function VisibilityFields({
  visibility, setVisibility, companyId, setCompanyId, department, setDepartment, companies, departments,
}: {
  visibility: string; setVisibility: (v: string) => void;
  companyId: string; setCompanyId: (v: string) => void;
  department: string; setDepartment: (v: string) => void;
  companies: Company[]; departments: Dept[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">공개범위</span>
        <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          {VISIBILITIES.map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v as LibraryVisibility]}</option>)}
        </select>
      </label>
      {visibility !== "ALL" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">사업자</span>
          <select className={inputCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">선택</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {visibility === "DEPT" && (
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">부서</span>
          <select className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">선택</option>
            {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="font-semibold text-neutral-800">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function UploadModal({
  folders, companies, departments, initialFolder, onClose, onSaved,
}: {
  folders: LibFolder[]; companies: Company[]; departments: Dept[];
  initialFolder: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState(initialFolder ?? "");
  const [visibility, setVisibility] = useState("ALL");
  const [companyId, setCompanyId] = useState("");
  const [department, setDepartment] = useState("");

  function save() {
    if (!file) { alert("파일을 선택하세요"); return; }
    if (visibility !== "ALL" && !companyId) { alert("사업자를 선택하세요"); return; }
    if (visibility === "DEPT" && !department) { alert("부서를 선택하세요"); return; }
    startTransition(async () => {
      const { base64, mime, name } = await readBase64(file);
      const r = await uploadFile({
        folderId: folderId || null, title: title || name, description, fileName: name, base64, mime,
        visibility, companyId: companyId || null, department: department || null,
      });
      if (!r.ok) { alert(r.error ?? "업로드 실패"); return; }
      onSaved();
    });
  }

  return (
    <ModalShell title="파일 올리기" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{pending ? "올리는 중…" : "올리기"}</button>
      </>
    }>
      <FileButton label="파일 선택" onFile={(f) => { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">제목</span>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="자료 제목" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">설명</span>
        <textarea className={inputCls + " min-h-[64px]"} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="간단한 설명(선택)" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">폴더</span>
        <select className={inputCls} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">미분류</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <VisibilityFields visibility={visibility} setVisibility={setVisibility} companyId={companyId} setCompanyId={setCompanyId}
        department={department} setDepartment={setDepartment} companies={companies} departments={departments} />
    </ModalShell>
  );
}

function EditModal({
  file, folders, companies, departments, onClose, onSaved,
}: {
  file: LibFile; folders: LibFolder[]; companies: Company[]; departments: Dept[];
  onClose: () => void; onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(file.title);
  const [description, setDescription] = useState(file.description ?? "");
  const [folderId, setFolderId] = useState(file.folderId ?? "");
  const [visibility, setVisibility] = useState(file.visibility);
  const [companyId, setCompanyId] = useState(file.companyId ?? "");
  const [department, setDepartment] = useState(file.department ?? "");

  function save() {
    if (visibility !== "ALL" && !companyId) { alert("사업자를 선택하세요"); return; }
    if (visibility === "DEPT" && !department) { alert("부서를 선택하세요"); return; }
    startTransition(async () => {
      const r = await updateFileMeta(file.id, { title, description, folderId: folderId || null, visibility, companyId: companyId || null, department: department || null });
      if (!r.ok) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  }
  function replace(f: File) {
    startTransition(async () => {
      const { base64, mime, name } = await readBase64(f);
      const r = await replaceFileVersion(file.id, name, base64, mime);
      if (!r.ok) { alert(r.error ?? "교체 실패"); return; }
      onSaved();
    });
  }

  return (
    <ModalShell title="자료 수정" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">취소</button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">{pending ? "저장 중…" : "저장"}</button>
      </>
    }>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">제목</span>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">설명</span>
        <textarea className={inputCls + " min-h-[64px]"} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">폴더</span>
        <select className={inputCls} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">미분류</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <VisibilityFields visibility={visibility} setVisibility={setVisibility} companyId={companyId} setCompanyId={setCompanyId}
        department={department} setDepartment={setDepartment} companies={companies} departments={departments} />
      <div className="rounded-lg bg-neutral-50 p-3">
        <p className="mb-2 text-xs text-neutral-500">현재 파일: <span className="font-medium text-neutral-700">{file.fileName}</span> (v{file.version})</p>
        <FileButton label="새 버전으로 교체" onFile={replace} />
      </div>
    </ModalShell>
  );
}

function FolderManager({ folders, onClose, onChanged }: { folders: LibFolder[]; onClose: () => void; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => { const r = await fn(); if (!r.ok) alert(r.error); else onChanged(); });

  return (
    <ModalShell title="폴더 관리" onClose={onClose} footer={
      <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">닫기</button>
    }>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { run(() => createFolder(name, null)); setName(""); } }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 폴더 이름" className={inputCls} />
        <button disabled={pending} className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">추가</button>
      </form>
      <div className="space-y-1.5">
        {folders.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
            <span className="flex-1 truncate">🗂️ {f.name}</span>
            <button onClick={() => { const n = prompt("폴더 이름", f.name); if (n && n.trim()) run(() => renameFolder(f.id, n)); }} className="text-xs text-neutral-500 hover:text-neutral-800">이름변경</button>
            <button onClick={() => { if (confirm(`'${f.name}' 폴더를 삭제할까요?`)) run(() => deleteFolder(f.id)); }} className="text-xs text-rose-400 hover:text-rose-600">삭제</button>
          </div>
        ))}
        {folders.length === 0 && <p className="py-4 text-center text-xs text-neutral-400">폴더가 없습니다.</p>}
      </div>
    </ModalShell>
  );
}
