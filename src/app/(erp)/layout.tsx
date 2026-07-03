import Link from "next/link";
import { getCompanyContext, ALL_COMPANIES } from "@/lib/active-company";
import { getCurrentProfile } from "@/lib/auth-guard";
import { getAllowedMenuHrefs } from "@/lib/permissions";
import { logout } from "@/app/actions/auth";
import { CompanySelector } from "@/components/company-selector";
import { TopNav } from "@/components/top-nav";
import { ProfileMenu } from "@/components/profile-menu";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ activeId, companies, restricted }, profile] = await Promise.all([
    getCompanyContext(),
    getCurrentProfile(),
  ]);
  const allowedHrefs = await getAllowedMenuHrefs(
    profile?.role ?? null,
    activeId === ALL_COMPANIES ? null : activeId
  );
  const activeCompany = companies.find((c) => c.id === activeId);
  const isManaged = activeCompany?.relation_type === "MANAGED";

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 네비게이션 (좌측 사이드바 대체) */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-5 py-2.5">
          <Link href="/" className="shrink-0 text-base font-bold text-neutral-900">위너 통합 ERP</Link>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span className="hidden font-medium text-neutral-700 sm:inline">사업자</span>
              <CompanySelector activeId={activeId} companies={companies} restricted={restricted} />
            </div>
            <ProfileMenu profile={profile} />
            <form action={logout}>
              <button className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50">
                로그아웃
              </button>
            </form>
          </div>
        </div>
        <TopNav allowedHrefs={allowedHrefs} isAdmin={profile?.role === "ADMIN"} />
      </header>

      {/* 대리업무 배너 — 수임업체를 작업 중일 때 상시 표시(실수 방지) */}
      {isManaged && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800">
          🤝 대리업무 중 — 수임업체 <b>{activeCompany?.name}</b> 의 데이터를 다루고 있습니다.
        </div>
      )}

      {/* 본문 */}
      <main className="mx-auto w-full max-w-screen-2xl flex-1 p-5">{children}</main>
    </div>
  );
}
