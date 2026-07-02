"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENUS } from "@/lib/menus";

export function SidebarNav({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();
  const allow = new Set(allowedHrefs);
  const items = MENUS.filter((m) => allow.has(m.href));

  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
              active
                ? "bg-indigo-500 font-semibold text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
