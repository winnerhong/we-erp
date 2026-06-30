// 알림 발송(솔라피) 연동 훅 — 키 준비 전까지 env-gated 스텁.
//   SOLAPI_API_KEY / SOLAPI_API_SECRET 이 있으면 실제 발송 로직을 붙인다(추후).
//   지금은 키 없으면 게시판 발행만 하고 발송은 건너뜀.

export function isSolapiConfigured(): boolean {
  return !!process.env.SOLAPI_API_KEY && !!process.env.SOLAPI_API_SECRET;
}

export interface SendResult {
  sent: number;
  skipped: boolean;
  error?: string;
}

/**
 * 알림톡/SMS 발송(스텁). 키 없으면 skipped=true 로 반환.
 * recipients: 수신 전화번호 배열. text: 메시지 본문.
 */
export async function sendAlimtalk(recipients: string[], text: string): Promise<SendResult> {
  void text;
  if (!isSolapiConfigured()) return { sent: 0, skipped: true };
  // TODO: 솔라피 SDK 연동(키 준비 시). 현재는 미구현 → 안전하게 skip.
  return { sent: 0, skipped: true, error: "솔라피 연동 미구현(키만 감지)" };
}
