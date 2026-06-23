// 서류 기능 통합 스모크 테스트 — 직원·사업자 연동, 발행/조회/인쇄/삭제, 토큰 무결성.
// 실행: node scripts/test-documents.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// lib/document-vars.ts 의 자동변수 토큰 목록(검증용 복제)
const AUTO = new Set(["직원명","닉네임","생년월일","주민등록번호","주소","연락처","이메일","입사일","고용형태","직급","직책","기본급","시급","근무요일","근무시간","은행명","계좌번호","예금주","회사명","사업자번호","대표자","회사주소","업태","업종","오늘날짜"]);
const tokensOf = (s) => [...new Set([...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1].trim()))];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✅", m); } else { fail++; console.log("  ❌", m); } };

console.log("\n[1] 양식 로드 + 토큰/HTML 무결성");
const { data: tpls, error: e1 } = await db.from("document_templates").select("*").eq("is_active", true).order("sort_order");
ok(!e1, `양식 조회 (${tpls?.length ?? 0}건)`);
for (const t of tpls ?? []) {
  const body = t.body ?? "";
  const opens = (body.match(/\{\{/g) || []).length;
  const closes = (body.match(/\}\}/g) || []).length;
  const balanced = opens === closes;
  // 표 태그 균형
  const tdBal = (body.match(/<td/g) || []).length === (body.match(/<\/td>/g) || []).length;
  const trBal = (body.match(/<tr/g) || []).length === (body.match(/<\/tr>/g) || []).length;
  const toks = tokensOf(body);
  const manual = toks.filter((x) => !AUTO.has(x));
  ok(balanced && tdBal && trBal, `「${t.name}」 토큰/표 균형 OK · 변수 ${toks.length}(자동 ${toks.length - manual.length}/입력 ${manual.length})`);
}

console.log("\n[2] 직원·사업자 연동");
const { data: emps } = await db.from("employees").select("id, name, company_id").not("company_id", "is", null).limit(1);
const emp = emps?.[0] ?? (await db.from("employees").select("id, name, company_id").limit(1)).data?.[0];
ok(!!emp, `테스트 직원: ${emp?.name ?? "(없음)"}`);
let companyName = null;
if (emp?.company_id) {
  const { data: co } = await db.from("companies").select("name, biz_no, ceo_name").eq("id", emp.company_id).maybeSingle();
  companyName = co?.name ?? null;
  ok(!!co, `소속 사업자: ${companyName} (대표 ${co?.ceo_name ?? "-"})`);
}

console.log("\n[3] 발행본 라이프사이클 (발행→조회→인쇄→서명→삭제)");
const tpl = (tpls ?? [])[0];
const rendered = (tpl?.body ?? "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, r) => (r.trim() === "직원명" ? emp.name : "○○"));
const { data: ins, error: e3 } = await db.from("document_issues").insert({
  template_id: tpl.id, company_id: emp.company_id, employee_id: emp.id,
  title: tpl.name, rendered_body: rendered, field_values: { 근무장소: "본사", 담당업무: "테스트" },
  status: "ISSUED",
}).select("id").single();
ok(!e3 && ins?.id, "발행(insert)");
const id = ins?.id;

// 발행이력 overview 쿼리 (employees 조인 흉내)
const { data: ov, error: eo } = await db.from("document_issues").select("id, title, status, issued_on, signed_file, employee_id").eq("id", id).single();
ok(!eo && ov?.title === tpl.name, "발행이력 조회 + 직원ID 매핑");

// /me 본인 서류 쿼리
const { data: mine, error: em } = await db.from("document_issues").select("*").eq("employee_id", emp.id).eq("id", id);
ok(!em && mine?.length === 1, "/me 본인 서류 조회 (employee_id 필터)");

// 인쇄 페이지 쿼리
const { data: pr, error: ep } = await db.from("document_issues").select("title, rendered_body").eq("id", id).maybeSingle();
ok(!ep && pr?.rendered_body?.includes(emp.name), "인쇄 페이지 데이터(렌더 스냅샷에 직원명 치환됨)");

// 서명본 첨부
const { error: es } = await db.from("document_issues").update({ signed_file: "data:text/plain;base64,QUJD", status: "SIGNED", signed_on: "2026-06-23" }).eq("id", id);
ok(!es, "서명본 첨부 + 상태 SIGNED");
const { data: signed } = await db.from("document_issues").select("status, signed_file").eq("id", id).single();
ok(signed?.status === "SIGNED" && !!signed?.signed_file, "서명완료 상태 확인");

// 삭제
const { error: ed } = await db.from("document_issues").delete().eq("id", id);
ok(!ed, "발행본 삭제");

console.log("\n[4] 양식 삭제 시 발행본 보존 (on delete set null) — 모의");
const { data: tmpTpl } = await db.from("document_templates").insert({ name: "__테스트양식__", body: "<p>{{직원명}}</p>" }).select("id").single();
const { data: tmpIssue } = await db.from("document_issues").insert({ template_id: tmpTpl.id, employee_id: emp.id, title: "__임시__", rendered_body: "x" }).select("id").single();
await db.from("document_templates").delete().eq("id", tmpTpl.id);
const { data: orphan } = await db.from("document_issues").select("template_id").eq("id", tmpIssue.id).single();
ok(orphan && orphan.template_id === null, "양식 삭제 후 발행본 유지 + template_id=null");
await db.from("document_issues").delete().eq("id", tmpIssue.id);

console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
