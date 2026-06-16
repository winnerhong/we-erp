-- =============================================================
-- 통장 구분(category) → 거래처/직원 연동
--   · field_options.link_type : 구분이 어떤 대상과 연결되는지 ('partner' | 'employee' | null)
--   · bank_transactions.employee_id : 연동된 직원
--   · bank_transactions.payroll_id  : 자동 생성/연결된 급여(payrolls)
-- =============================================================

alter table field_options add column if not exists link_type text;   -- null=거래처(기본) | 'employee'=직원

alter table bank_transactions add column if not exists employee_id uuid references employees(id) on delete set null;
alter table bank_transactions add column if not exists payroll_id  uuid references payrolls(id)  on delete set null;
create index if not exists bank_txn_employee_idx on bank_transactions (employee_id);

-- 흔한 급여성 구분은 자동으로 '직원' 연동으로 설정(기존 데이터 한정, 사용자 변경 가능)
update field_options
   set link_type = 'employee'
 where category = 'bank_category'
   and link_type is null
   and (
        label like '%급여%' or label like '%상여%' or label like '%급료%'
     or label like '%임금%' or label like '%월급%'
     or value like '%급여%'
   );
