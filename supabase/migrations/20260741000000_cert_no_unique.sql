-- =============================================================
-- 재직증명 발급번호 유일성 — 동시 발급 시 같은 번호 중복 방지.
--   앱에서 '올해 발급건수+1'로 번호를 매기는데, 동시 요청이 같은 count 를 읽어 중복될 수 있었음.
--   (company_id, cert_no) 유니크 인덱스 + 앱의 충돌 재시도로 해결.
--   ※ 이미 중복이 있으면 인덱스 생성이 실패하므로, 실패 시 중복 정리 후 재실행.
-- =============================================================
create unique index if not exists uq_emp_cert_company_no on employment_certificates(company_id, cert_no);

-- 롤백: drop index if exists uq_emp_cert_company_no;
