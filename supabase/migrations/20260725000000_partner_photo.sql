-- 거래처 사진(로고) — 직원 photo_url 방식과 동일하게 data URL(base64)로 저장(버킷 미사용).
alter table partners add column if not exists photo_url text;
