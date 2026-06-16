# 위너 통합 ERP

사업자 여러 개를 한 곳에서 관리하는 통합 ERP. 영수증 OCR · 세금계산서 · 급여·인사 · 구매 · 거래처 관리.

## 현재 단계: Phase 0 — 기초 등록
- 사업자 / 거래처 / 직원 / 계정과목 등록 (CRUD)
- CSV 일괄등록 (양식 다운로드 → 작성 → 업로드·검증·미리보기 → 확정)
- 상단 드롭다운으로 사업자 선택 / 전체 합산 보기
- 사업자별 현황 대시보드

## 셋업
1. 의존성 설치
   ```
   npm install
   ```
2. Supabase 프로젝트 생성 후 `.env.local.example` → `.env.local` 복사 후 값 채우기
3. DB 마이그레이션 적용 — `supabase/migrations/20260530000000_phase0_foundation.sql`
   - Supabase CLI: `supabase db push`
   - 또는 대시보드 SQL Editor 에 붙여넣기 실행
4. 개발 서버
   ```
   npm run dev
   ```
   → http://localhost:1100

## 스택
Next.js 16 · React 19 · Supabase(PostgreSQL) · Tailwind v4 · TypeScript

자세한 컨벤션·Phase 로드맵은 [AGENTS.md](AGENTS.md) 참고.
