// 옵션 색상 톤 (선택 가능한 색 + 클래스 매핑). 클라/서버 공용 상수.
export const TONES = [
  "neutral",
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "sky",
  "indigo",
  "teal",
  "pink",
  "orange",
] as const;

export type Tone = (typeof TONES)[number];

export const TONE_CLASS: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-600 border-neutral-300",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300",
  blue: "bg-blue-50 text-blue-700 border-blue-300",
  violet: "bg-violet-50 text-violet-700 border-violet-300",
  amber: "bg-amber-50 text-amber-700 border-amber-300",
  rose: "bg-rose-50 text-rose-700 border-rose-300",
  sky: "bg-sky-50 text-sky-700 border-sky-300",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-300",
  teal: "bg-teal-50 text-teal-700 border-teal-300",
  pink: "bg-pink-50 text-pink-700 border-pink-300",
  orange: "bg-orange-50 text-orange-700 border-orange-300",
};

export const toneClass = (c?: string | null) => TONE_CLASS[c ?? "neutral"] ?? TONE_CLASS.neutral;

// 색 선택용 진한 스와치(동그라미) 배경
export const TONE_SWATCH: Record<string, string> = {
  neutral: "bg-neutral-400",
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
};
