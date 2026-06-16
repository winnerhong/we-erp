-- =============================================================
-- 재직증명서 발급·이력
--   직원 정보를 스냅샷으로 저장(이후 직원 변경/삭제에도 증명서는 그대로).
--   회사 정보는 발급 시점의 사업자(company_id)에서 인쇄 시 가져옴.
-- =============================================================

create table if not exists employment_certificates (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  employee_id      uuid references employees(id) on delete set null,
  cert_no          text not null,                         -- 발급번호 (예: 2026-001)
  issued_on        date not null default current_date,    -- 발급일

  employee_name    text not null,                         -- 성명(스냅샷)
  birth            text,                                  -- 생년월일/주민등록번호
  address          text,                                  -- 주소
  department       text,                                  -- 부서
  position         text,                                  -- 직위
  employment_type  text,                                  -- 고용형태(스냅샷)
  hired_on         date,                                  -- 입사일(스냅샷)
  purpose          text,                                  -- 용도/발급목적
  submit_to        text,                                  -- 제출처

  memo             text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_emp_cert_company on employment_certificates(company_id, issued_on);

alter table employment_certificates enable row level security;
do $$ begin
  drop policy if exists emp_cert_select_auth on employment_certificates;
  create policy emp_cert_select_auth on employment_certificates
    for select using (auth.role() = 'authenticated');
end $$;
