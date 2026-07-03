-- =============================================================
-- 성능 인덱스 보강 — 감사(적대적 검증)에서 확인된 핫패스 풀스캔 제거.
--   모두 create index if not exists → 재실행·부분적용 안전.
-- =============================================================

-- 1) 강사별 수업조회(직원 마이페이지 /me): transactions.instructor_id 로 필터하는데
--    기존 인덱스((partner_id,txn_date)/(contract_id)/(company_id,type,txn_date))가 못 쓰여 전 사업자 풀스캔.
create index if not exists idx_transactions_instructor on public.transactions(instructor_id, txn_date);

-- 2) 거래처 상세(/partners): tax_invoices/receipts 를 partner_id 로 조회하나 인덱스 없음 → 매 선택마다 전량 스캔.
create index if not exists idx_tax_invoices_partner on public.tax_invoices(partner_id);
create index if not exists idx_receipts_partner on public.receipts(partner_id);

-- 3) 목록 정렬(created_at desc)이 인덱스 없이 사업자 전체를 정렬하던 화면들.
create index if not exists idx_receipts_company_created on public.receipts(company_id, created_at desc);
create index if not exists idx_purchases_company_created on public.purchase_requests(company_id, created_at desc);

-- 4) 대시보드 미수/미지급(연령분석): 미정산(settled_at is null) 부분 인덱스로 aging 스캔 축소.
create index if not exists idx_tax_invoices_unsettled on public.tax_invoices(company_id) where settled_at is null;

-- 5) 세금계산서 월별 범위조회: 기존 (company_id, type, doc_date) 는 type 이 중간이라 doc_date 범위/정렬에 부적합.
create index if not exists idx_tax_invoices_company_date on public.tax_invoices(company_id, doc_date);
