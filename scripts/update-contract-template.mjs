// 「표준 근로계약서」 양식을 표 형식 HTML 로 갱신(service-role 데이터 UPDATE).
// 실행: node scripts/update-contract-template.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export const CONTRACT_HTML = `<h1>근로계약서</h1>
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
</tbody></table>`;

const { data, error } = await db
  .from("document_templates")
  .update({ body: CONTRACT_HTML, category: "근로계약서", updated_at: new Date().toISOString() })
  .eq("name", "표준 근로계약서")
  .select("id, name");

if (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}
console.log("updated:", data);
