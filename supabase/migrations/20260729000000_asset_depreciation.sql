-- =============================================================
-- 고정자산 감가상각 — 교구를 자산으로 취득가·내용연수·잔존가치로 등록해 월 상각/장부가 계산.
--  - purchase_price(취득가)·purchase_date(취득일)는 기존 컬럼 재사용.
--  - 정액법(STRAIGHT) 기준. 계산은 앱에서 as-of 로 산출(별도 스케줄 테이블 없이).
-- =============================================================
alter table assets add column if not exists useful_life_months  integer;         -- 내용연수(개월)
alter table assets add column if not exists salvage_value       numeric;         -- 잔존가치
alter table assets add column if not exists depreciation_method text default 'STRAIGHT'; -- STRAIGHT(정액법)
