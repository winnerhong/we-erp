import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "node:crypto";
import { ensureAdmin } from "@/lib/auth-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 거래처 포털 대리 로그인(관리자) — 새 탭에서 열기용 GET 라우트.
 *   계정이 없으면 즉석에서 자동 발급(합성 이메일·랜덤 비번) → 매직링크 토큰 → verifyOtp 로
 *   이 브라우저 세션을 거래처 계정으로 교체 → /portal 로 이동. (이메일·비번 입력 불필요)
 *   ⚠️ 세션 쿠키는 브라우저 전체 공유 → 새 탭에서 열면 관리자 탭도 새로고침 시 거래처로 바뀝니다.
 *      관리자로 돌아가려면 로그아웃 후 본인 계정으로 다시 로그인하세요.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const g = await ensureAdmin();
  if (g.error) return htmlError("관리자 권한이 필요합니다.");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("email").eq("partner_id", id).maybeSingle();
  let email = (prof as { email: string | null } | null)?.email ?? null;

  // 계정이 없으면 자동 발급(합성 이메일 — 담당자가 직접 로그인 원하면 나중에 🔑 관리에서 재설정)
  if (!email) {
    const { data: partner } = await admin.from("partners").select("name, email").eq("id", id).maybeSingle();
    const p = partner as { name: string; email: string | null } | null;
    if (!p) return htmlError("거래처를 찾을 수 없습니다.");
    email = p.email?.trim() || `partner-${id}@portal.local`;
    const password = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cErr || !created?.user) return htmlError(cErr?.message ?? "포털 계정 자동 발급 실패");
    const { error: pErr } = await admin.from("profiles").insert({
      id: created.user.id, email, name: p.name, role: "PARTNER", partner_id: id,
    } as never);
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return htmlError(pErr.message);
    }
  }

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (lErr || !tokenHash) return htmlError(lErr?.message ?? "로그인 토큰 생성 실패");

  const res = NextResponse.redirect(new URL("/portal", req.url));
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

function htmlError(message: string) {
  const body = `<!doctype html><meta charset="utf-8"><title>거래처 포털 로그인</title>
<body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa;margin:0">
<div style="text-align:center;padding:24px;border:1px solid #fecaca;background:#fff1f2;border-radius:16px;color:#9f1239;max-width:360px">
<div style="font-size:28px">⚠️</div>
<p style="margin:8px 0 16px;font-size:14px">${message}</p>
<button onclick="window.close()" style="padding:8px 16px;border:0;border-radius:8px;background:#111;color:#fff;font-size:13px;cursor:pointer">창 닫기</button>
</div></body>`;
  return new NextResponse(body, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
}
