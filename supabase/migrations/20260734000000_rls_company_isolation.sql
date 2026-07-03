-- =============================================================
-- B-3b · 회사 데이터 격리 (RLS 읽기 정책) — 중앙 함수로 멤버십 판정.
--   ADMIN·공용(company_id null)·미배정 사용자는 전체 허용(하위호환),
--   배정된 사용자는 담당 회사만 SELECT.
--   ※ 쓰기는 service-role(RLS 우회)이라 앱 액션가드(ensureCompanyAccess)가 담당.
--   ※ 롤백: 파일 하단 주석 참고.
-- =============================================================

-- 1) 멤버십 판정 함수(security definer — profiles/user_companies 를 RLS 무관하게 읽음)
create or replace function user_can_access_company(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null   -- 미인증(anon)은 차단(공개 anon 키 노출 방지)
    and (
      cid is null
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN')
      or not exists (select 1 from user_companies uc where uc.user_id = auth.uid())
      or exists (select 1 from user_companies uc where uc.user_id = auth.uid() and uc.company_id = cid)
    );
$$;
grant execute on function user_can_access_company(uuid) to authenticated, anon;

-- 2) company_id 가 있는 테이블의 기존 정책을 회사 멤버십 SELECT 정책으로 교체.
--    (컬럼 없는 테이블은 자동 건너뜀. 쓰기 정책은 제거 — 앱은 service-role 로만 씀)
do $$
declare
  t   text;
  pol text;
  has_col boolean;
  tables text[] := array[
    'partners','employees','tax_invoices','receipts','bank_accounts','bank_transactions',
    'bank_txn_groups','cards','card_transactions','purchase_requests','paybacks','contracts',
    'transactions','settlements','assets','asset_movements','payrolls','leave_requests',
    'attendance','daily_records','document_issues','partner_attachments','approvals','period_locks'
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
    -- 기존 정책 전부 제거
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    -- 회사 멤버십 SELECT 정책
    execute format(
      'create policy %I on public.%I for select using (user_can_access_company(company_id))',
      t || '_company_select', t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 롤백(원복)이 필요하면 아래를 실행:
--   do $$ declare t text; tables text[] := array['partners','employees','tax_invoices',
--     'receipts','bank_accounts','bank_transactions','bank_txn_groups','cards','card_transactions',
--     'purchase_requests','paybacks','contracts','transactions','settlements','assets','asset_movements',
--     'payrolls','leave_requests','attendance','daily_records','document_issues','partner_attachments',
--     'approvals','period_locks'];
--   begin foreach t in array tables loop
--     execute format('drop policy if exists %I on public.%I', t||'_company_select', t);
--     execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', t||'_auth_select', t);
--   end loop; end $$;
-- ─────────────────────────────────────────────────────────────
