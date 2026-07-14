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

  // 거래처 포털 계정(partner_id 있음)은 /portal 만 접근 가능 — 나머지는 /portal 로.
  const isPortal = path === "/portal" || path.startsWith("/portal/");
  if (user && !isLogin) {
    const { data: pp } = await supabase.from("profiles").select("partner_id").eq("id", user.id).maybeSingle();
    if ((pp as { partner_id: string | null } | null)?.partner_id) {
      if (!isPortal) {
        const url = request.nextUrl.clone();
        url.pathname = "/portal";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return response; // 거래처 계정은 포털만
    }
  }

  // 직원 셀프 서비스(/me)·서류 인쇄(/print)는 누구나(로그인) 접근. /portal 은 거래처 전용(직원은 위에서 통과 안 함).
  const isMe = path === "/me" || path.startsWith("/me/");
  const isPrint = path.startsWith("/print/");

  if (user && !isLogin && !isMe && !isPrint && !isPortal) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile as { role: string } | null)?.role;
    const menu = MENUS.find((m) => m.href !== "/" && (path === m.href || path.startsWith(m.href + "/")));

    // 활성 사업자(쿠키) — 전체보기("ALL")·미설정이면 기본 규칙만 적용
    const cookieCompany = request.cookies.get("erp_company")?.value;
    const activeCompany = cookieCompany && cookieCompany !== "ALL" ? cookieCompany : null;

    // 해당 메뉴의 유효 allowed 해석(활성 사업자 오버라이드 → 기본(null) → defaultAllow)
    const menuAllowed = async (menuHref: string, defaultAllow: boolean): Promise<boolean> => {
      let q = supabase
        .from("role_menu_permissions")
        .select("allowed, company_id")
        .eq("role", role!)
        .eq("menu_key", menuHref);
      q = q.or(activeCompany ? `company_id.eq.${activeCompany},company_id.is.null` : "company_id.is.null");
      const { data } = await q;
      const rows = (data ?? []) as { allowed: boolean; company_id: string | null }[];
      const override = activeCompany ? rows.find((r) => r.company_id === activeCompany) : undefined;
      const base = rows.find((r) => r.company_id == null);
      return override ? override.allowed : base ? base.allowed : defaultAllow;
    };

    // 직원(EMPLOYEE): 기본 전부 차단 → /me 로. 권한관리에서 열어준 메뉴만 통과.
    if (role === "EMPLOYEE") {
      const allowed = menu ? await menuAllowed(menu.href, false) : false;
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/me";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    // 그 외 비-ADMIN 등급: 유효 allowed=false 만 차단 (대시보드'/'·/admin 은 통과)
    else if (path !== "/" && !path.startsWith("/admin") && menu && role && role !== "ADMIN") {
      const allowed = await menuAllowed(menu.href, true);
      if (!allowed) {
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
