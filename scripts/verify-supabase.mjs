// Supabase 연결 + 마이그레이션 적용 여부 검증.
//   사용: node scripts/verify-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local 수동 로드 (node는 자동 로드 안 함)
function loadEnv() {
  const env = {};
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
    }
  } catch {
    console.error("✗ .env.local 을 읽을 수 없습니다.");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("✗ .env.local 의 3개 값(URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY)을 모두 채워주세요.");
  process.exit(1);
}
console.log("• URL:", url);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = ["companies", "accounts", "partners", "employees", "receipts"];
let ok = true;
for (const t of TABLES) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`✗ ${t}: ${error.message}`);
    ok = false;
  } else {
    console.log(`✓ ${t}: ${count}건`);
  }
}

// Storage 버킷
const { data: buckets } = await db.storage.listBuckets();
if (buckets?.some((b) => b.id === "receipts")) {
  console.log("✓ storage 버킷 'receipts'");
} else {
  console.log("✗ storage 버킷 'receipts' 없음");
  ok = false;
}

if (ok) {
  console.log("\n✅ 연결 OK · 테이블 5개 + receipts 버킷 모두 존재. npm run dev 로 띄우세요.");
} else {
  console.log("\n⚠️ 누락 항목이 있습니다. Phase 1 마이그레이션 SQL을 적용했는지 확인하세요.");
  process.exit(2);
}
