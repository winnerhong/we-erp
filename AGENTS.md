<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.x) has breaking changes — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code.
<!-- END:nextjs-agent-rules -->

# 위너 통합 ERP — 컨벤션

- 스택: Next.js 16 (App Router) + React 19 + Supabase(직접 호출, Prisma 없음) + Tailwind v4 + TypeScript.
- 라우트 보호: `src/proxy.ts`(`export async function proxy` + `config.matcher`). Next 16에서 `middleware.ts`는 폐지 → `proxy.ts` 사용.
- DB 스키마 = `supabase/migrations/*.sql`. 변경 시 `src/lib/supabase/database.types.ts` 도 손으로 동기화.
- Supabase 클라이언트: 읽기는 `lib/supabase/server.ts`(anon), RLS 우회 쓰기는 `lib/supabase/admin.ts`(service role, 서버 전용).
- 모든 거래성 데이터는 `company_id` 로 사업자 귀속. 활성 사업자는 `lib/active-company.ts`(쿠키 `erp_company`)로 관리.
- CSV 일괄등록 로직의 단일 소스 = `lib/import-specs.ts` (클라 미리보기 + 서버 재검증 공유).
- 화면: `app/(erp)/` 라우트 그룹 안. 서버 페이지가 데이터를 받아 `*-client.tsx` 래퍼에 넘김(렌더 함수는 클라이언트에서 정의).
- 한글 주석·라벨 사용.
- 개발: `npm run dev` (포트 1100).

# Phase 진행
- [x] Phase 0 — 기초 등록(사업자/거래처/직원/계정과목) + CSV 일괄등록 + 사업자 선택/대시보드
- [x] Phase 1 — 영수증 OCR (업로드→Claude vision 판독→검수→확정). lib/ocr.ts, /receipts, receipts 테이블+버킷. ANTHROPIC_API_KEY 필요(없으면 수기입력). 모델 ERP_OCR_MODEL(기본 claude-opus-4-8)
- [x] Phase 2 — 세금계산서 매출/매입 수발행. /tax-invoices, tax_invoices 테이블. 월별 부가세 요약(매출세액-매입세액). 영수증(증빙=세금계산서) 확정 시 매입으로 자동 연결(confirmReceipt→upsert, receipt_id unique)
- [x] Phase 3 — 구매 요청·결제. /purchases, purchase_requests 테이블. 요청→승인/반려/보류→구매완료(결제자·수단 기록). 링크 붙여넣기 OG 미리보기(lib/link-preview.ts). 소액 자동승인(AUTO_APPROVE_LIMIT=50000). 결제는 사람이 하고 완료만 기록(자동결제 안 함)
- [x] Phase 4 — 급여·인사. /hr(휴가·연차 / 급여 탭), leave_requests·payrolls 테이블. lib/payroll.ts(연차 자동발생 한국노동법 개근가정, 4대보험 추정). 휴가 신청→승인→연차차감. 급여대장 자동생성+CSV. ⚠️ 공제는 추정치(간이세액표 미반영)
- [x] Phase 5a — 통합 대시보드. app/(erp)/page.tsx 실데이터(이번달 지출·부가세·미처리·기초현황 + 전체보기 시 사업자별 표)
- [x] Phase 5b — 인증 + 권한. Supabase Auth 로그인(/login), 미들웨어 라우트보호, profiles 테이블(role ADMIN/MEMBER). RLS=로그인 사용자 SELECT 전용으로 교체(쓰기는 service-role+액션가드). 기초등록 액션=ensureAdmin, 운영 액션=ensureUser. /admin/users(관리자 사용자관리). 초기 관리자=scripts/create-admin.mjs

> ✅ 인증 적용됨. 모든 라우트는 로그인 필요(미들웨어). 쓰기 보안은 서버액션의 ensureUser/ensureAdmin가 담당(쓰기는 service-role이라 RLS 우회 — 액션 가드가 유일 방어선, 신규 쓰기 액션 추가 시 반드시 가드 호출).
> 부트스트랩 순서: 마이그레이션 0~5 적용 → `node scripts/create-admin.mjs <email> <pw> <name>` → /login.
