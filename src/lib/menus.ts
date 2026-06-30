// 사이드바·권한관리가 공유하는 메뉴 정의. (순수 데이터 — 클라/서버 공용)
export interface MenuItem {
  href: string;
  label: string;
  icon: string;
}

/** 일반 업무 메뉴(역할별 접근 제어 대상). */
export const MENUS: MenuItem[] = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/calendar", label: "업무캘린더", icon: "📆" },
  { href: "/sales", label: "일매출", icon: "🧾" },
  { href: "/daily", label: "일일결산", icon: "📅" },
  { href: "/report", label: "손익 리포트", icon: "🧮" },
  { href: "/finance", label: "받을돈·줄돈", icon: "💵" },
  { href: "/companies", label: "사업자", icon: "🏢" },
  { href: "/partners", label: "거래처", icon: "🤝" },
  { href: "/students", label: "원생", icon: "🧒" },
  { href: "/employees", label: "직원", icon: "👥" },
  { href: "/drivers", label: "기사", icon: "🚐" },
  { href: "/org", label: "조직도", icon: "🏢" },
  { href: "/accounts", label: "계정과목", icon: "📒" },
  { href: "/receipts", label: "영수증 OCR", icon: "🧾" },
  { href: "/tax-invoices", label: "세금계산서", icon: "📑" },
  { href: "/bank", label: "통장원장", icon: "🏦" },
  { href: "/cards", label: "카드원장", icon: "💳" },
  { href: "/paybacks", label: "페이백", icon: "💸" },
  { href: "/purchases", label: "구매 요청", icon: "🛒" },
  { href: "/assets", label: "교구·자산", icon: "🏐" },
  { href: "/sessions", label: "수업현황", icon: "🤸" },
  { href: "/events", label: "행사관리", icon: "🎪" },
  { href: "/notices", label: "공지", icon: "📢" },
  { href: "/attendance", label: "근태현황", icon: "🕘" },
  { href: "/hr", label: "급여·인사", icon: "💰" },
  { href: "/documents", label: "서류관리", icon: "📄" },
  { href: "/library", label: "자료실", icon: "📚" },
];

/** 상단 네비 그룹 — MENUS 의 href 를 묶어 드롭다운으로 표시(권한/프록시는 MENUS 그대로 사용). */
export interface MenuGroup {
  label: string;
  icon: string;
  hrefs: string[];
}
export const MENU_GROUPS: MenuGroup[] = [
  { label: "운영", icon: "🏫", hrefs: ["/sessions", "/events", "/assets", "/calendar", "/notices"] },
  { label: "영업·고객", icon: "🤝", hrefs: ["/partners", "/students", "/sales"] },
  { label: "회계", icon: "💰", hrefs: ["/daily", "/report", "/finance", "/purchases"] },
  { label: "증빙·세무", icon: "🧾", hrefs: ["/tax-invoices", "/receipts", "/bank", "/cards", "/paybacks"] },
  { label: "인사", icon: "👥", hrefs: ["/employees", "/drivers", "/org", "/attendance", "/hr"] },
  { label: "문서", icon: "📄", hrefs: ["/documents", "/library"] },
  { label: "설정", icon: "⚙️", hrefs: ["/companies", "/accounts"] },
];

/** href → MenuItem 빠른 조회 */
export const MENU_BY_HREF: Record<string, MenuItem> = Object.fromEntries(MENUS.map((m) => [m.href, m]));
