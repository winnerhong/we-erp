-- =============================================================
-- 직원 외부 가져오기 지원 (winner-kids 강사 → 직원)
--   강사는 특정 사업자에 묶지 않고 미배정(공용)으로 들어와 이동 가능하도록
--   company_id 를 선택값(NULL 허용)으로 변경. source_ref 로 재동기화.
-- =============================================================

-- 소속 사업자 미배정(공용) 허용
alter table employees alter column company_id drop not null;

-- 외부 출처 추적 (재실행 시 중복 없이 upsert)
alter table employees add column if not exists source_ref text;
create unique index if not exists uq_employees_source_ref on employees(source_ref);
