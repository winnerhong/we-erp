// 사이드바·권한관리가 공유하는 메뉴 정의. (순수 데이터 — 클라/서버 공용)
export interface MenuItem {
  href: string;
  label: string;
  icon: string;
}

/** 일반 업무 메뉴(역할별 접근 제어 대상). */
export const MENUS: MenuItem[] = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/daily", label: "일일결산", icon: "📅" },
  { href: "/report", label: "손익 리포트", icon: "🧮" },
  { href: "/finance", label: "받을돈·줄돈", icon: "💵" },
  { href: "/companies", label: "사업자", icon: "🏢" },
  { href: "/partners", label: "거래처", icon: "🤝" },
  { href: "/employees", label: "직원", icon: "👥" },
  { href: "/accounts", label: "계정과목", icon: "📒" },
  { href: "/receipts", label: "영수증 OCR", icon: "🧾" },
  { href: "/tax-invoices", label: "세금계산서", icon: "📑" },
  { href: "/bank", label: "통장원장", icon: "🏦" },
  { href: "/cards", label: "카드원장", icon: "💳" },
  { href: "/paybacks", label: "페이백", icon: "💸" },
  { href: "/purchases", label: "구매 요청", icon: "🛒" },
  { href: "/hr", label: "급여·인사", icon: "💰" },
];
