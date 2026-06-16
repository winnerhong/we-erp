// 최초 관리자 계정 생성 (1회용).
//   사용: node scripts/create-admin.mjs <이메일> <비밀번호> [이름]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.error("사용법: node scripts/create-admin.mjs <이메일> <비밀번호> [이름]");
  process.exit(1);
}

const env = loadEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) {
  console.error("✗ 계정 생성 실패:", error.message);
  process.exit(2);
}

const { error: pErr } = await db.from("profiles").upsert({
  id: data.user.id,
  email,
  name: name ?? null,
  role: "ADMIN",
  is_active: true,
});
if (pErr) {
  console.error("✗ 프로필 생성 실패:", pErr.message);
  process.exit(3);
}

console.log(`✅ 관리자 생성 완료: ${email}\n이제 /login 에서 로그인하세요.`);
