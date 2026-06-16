import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runWksSync, runTeacherSync } from "@/lib/wks-sync";

export const dynamic = "force-dynamic";

/**
 * winner-kids → 거래처 자동 동기화 (서버 크론용).
 * Vercel Cron 이 `Authorization: Bearer <CRON_SECRET>` 로 호출.
 * 앱 내 수동/자동 버튼은 이 라우트가 아니라 서버 액션(관리자)을 사용.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [partners, teachers] = await Promise.all([runWksSync(), runTeacherSync()]);
  revalidatePath("/partners");
  revalidatePath("/employees");
  revalidatePath("/");
  return NextResponse.json({
    ok: partners.ok && teachers.ok,
    partners,
    teachers,
  });
}
