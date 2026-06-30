import Link from "next/link";
import { getCompanyContext } from "@/lib/active-company";
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
  const [{ activeId, companies }, profile] = await Promise.all([
    getCompanyContext(),
    getCurrentProfile(),
  ]);
  const allowedHrefs = await getAllowedMenuHrefs(profile?.role ?? null);

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 네비게이션 (좌측 사이드바 대체) */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-5 py-2.5">
          <Link href="/" className="shrink-0 text-base font-bold text-neutral-900">위너 통합 ERP</Link>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span className="hidden font-medium text-neutral-700 sm:inline">사업자</span>
              <CompanySelector activeId={activeId} companies={companies} />
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

      {/* 본문 */}
      <main className="mx-auto w-full max-w-screen-2xl flex-1 p-5">{children}</main>
    </div>
  );
}
