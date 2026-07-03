"use client";

import { useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// 번호 매겨진 폼 섹션 카드 (등록/수정 모달용 — 깔끔한 구획)
export function FormSection({
  no,
  title,
  desc,
  children,
}: {
  no: number;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white">
          {no}
        </span>
        <h4 className="text-sm font-semibold text-neutral-800">{title}</h4>
        {desc && <span className="ml-auto text-xs text-neutral-400">{desc}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">{children}</div>
    </section>
  );
}

const inputCls =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/** 입력 문자열을 천단위 콤마로 포맷(소수점·음수 보존). 예: "75000" → "75,000" */
export function formatThousands(s: string): string {
  const neg = s.trim().startsWith("-");
  const cleaned = s.replace(/[^\d.]/g, "");
  if (cleaned === "") return neg ? "-" : "";
  const dot = cleaned.indexOf(".");
  const intRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const decRaw = dot === -1 ? "" : "." + cleaned.slice(dot + 1).replace(/\./g, "");
  const intFmt = intRaw === "" ? "" : Number(intRaw).toLocaleString("en-US");
  return (neg ? "-" : "") + intFmt + decRaw;
}

/**
 * 금액·수량 입력칸 — 화면엔 천단위 콤마로 보이고, onChange 로는 콤마 없는 순수 숫자열을 넘긴다.
 * (기존 저장 로직이 그대로 동작하도록 raw 값을 emit)
 */
export function NumberInput({
  value,
  onChange,
  className = "",
  ...rest
}: {
  value: string;
  onChange: (raw: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={formatThousands(value ?? "")}
      onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
      className={`${inputCls} ${className}`}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/** 보기 좋은 파일 선택 버튼 — 기본 input 대신 라벨 버튼 + 선택 파일명 표시. */
export function FileButton({
  accept,
  onFile,
  label = "파일 선택",
  className = "",
}: {
  accept?: string;
  onFile: (file: File) => void;
  label?: string;
  className?: string;
}) {
  const [name, setName] = useState<string | null>(null);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
        <span>📎</span>
        <span>{label}</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setName(f.name);
              onFile(f);
            }
            e.target.value = "";
          }}
        />
      </label>
      {name ? (
        <span className="max-w-[200px] truncate text-xs text-emerald-600" title={name}>✓ {name}</span>
      ) : (
        <span className="text-xs text-neutral-400">선택된 파일 없음</span>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-neutral-400">{message}</div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "blue" | "amber" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-600",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
