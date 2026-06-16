import { getCompanyContext } from "@/lib/active-company";
import { getCurrentProfile } from "@/lib/auth-guard";
import { getAllowedMenuHrefs } from "@/lib/permissions";
import { logout } from "@/app/actions/auth";
import { CompanySelector } from "@/components/company-selector";
import { Sidebar } from "@/components/sidebar";
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
    <div className="flex min-h-screen">
      {/* 사이드바 (접힘/펼침) */}
      <Sidebar allowedHrefs={allowedHrefs} isAdmin={profile?.role === "ADMIN"} />

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="font-medium text-neutral-700">사업자</span>
            <CompanySelector activeId={activeId} companies={companies} />
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <ProfileMenu profile={profile} />
            <form action={logout}>
              <button className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50">
                로그아웃
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
