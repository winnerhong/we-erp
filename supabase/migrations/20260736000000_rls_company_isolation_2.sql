-- =============================================================
-- B-3b Stage 2 — 잔여 company_id 테이블에 회사 멤버십 SELECT 정책 확대.
--   (Stage 1 20260734 과 동일 패턴. user_can_access_company 함수 재사용)
--   ※ students 는 company_id 가 항상 null(전역 동기화)이라 실질 제한은 없으나 인증은 요구됨.
-- =============================================================
do $$
declare
  t   text;
  pol text;
  has_col boolean;
  -- ※ 실재 테이블만. (초기 목록의 documents/asset_categories/payroll_items 는
  --    존재하지 않는 이름이라 has_col=false 로 건너뛰어졌음 → 목록에서 제거해 정합성 유지.
  --    실제 문서=document_issues, 급여=payrolls, 자산카테고리=field_options 는 Stage1(20260734)에서 커버됨.)
  tables text[] := array[
    'notices','students','tasks','employment_certificates',
    'library_files','audit_logs'
  ];
begin
  foreach t in array tables loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'company_id'
    ) into has_col;
    if not has_col then
      continue;
    end if;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format(
      'create policy %I on public.%I for select using (user_can_access_company(company_id))',
      t || '_company_select', t
    );
  end loop;
end $$;

-- 롤백: 20260734 하단 주석의 롤백 블록에 위 9개 테이블을 추가해 실행.
