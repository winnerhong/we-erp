import { logout } from "@/app/actions/auth";
import { ensureSelf } from "@/lib/auth-guard";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const g = await ensureSelf();
  const name = g.employee?.name ?? g.profile?.username ?? "직원";

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-lg">👤</span>
          <span className="font-bold text-neutral-900">내 정보</span>
          <span className="ml-1 text-sm text-neutral-400">위너 통합 ERP</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="font-medium text-neutral-700">{name} 님</span>
          <form action={logout}>
            <button className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-5">{children}</main>
    </div>
  );
}
