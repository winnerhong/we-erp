"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company-constants";

/** 헤더 드롭다운에서 활성 사업자를 변경한다. */
export async function setActiveCompany(value: string) {
  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
