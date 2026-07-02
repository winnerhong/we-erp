"use client";

import { useRef, useState, type ReactNode } from "react";

export interface PreviewField {
  label: string;
  value: string;
}
export interface PreviewData {
  photoUrl?: string | null;
  initial?: string; // 사진 없을 때 대체 글자
  title: string;
  subtitle?: string | null;
  badge?: { label: string; tone?: string } | null;
  fields?: PreviewField[];
}

const TONE: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700",
  emerald: "bg-emerald-100 text-emerald-700",
  red: "bg-rose-100 text-rose-700",
  rose: "bg-rose-100 text-rose-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  indigo: "bg-indigo-100 text-indigo-700",
  neutral: "bg-neutral-100 text-neutral-600",
};

const CARD_W = 264;
const CARD_H = 240;

/** 목록 항목에 마우스를 올리면 사진·주요정보 미리보기 팝오버를 띄우는 래퍼. */
export function HoverPreview({
  data,
  children,
  className = "",
}: {
  data: PreviewData;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function enter() {
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.right + 10;
      if (left + CARD_W > window.innerWidth - 8) left = r.left - CARD_W - 10; // 오른쪽 넘치면 왼쪽으로
      if (left < 8) left = 8;
      let top = r.top;
      if (top + CARD_H > window.innerHeight - 8) top = window.innerHeight - CARD_H - 8;
      if (top < 8) top = 8;
      setPos({ top, left });
    }, 220);
  }
  function leave() {
    window.clearTimeout(timer.current);
    setPos(null);
  }

  return (
    <div ref={ref} onMouseEnter={enter} onMouseLeave={leave} className={className}>
      {children}
      {pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: CARD_W }}
          className="pointer-events-none z-[60] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        >
          <div className="flex items-center gap-3 bg-gradient-to-br from-indigo-500 to-violet-500 p-3.5 text-white">
            {data.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-2 ring-white/40" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/90 text-xl font-bold text-neutral-500">
                {data.initial ?? data.title.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-base font-bold">{data.title}</span>
                {data.badge && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TONE[data.badge.tone ?? "neutral"] ?? TONE.neutral}`}>
                    {data.badge.label}
                  </span>
                )}
              </div>
              {data.subtitle && <p className="truncate text-xs text-white/75">{data.subtitle}</p>}
            </div>
          </div>
          {data.fields && data.fields.length > 0 && (
            <dl className="divide-y divide-neutral-50 px-3.5 py-1 text-sm">
              {data.fields.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="shrink-0 text-xs text-neutral-400">{f.label}</dt>
                  <dd className="min-w-0 truncate font-medium text-neutral-700">{f.value || "-"}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
