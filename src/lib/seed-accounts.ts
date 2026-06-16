// 한국 SMB 표준 계정과목(KcLep/더존 전산회계 표준코드 기준) 샘플.
// "표준 계정과목 불러오기"로 일괄 등록. 코드 중복은 건너뜀.

export interface SeedAccount {
  code: string;
  name: string;
  category: string;
}

export const STANDARD_ACCOUNTS: SeedAccount[] = [
  // ---- 자산 ----
  { code: "101", name: "현금", category: "자산" },
  { code: "102", name: "당좌예금", category: "자산" },
  { code: "103", name: "보통예금", category: "자산" },
  { code: "108", name: "외상매출금", category: "자산" },
  { code: "110", name: "받을어음", category: "자산" },
  { code: "116", name: "미수수익", category: "자산" },
  { code: "120", name: "미수금", category: "자산" },
  { code: "131", name: "선급금", category: "자산" },
  { code: "133", name: "선급비용", category: "자산" },
  { code: "135", name: "부가세대급금", category: "자산" },
  { code: "136", name: "선납세금", category: "자산" },
  { code: "146", name: "상품", category: "자산" },
  { code: "153", name: "원재료", category: "자산" },
  { code: "179", name: "임차보증금", category: "자산" },
  { code: "202", name: "건물", category: "자산" },
  { code: "206", name: "기계장치", category: "자산" },
  { code: "208", name: "차량운반구", category: "자산" },
  { code: "212", name: "비품", category: "자산" },

  // ---- 부채 ----
  { code: "251", name: "외상매입금", category: "부채" },
  { code: "252", name: "지급어음", category: "부채" },
  { code: "253", name: "미지급금", category: "부채" },
  { code: "254", name: "예수금", category: "부채" },
  { code: "255", name: "부가세예수금", category: "부채" },
  { code: "259", name: "선수금", category: "부채" },
  { code: "260", name: "단기차입금", category: "부채" },
  { code: "261", name: "미지급세금", category: "부채" },
  { code: "291", name: "장기차입금", category: "부채" },
  { code: "295", name: "퇴직급여충당부채", category: "부채" },

  // ---- 자본 ----
  { code: "331", name: "자본금", category: "자본" },
  { code: "375", name: "이월이익잉여금", category: "자본" },

  // ---- 매출 ----
  { code: "401", name: "상품매출", category: "매출" },
  { code: "404", name: "제품매출", category: "매출" },

  // ---- 매출원가 ----
  { code: "451", name: "상품매출원가", category: "매출원가" },
  { code: "455", name: "제품매출원가", category: "매출원가" },
  { code: "501", name: "원재료비", category: "매출원가" },

  // ---- 판매관리비 ----
  { code: "801", name: "급여", category: "판매관리비" },
  { code: "803", name: "상여금", category: "판매관리비" },
  { code: "805", name: "잡급", category: "판매관리비" },
  { code: "806", name: "퇴직급여", category: "판매관리비" },
  { code: "811", name: "복리후생비", category: "판매관리비" },
  { code: "812", name: "여비교통비", category: "판매관리비" },
  { code: "813", name: "기업업무추진비", category: "판매관리비" },
  { code: "814", name: "통신비", category: "판매관리비" },
  { code: "815", name: "수도광열비", category: "판매관리비" },
  { code: "817", name: "세금과공과금", category: "판매관리비" },
  { code: "818", name: "감가상각비", category: "판매관리비" },
  { code: "819", name: "임차료", category: "판매관리비" },
  { code: "820", name: "수선비", category: "판매관리비" },
  { code: "821", name: "보험료", category: "판매관리비" },
  { code: "822", name: "차량유지비", category: "판매관리비" },
  { code: "824", name: "운반비", category: "판매관리비" },
  { code: "825", name: "교육훈련비", category: "판매관리비" },
  { code: "826", name: "도서인쇄비", category: "판매관리비" },
  { code: "827", name: "회의비", category: "판매관리비" },
  { code: "829", name: "사무용품비", category: "판매관리비" },
  { code: "830", name: "소모품비", category: "판매관리비" },
  { code: "831", name: "지급수수료", category: "판매관리비" },
  { code: "833", name: "광고선전비", category: "판매관리비" },
  { code: "834", name: "판매촉진비", category: "판매관리비" },
  { code: "835", name: "대손상각비", category: "판매관리비" },
  { code: "848", name: "잡비", category: "판매관리비" },

  // ---- 영업외수익 ----
  { code: "901", name: "이자수익", category: "영업외수익" },
  { code: "903", name: "배당금수익", category: "영업외수익" },
  { code: "904", name: "임대료", category: "영업외수익" },
  { code: "930", name: "잡이익", category: "영업외수익" },

  // ---- 영업외비용 ----
  { code: "951", name: "이자비용", category: "영업외비용" },
  { code: "953", name: "기부금", category: "영업외비용" },
  { code: "961", name: "재해손실", category: "영업외비용" },
  { code: "980", name: "잡손실", category: "영업외비용" },

  // ---- 세금 ----
  { code: "998", name: "법인세등", category: "세금" },
];
