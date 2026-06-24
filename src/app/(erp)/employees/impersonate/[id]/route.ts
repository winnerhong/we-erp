import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ensureAdmin } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 직원 계정 전환 로그인(관리자) — 새 탭에서 열기용 GET 라우트.
 *   매직링크 토큰 생성 → verifyOtp 로 이 브라우저 세션을 직원으로 교체 → /me 로 이동.
 *   ⚠️ 세션 쿠키는 브라우저 전체 공유 → 새 탭에서 열면 관리자 탭도 새로고침 시 직원으로 바뀝니다.
 *      관리자로 돌아가려면 로그아웃 후 본인 계정으로 다시 로그인하세요.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const g = await ensureAdmin();
  if (g.error) return htmlError("관리자 권한이 필요합니다.");

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("profile_id").eq("id", id).maybeSingle();
  const profileId = (emp as { profile_id: string | null } | null)?.profile_id;
  if (!profileId) return htmlError("이 직원은 로그인 계정이 없습니다. 먼저 ‘계정·비번’으로 발급하세요.");

  const { data: prof } = await admin.from("profiles").select("email").eq("id", profileId).maybeSingle();
  const email = (prof as { email: string | null } | null)?.email;
  if (!email) return htmlError("계정 이메일을 찾을 수 없습니다.");

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (lErr || !tokenHash) return htmlError(lErr?.message ?? "로그인 토큰 생성 실패");

  // 리다이렉트 응답에 세션 쿠키를 직접 싣는다(req→res 브리지).
  const res = NextResponse.redirect(new URL("/me", req.url));
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (vErr) return htmlError(vErr.message);

  return res;
}

/** 새 탭에서 보기 좋게 간단한 안내 페이지로 에러 표시(탭이 빈 화면으로 끝나지 않도록). */
function htmlError(message: string) {
  const body = `<!doctype html><meta charset="utf-8"><title>직원 로그인</title>
<body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa;margin:0">
<div style="text-align:center;padding:24px;border:1px solid #fecaca;background:#fff1f2;border-radius:16px;color:#9f1239;max-width:360px">
<div style="font-size:28px">⚠️</div>
<p style="margin:8px 0 16px;font-size:14px">${message}</p>
<button onclick="window.close()" style="padding:8px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;cursor:pointer">창 닫기</button>
</div></body>`;
  return new NextResponse(body, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
