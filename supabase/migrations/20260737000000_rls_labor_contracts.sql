-- =============================================================
-- B-3b 보강 — 잔여 최고민감 테이블 labor_contracts(근로계약·기본급/시급) 회사 격리.
--   Stage 1/2 목록에서 누락되어 permissive `auth.role()='authenticated'` 정책이 남아
--   있었음 → user_can_access_company(company_id) 멤버십 SELECT 정책으로 교체.
--   (idempotent: 기존 정책 전부 drop 후 재생성. 이미 적용된 DB·신규 설치 모두 안전)
--   ※ 실질 격리를 위해선 company_id 가 채워져야 함 → hr/actions.ts createContract 가
--     직원 소속 사업자로 company_id 를 보정하도록 함께 수정됨.
-- =============================================================
do $$
declare
  pol text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'labor_contracts' and column_name = 'company_id'
  ) then
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'labor_contracts' loop
      execute format('drop policy %I on public.labor_contracts', pol);
    end loop;
    execute 'create policy labor_contracts_company_select on public.labor_contracts for select using (user_can_access_company(company_id))';
  end if;
end $$;

-- 롤백: drop policy labor_contracts_company_select on public.labor_contracts;
--       create policy labor_contracts_all_authenticated on public.labor_contracts
--         for select using (auth.role() = 'authenticated');
