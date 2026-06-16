"use client";

import Link from "next/link";

/** 통장원장 ↔ 매입·매출을 하나로 묶는 상단 탭. */
export function BankTradeTabs({ active }: { active: "bank" | "trade" }) {
  const tabs = [
    { key: "bank", href: "/bank", label: "🏦 통장 거래내역" },
    { key: "trade", href: "/trade", label: "📈 매입·매출 / 부가세" },
  ] as const;
  return (
    <div className="mb-4 flex gap-1 border-b border-neutral-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            active === t.key
              ? "-mb-px border-b-2 border-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-900"
              : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-800"
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
