// 자료실 공용 상수·헬퍼 (클라/서버 공용)
import type { LibraryVisibility } from "./supabase/database.types";

export const VISIBILITIES: LibraryVisibility[] = ["ALL", "COMPANY", "DEPT"];
export const VISIBILITY_LABEL: Record<LibraryVisibility, string> = {
  ALL: "전사 공용",
  COMPANY: "사업자 전용",
  DEPT: "부서 전용",
};

/** 바이트 → 읽기 쉬운 용량. */
export function fmtSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / Math.pow(1024, i);
  return `${i === 0 ? n : n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

/** 확장자/MIME → 아이콘 이모지. */
export function fileIcon(fileName: string, mime?: string | null): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mime?.startsWith("image/")) return "🖼️";
  if (["pdf"].includes(ext)) return "📕";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx", "hwp", "hwpx"].includes(ext)) return "📝";
  if (["ppt", "pptx"].includes(ext)) return "📈";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
  if (["mp3", "wav", "m4a"].includes(ext)) return "🎵";
  if (["txt", "md"].includes(ext)) return "📄";
  return "📎";
}

/**
 * 직원 1명에게 이 파일이 보이는가(공개범위).
 * ALL=전체 / COMPANY=같은 사업자 / DEPT=같은 사업자+부서
 */
export function fileVisibleTo(
  file: { visibility: string; company_id: string | null; department: string | null },
  emp: { company_id: string | null; department: string | null }
): boolean {
  if (file.visibility === "ALL") return true;
  if (file.visibility === "COMPANY") return !!file.company_id && file.company_id === emp.company_id;
  if (file.visibility === "DEPT")
    return !!file.company_id && file.company_id === emp.company_id && !!file.department && file.department === emp.department;
  return false;
}
