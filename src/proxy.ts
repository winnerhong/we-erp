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

  // 직원 셀프 서비스(/me)·서류 인쇄(/print)는 누구나(로그인) 접근
  const isMe = path === "/me" || path.startsWith("/me/");
  const isPrint = path.startsWith("/print/");

  if (user && !isLogin && !isMe && !isPrint) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile as { role: string } | null)?.role;
    const menu = MENUS.find((m) => m.href !== "/" && (path === m.href || path.startsWith(m.href + "/")));

    // 직원(EMPLOYEE): 기본 전부 차단 → /me 로. 관리자가 권한관리에서 allowed=true 로 연 메뉴만 통과.
    if (role === "EMPLOYEE") {
      let allowed = false;
      if (menu) {
        const { data: perm } = await supabase
          .from("role_menu_permissions")
          .select("allowed")
          .eq("role", role)
          .eq("menu_key", menu.href)
          .maybeSingle();
        allowed = (perm as { allowed: boolean } | null)?.allowed === true;
      }
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/me";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    // 그 외 비-ADMIN 등급: 메뉴별 allowed=false 만 차단 (대시보드'/'·/admin 은 통과)
    else if (path !== "/" && !path.startsWith("/admin") && menu && role && role !== "ADMIN") {
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

  return response;
}

export const config = {
  matcher: [
    // /api 는 라우트가 자체 보호(크론 시크릿 등) → 페이지 인증 리다이렉트 제외
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
