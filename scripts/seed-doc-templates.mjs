// 서류 샘플 양식 추가 시드(표 형식 HTML). 이름이 같은 양식이 없을 때만 생성.
// 실행: node scripts/seed-doc-templates.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 공급자(우리 회사) 정보 블록 — 견적/청구/명세 공용
const supplier = `<table><tbody>
<tr><th style="width:14%">공급자</th><th style="width:18%">등록번호</th><td>{{사업자번호}}</td><th style="width:14%">상호</th><td>{{회사명}}</td></tr>
<tr><th></th><th>대표자</th><td>{{대표자}}</td><th>업태/업종</th><td>{{업태}} / {{업종}}</td></tr>
<tr><th></th><th>주소</th><td colspan="3">{{회사주소}}</td></tr>
</tbody></table>`;

const receiver = `<table><tbody>
<tr><th style="width:14%">공급받는자</th><th style="width:18%">상호</th><td>{{공급받는자상호}}</td><th style="width:14%">대표자</th><td>{{공급받는자대표}}</td></tr>
<tr><th></th><th>등록번호</th><td>{{공급받는자번호}}</td><th>연락처</th><td>{{공급받는자연락처}}</td></tr>
<tr><th></th><th>주소</th><td colspan="3">{{공급받는자주소}}</td></tr>
</tbody></table>`;

const itemsTable = `<table><tbody>
<tr><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr>
<tr><td>{{품목1}}</td><td>{{규격1}}</td><td>{{수량1}}</td><td>{{단가1}}</td><td>{{금액1}}</td></tr>
<tr><td>{{품목2}}</td><td>{{규격2}}</td><td>{{수량2}}</td><td>{{단가2}}</td><td>{{금액2}}</td></tr>
<tr><td>{{품목3}}</td><td>{{규격3}}</td><td>{{수량3}}</td><td>{{단가3}}</td><td>{{금액3}}</td></tr>
<tr><th colspan="4" style="text-align:right">공급가액</th><td>{{공급가액}}</td></tr>
<tr><th colspan="4" style="text-align:right">부가세</th><td>{{부가세}}</td></tr>
<tr><th colspan="4" style="text-align:right">합계금액</th><td><strong>{{합계금액}}</strong></td></tr>
</tbody></table>`;

const sign2 = (gab, eul) => `<p style="text-align:center"><strong>{{오늘날짜}}</strong></p>
<table><tbody>
<tr><th style="width:14%">${gab.role}</th><td>${gab.body}</td><td style="width:20%;text-align:center">(서명 또는 인)</td></tr>
<tr><th>${eul.role}</th><td>${eul.body}</td><td style="width:20%;text-align:center">(서명 또는 인)</td></tr>
</tbody></table>`;

