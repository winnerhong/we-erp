-- =============================================================
-- 멀티테넌시(대리업무) — 사업자를 자사(OWNED) / 수임업체(MANAGED)로 구분.
--  수임업체 = 세무·회계를 대리(BPO)하는 외부 사업자. 위임범위·계약기간·회사별 CorpNum.
-- =============================================================
alter table companies add column if not exists relation_type text not null default 'OWNED'; -- OWNED(자사) / MANAGED(수임)
alter table companies add column if not exists corp_num      text;          -- Popbill CorpNum(회사별 격리)
alter table companies add column if not exists managed_scope text[] default '{}'; -- 위임 항목(TAX/PAYROLL/BOOKKEEPING/SETTLE 등)
alter table companies add column if not exists managed_start date;          -- 수임 계약 시작
alter table companies add column if not exists managed_end   date;          -- 수임 계약 종료
alter table companies add column if not exists client_memo   text;          -- 수임 메모
create index if not exists idx_companies_relation on companies (relation_type);
