import Anthropic from "@anthropic-ai/sdk";
import type { PaymentMethod, EvidenceType } from "./supabase/database.types";

// 영수증 OCR — Claude vision. 서버 전용(API 키 사용).
// 모델은 기본 claude-opus-4-8, ERP_OCR_MODEL 로 교체 가능(비용 레버).

export interface OcrResult {
  vendor_name: string | null;
  biz_no: string | null;
  doc_date: string | null; // YYYY-MM-DD
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  payment_method: PaymentMethod | null;
  evidence_type: EvidenceType | null;
  account_code: string | null; // 제안 계정과목 코드 (제공 목록 중)
  confidence: number | null; // 0~1
}

export function isOcrConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ERP_OCR_MODEL || "claude-opus-4-8";

// 시스템 프롬프트는 요청 간 고정 → 프롬프트 캐시 대상.
const SYSTEM = `당신은 한국 영수증·세금계산서·카드전표를 판독하는 회계 보조원입니다.
업로드된 이미지에서 다음 항목을 정확히 추출해 JSON으로만 응답하세요.

규칙:
- 금액은 숫자만(원 단위 정수, 콤마/원 제거). 못 읽으면 null.
- doc_date 는 YYYY-MM-DD. 연도가 없으면 추론하지 말고 null.
- 공급가액(supply_amount)+부가세(vat_amount)=합계(total_amount)가 맞는지 검토.
  부가세 표기가 없고 면세/간이로 보이면 vat_amount=0 또는 null.
- payment_method: CARD(카드) / CASH(현금) / TRANSFER(계좌이체) / OTHER.
- evidence_type: TAX_INVOICE(세금계산서) / CARD_SALES_SLIP(카드매출전표) /
  CASH_RECEIPT(현금영수증) / SIMPLE_RECEIPT(간이영수증·일반영수증) / OTHER.
- account_code: 아래 사용자가 제공한 계정과목 목록 중 가장 적합한 코드 하나. 애매하면 null.
- confidence: 전체 판독 확신도 0~1.
- 보이지 않거나 불확실한 값은 추측하지 말고 null.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendor_name: { type: ["string", "null"] },
    biz_no: { type: ["string", "null"] },
    doc_date: { type: ["string", "null"] },
    supply_amount: { type: ["integer", "null"] },
    vat_amount: { type: ["integer", "null"] },
    total_amount: { type: ["integer", "null"] },
    payment_method: {
      type: ["string", "null"],
      enum: ["CARD", "CASH", "TRANSFER", "OTHER", null],
    },
    evidence_type: {
      type: ["string", "null"],
      enum: [
        "TAX_INVOICE",
        "CARD_SALES_SLIP",
        "CASH_RECEIPT",
        "SIMPLE_RECEIPT",
        "OTHER",
        null,
      ],
    },
    account_code: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
  },
  required: [
    "vendor_name",
    "biz_no",
    "doc_date",
    "supply_amount",
    "vat_amount",
    "total_amount",
    "payment_method",
    "evidence_type",
    "account_code",
    "confidence",
  ],
} as const;

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function mediaTypeFromName(name: string): MediaType | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return null;
}

/** 영수증 이미지 1장 → 구조화 추출. */
export async function runReceiptOcr(
  base64Image: string,
  mediaType: MediaType,
  accounts: { code: string; name: string }[]
): Promise<OcrResult> {
  const client = new Anthropic();

  const acctList =
    accounts.length > 0
      ? accounts.map((a) => `${a.code}: ${a.name}`).join("\n")
      : "(등록된 계정과목 없음)";

  // output_config(구조화 출력)는 현재 SDK 타입에 아직 없어 캐스팅으로 전달.
  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    output_config: {
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image },
          },
          {
            type: "text",
            text: `계정과목 목록(코드: 이름):\n${acctList}\n\n위 영수증을 판독해 JSON으로 응답하세요.`,
          },
        ],
      },
    ],
  };

  const response = await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("OCR 응답에 텍스트가 없습니다");
  }
  return JSON.parse(textBlock.text) as OcrResult;
}
