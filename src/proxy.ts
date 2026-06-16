import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { MENUS } from "@/lib/menus";

/** 세션 갱신 + 미인증 사용자 /login 으로 리다이렉트. (Next 16: middleware → proxy) */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 등급별 메뉴 접근 하드 차단 (대시보드 '/'·관리자는 통과, /admin 은 페이지 자체 가드)
  if (user && !isLogin && path !== "/" && !path.startsWith("/admin")) {
    const menu = MENUS.find((m) => m.href !== "/" && (path === m.href || path.startsWith(m.href + "/")));
    if (menu) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = (profile as { role: string } | null)?.role;
      if (role && role !== "ADMIN") {
        const { data: perm } = await supabase
          .from("role_menu_permissions")
          .select("allowed")
          .eq("role", role)
          .eq("menu_key", menu.href)
          .maybeSingle();
        if (perm && (perm as { allowed: boolean }).allowed === false) {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // /api 는 라우트가 자체 보호(크론 시크릿 등) → 페이지 인증 리다이렉트 제외
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
