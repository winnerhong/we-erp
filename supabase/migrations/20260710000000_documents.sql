-- =============================================================
-- 서류관리 — 자유서식 양식(템플릿) + 발행본(작성·서명)
--   양식은 전사 공용. 본문에 {{직원명}} 같은 변수를 끼워 넣어 재사용.
-- =============================================================

-- ---------- 서류 양식(전사 공용) ----------
create table if not exists document_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 양식 이름(예: 근로계약서)
  category    text,                          -- 분류(근로계약서/동의서/확약서/기타)
  body        text not null default '',      -- 본문(자유서식, {{변수}} 포함). 줄바꿈 보존
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 발행본(직원에게 발행·작성된 서류) ----------
create table if not exists document_issues (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid references document_templates(id) on delete set null,
  company_id    uuid references companies(id) on delete set null,
  employee_id   uuid references employees(id) on delete cascade,
  title         text not null,               -- 발행 제목(보통 양식명)
  rendered_body text not null default '',     -- 발행 시점 본문 스냅샷(변수 치환 완료)
  field_values  jsonb not null default '{}'::jsonb,  -- 사람이 채운 빈칸 값 {token: value}
  status        text not null default 'ISSUED' check (status in ('DRAFT','ISSUED','SIGNED')),
  signed_file   text,                         -- 서명본(이미지/PDF data URL 또는 링크)
  issued_on     date not null default current_date,
  signed_on     date,
  memo          text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_doc_issues_emp on document_issues (employee_id, issued_on);

-- ---------- RLS (로그인 사용자 SELECT 전용; 쓰기는 service-role + 액션 가드) ----------
alter table document_templates enable row level security;
alter table document_issues enable row level security;
do $$ begin
  drop policy if exists document_templates_select on document_templates;
  create policy document_templates_select on document_templates
    for select using (auth.role() = 'authenticated');
  drop policy if exists document_issues_select on document_issues;
  create policy document_issues_select on document_issues
    for select using (auth.role() = 'authenticated');
end $$;

-- ---------- 샘플 양식: 근로계약서 (표 형식 HTML) ----------
insert into document_templates (name, category, body, sort_order)
select '표준 근로계약서', '근로계약서',
$body$<h1>근로계약서</h1>
<p style="text-align:center">「근로기준법」에 의거하여 사업주와 근로자가 자유로운 의사에 따라 아래와 같이 근로계약을 체결한다.</p>
<table><tbody>
<tr><th style="width:18%">사업주(갑)</th><td style="width:32%">{{회사명}}</td><th style="width:18%">근로자(을)</th><td style="width:32%">{{직원명}}</td></tr>
<tr><th>대표자</th><td>{{대표자}}</td><th>생년월일</th><td>{{생년월일}}</td></tr>
<tr><th>사업자번호</th><td>{{사업자번호}}</td><th>연락처</th><td>{{연락처}}</td></tr>
<tr><th>사업장 주소</th><td>{{회사주소}}</td><th>주소</th><td>{{주소}}</td></tr>
</tbody></table>
<h2>제1조 (근로계약기간)</h2>
<p>{{계약시작일}} 부터 {{계약종료일}} 까지로 한다. (기간의 정함이 없는 경우 종료일 미기재)</p>
<h2>제2조 (근무장소 및 업무내용)</h2>
<table><tbody>
<tr><th style="width:18%">근무장소</th><td>{{근무장소}}</td></tr>
<tr><th>업무내용</th><td>{{담당업무}}</td></tr>
</tbody></table>
<h2>제3조 (근로시간 및 휴일)</h2>
<table><tbody>
<tr><th style="width:18%">소정근로시간</th><td>{{근무시간}}</td></tr>
<tr><th>근무일</th><td>매주 {{근무요일}} 근무</td></tr>
<tr><th>휴일</th><td>주휴일 매주 일요일 / 관공서 공휴일</td></tr>
</tbody></table>
<h2>제4조 (임금)</h2>
<table><tbody>
<tr><th style="width:18%">월(시간)급</th><td><strong>{{기본급}}</strong></td></tr>
<tr><th>지급일</th><td>매월 {{급여지급일}}</td></tr>
<tr><th>지급방법</th><td>근로자 명의 예금통장({{은행명}} {{계좌번호}})으로 입금</td></tr>
</tbody></table>
<h2>제5조 (사회보험)</h2>
<p>□ 고용보험 &nbsp;&nbsp; □ 산재보험 &nbsp;&nbsp; □ 국민연금 &nbsp;&nbsp; □ 건강보험 &nbsp; (해당란에 표기)</p>
<h2>제6조 (기타)</h2>
<p>이 계약에 정함이 없는 사항은 「근로기준법」 등 관계 법령 및 취업규칙에 따른다.</p>
<p>위 계약내용을 증명하기 위하여 계약서 2부를 작성하여 사업주와 근로자가 각각 서명·날인한 후 1부씩 보관한다.</p>
<p style="text-align:center"><strong>{{오늘날짜}}</strong></p>
<table><tbody>
<tr><th style="width:14%">사업주</th><td>상호 {{회사명}} &nbsp;/&nbsp; 대표 {{대표자}}</td><td style="width:20%;text-align:center">(서명 또는 인)</td></tr>
<tr><th>근로자</th><td>성명 {{직원명}}</td><td style="width:20%;text-align:center">(서명 또는 인)</td></tr>
</tbody></table>$body$, 1
where not exists (select 1 from document_templates where name = '표준 근로계약서');