const templates = [
  {
    name: "프리랜서 계약서",
    category: "계약서",
    sort_order: 2,
    body:
`<h1>프리랜서 계약서</h1>
<p><strong>{{회사명}}</strong>(이하 “갑”)와(과) <strong>{{직원명}}</strong>(이하 “을”)은(는) 다음과 같이 용역(위탁) 계약을 체결한다.</p>
<table><tbody>
<tr><th style="width:16%">갑</th><td>{{회사명}}</td><th style="width:16%">을</th><td>{{직원명}}</td></tr>
<tr><th>대표자</th><td>{{대표자}}</td><th>생년월일</th><td>{{생년월일}}</td></tr>
<tr><th>사업자번호</th><td>{{사업자번호}}</td><th>연락처</th><td>{{연락처}}</td></tr>
<tr><th>주소</th><td>{{회사주소}}</td><th>주소</th><td>{{주소}}</td></tr>
</tbody></table>
<h2>제1조 (계약기간)</h2>
<p>{{계약시작일}} 부터 {{계약종료일}} 까지로 한다.</p>
<h2>제2조 (용역의 내용)</h2>
<p>{{용역내용}}</p>
<h2>제3조 (용역대금 및 지급)</h2>
<table><tbody>
<tr><th style="width:16%">용역대금</th><td><strong>{{용역대금}}</strong> (원천징수 3.3% 공제 후 지급)</td></tr>
<tr><th>지급일</th><td>{{대금지급일}}</td></tr>
<tr><th>지급방법</th><td>을 명의 계좌({{은행명}} {{계좌번호}}) 입금</td></tr>
</tbody></table>
<h2>제4조 (의무 및 비밀유지)</h2>
<p>을은 선량한 관리자의 주의로 용역을 수행하며, 업무상 알게 된 갑의 비밀을 계약 종료 후에도 누설하지 아니한다.</p>
<h2>제5조 (기타)</h2>
<p>이 계약에 정함이 없는 사항은 관계 법령 및 일반 상관례에 따른다.</p>
<p>본 계약을 증명하기 위하여 계약서 2부를 작성하여 갑과 을이 각각 서명·날인 후 1부씩 보관한다.</p>
` + sign2(
  { role: "갑", body: "상호 {{회사명}} &nbsp;/&nbsp; 대표 {{대표자}}" },
  { role: "을", body: "성명 {{직원명}}" }
),
  },
  {
    name: "행사 계약서",
    category: "계약서",
    sort_order: 3,
    body:
`<h1>행사 계약서</h1>
<p><strong>{{공급받는자상호}}</strong>(이하 “갑”)와(과) <strong>{{회사명}}</strong>(이하 “을”)은(는) 아래 행사의 진행에 관하여 다음과 같이 계약을 체결한다.</p>
<h2>제1조 (행사 개요)</h2>
<table><tbody>
<tr><th style="width:16%">행사명</th><td>{{행사명}}</td></tr>
<tr><th>행사일시</th><td>{{행사일자}} {{행사시간}}</td></tr>
<tr><th>행사장소</th><td>{{행사장소}}</td></tr>
<tr><th>업무범위</th><td>{{업무범위}}</td></tr>
</tbody></table>
<h2>제2조 (계약금액 및 지급)</h2>
<table><tbody>
<tr><th style="width:16%">총 계약금액</th><td><strong>{{계약금액}}</strong> (VAT 포함)</td></tr>
<tr><th>계약금</th><td>{{계약금}} (계약 시)</td></tr>
<tr><th>잔금</th><td>{{잔금}} (행사 완료 후)</td></tr>
<tr><th>입금계좌</th><td>{{입금계좌}}</td></tr>
</tbody></table>
<h2>제3조 (갑·을의 의무)</h2>
<p>을은 약정한 내용에 따라 성실히 행사를 수행하고, 갑은 원활한 진행을 위하여 필요한 사항을 협조한다.</p>
<h2>제4조 (계약 해제)</h2>
<p>천재지변 등 불가항력으로 행사를 진행할 수 없는 경우 양 당사자는 협의하여 일정 변경 또는 계약을 해제할 수 있다.</p>
<p>본 계약을 증명하기 위하여 계약서 2부를 작성하여 갑과 을이 각각 서명·날인 후 1부씩 보관한다.</p>
` + sign2(
  { role: "갑", body: "상호 {{공급받는자상호}} &nbsp;/&nbsp; 대표 {{공급받는자대표}}" },
  { role: "을", body: "상호 {{회사명}} &nbsp;/&nbsp; 대표 {{대표자}}" }
),
  },
  {
    name: "업무협약서(MOU)",
    category: "협약서",
    sort_order: 4,
    body:
`<h1>업무협약서</h1>
<p><strong>{{회사명}}</strong>(이하 “갑”)와(과) <strong>{{협약기관}}</strong>(이하 “을”)은(는) 상호 발전과 협력을 위하여 다음과 같이 협약을 체결한다.</p>
<h2>제1조 (목적)</h2>
<p>{{협약목적}}</p>
<h2>제2조 (협력 내용)</h2>
<p>{{협력내용}}</p>
<h2>제3조 (협약 기간)</h2>
<p>{{협약시작일}} 부터 {{협약종료일}} 까지로 하며, 만료 1개월 전까지 별도 의사표시가 없으면 1년 단위로 자동 연장한다.</p>
<h2>제4조 (역할 분담)</h2>
<p>양 기관은 상호 협의하여 각자의 역할과 비용 부담을 정한다.</p>
<h2>제5조 (비밀유지)</h2>
<p>양 기관은 본 협약 수행 중 알게 된 상대방의 정보를 협약 종료 후에도 제3자에게 누설하지 아니한다.</p>
<p>본 협약을 증명하기 위하여 협약서 2부를 작성하여 갑과 을이 각각 서명·날인 후 1부씩 보관한다.</p>
` + sign2(
  { role: "갑", body: "기관 {{회사명}} &nbsp;/&nbsp; 대표 {{대표자}}" },
  { role: "을", body: "기관 {{협약기관}} &nbsp;/&nbsp; 대표 {{을대표}}" }
),
  },
  {
    name: "견적서",
    category: "거래문서",
    sort_order: 5,
    body:
`<h1>견 적 서</h1>
<table><tbody>
<tr><th style="width:16%">견적번호</th><td>{{문서번호}}</td><th style="width:16%">견적일</th><td>{{오늘날짜}}</td></tr>
</tbody></table>
<p>아래와 같이 견적합니다. <strong>{{공급받는자상호}}</strong> 귀하</p>
${supplier}
${itemsTable}
<table><tbody>
<tr><th style="width:16%">유효기간</th><td>견적일로부터 30일</td></tr>
<tr><th>비고</th><td>{{비고}}</td></tr>
</tbody></table>`,
  },
  {
    name: "거래명세서",
    category: "거래문서",
    sort_order: 6,
    body:
`<h1>거 래 명 세 서</h1>
<table><tbody>
<tr><th style="width:16%">명세서번호</th><td>{{문서번호}}</td><th style="width:16%">거래일자</th><td>{{오늘날짜}}</td></tr>
</tbody></table>
${supplier}
${receiver}
${itemsTable}
<p style="text-align:right">위와 같이 거래하였음을 확인합니다. &nbsp; 인수자 {{인수자}} (서명 또는 인)</p>`,
  },
  {
    name: "청구서",
    category: "거래문서",
    sort_order: 7,
    body:
`<h1>청 구 서</h1>
<table><tbody>
<tr><th style="width:16%">청구번호</th><td>{{문서번호}}</td><th style="width:16%">청구일</th><td>{{오늘날짜}}</td></tr>
</tbody></table>
<p>아래와 같이 청구합니다. <strong>{{공급받는자상호}}</strong> 귀하</p>
${supplier}
${itemsTable}
<table><tbody>
<tr><th style="width:16%">입금계좌</th><td>{{입금계좌}}</td></tr>
<tr><th>입금기한</th><td>{{입금기한}}</td></tr>
</tbody></table>
<p style="text-align:center">위 금액을 청구하오니 기한 내 입금하여 주시기 바랍니다.</p>`,
  },
];

let created = 0, skipped = 0;
for (const t of templates) {
  const { data: exist } = await db.from("document_templates").select("id").eq("name", t.name).maybeSingle();
  if (exist) { skipped++; console.log("skip(이미있음):", t.name); continue; }
  const { error } = await db.from("document_templates").insert(t);
  if (error) { console.error("ERR", t.name, error.message); continue; }
  created++; console.log("created:", t.name);
}
console.log(`\n완료 — 생성 ${created} / 건너뜀 ${skipped}`);
