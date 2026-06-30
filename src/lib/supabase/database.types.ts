// 위너 통합 ERP — Supabase 스키마 타입 (Phase 0)
// 마이그레이션: supabase/migrations/20260530000000_phase0_foundation.sql 와 동기화.
// (스키마 변경 시 이 파일도 함께 갱신할 것)

export type TaxType = "GENERAL" | "SIMPLIFIED" | "TAX_FREE";
export type EmploymentType = "FULL_TIME" | "CONTRACT" | "FREELANCER" | "HOURLY";
export type UserRole = "STAFF" | "MANAGER" | "ACCOUNTANT" | "ADMIN";
export type ReceiptStatus = "PENDING" | "CONFIRMED";
export type PaymentMethod = "CARD" | "CASH" | "TRANSFER" | "OTHER";
export type EvidenceType =
  | "TAX_INVOICE"
  | "CARD_SALES_SLIP"
  | "CASH_RECEIPT"
  | "SIMPLE_RECEIPT"
  | "OTHER";
export type TaxInvoiceType = "SALES" | "PURCHASE";
export type TaxInvoiceStatus = "PENDING" | "DONE";
export type PurchaseStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ON_HOLD"
  | "PURCHASED";
export type LeaveType =
  | "ANNUAL"
  | "HALF_DAY"
  | "SICK"
  | "FAMILY_EVENT"
  | "PARENTAL"
  | "UNPAID"
  | "OTHER";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
// 등급(역할) 키. 기본 'ADMIN'/'MEMBER' + 사용자 정의 등급(roles 테이블) 허용 → text.
export type AppRole = string;

type Timestamps = { created_at: string; updated_at: string };

export interface CompanyRow extends Timestamps {
  id: string;
  name: string;
  biz_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_category: string | null;
  address: string | null;
  tax_type: TaxType;
  is_active: boolean;
}

export interface AccountRow extends Timestamps {
  id: string;
  code: string;
  name: string;
  category: string | null;
  is_active: boolean;
}

export interface PartnerRow extends Timestamps {
  id: string;
  company_id: string | null;
  name: string;
  biz_no: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  default_account_id: string | null;
  memo: string | null;
  is_active: boolean;
  category: string | null;
  source_ref: string | null;
  default_tax_rate: number | null; // 기본 부가세율(%) — null=10% 취급
  // CRM 확장(20260716)
  rep_name: string | null;
  biz_type: string | null;        // 업태
  biz_item: string | null;        // 종목
  postal_code: string | null;
  address: string | null;
  address_detail: string | null;
  tax_email: string | null;
  partner_kind: string | null;    // SALES/PURCHASE/BOTH/ETC
  tax_category: string | null;    // TAXABLE/TAXFREE/ZERO
  payment_terms: string | null;   // CASH/CARD/TRANSFER/NOTE/CREDIT
  payment_cycle: string | null;   // IMMEDIATE/EOM/NEXT_EOM/QUARTER
  credit_limit: number | null;
  evidence_type: string | null;   // TAX_INVOICE/INVOICE/CASH_RECEIPT/NONE
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
  sales_rep_id: string | null;    // employees.id
  partner_group: string | null;
  credit_grade: string | null;
  popbill_corpnum: string | null;
}

// ---------------- 거래처 CRM: 계약 / 거래내역 ----------------
export type ContractType = "CLASS" | "EVENT" | "RENTAL";
export type TxnStatus = "PLANNED" | "DONE" | "CANCELED";

export interface ContractRow {
  id: string;
  company_id: string | null;
  partner_id: string;
  type: string;                   // ContractType
  name: string;
  status: string;                 // DRAFT/ACTIVE/ENDED
  start_date: string | null;
  end_date: string | null;
  auto_renew: boolean;
  settle_unit: string;            // MONTHLY/PER_ITEM
  evidence_type: string | null;
  instructor_id: string | null;
  unit_price: number | null;
  memo: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  company_id: string | null;
  partner_id: string;
  contract_id: string | null;
  type: string;                   // ContractType | ETC
  txn_date: string;
  title: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  instructor_id: string | null;
  status: string;                 // TxnStatus
  settlement_id: string | null;
  tax_invoice_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeRow extends Timestamps {
  id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  employment_type: string; // field_options(category=employment_type) 관리값
  role: string; // field_options(category=role) 관리값
  hired_on: string | null;
  base_salary: number | null;
  hourly_wage: number | null;
  is_active: boolean;
  status: string; // field_options(category=employee_status) 관리값
  memo: string | null;
  source_ref: string | null;
  sync_snapshot: Record<string, string | null> | null;
  profile_id: string | null; // 연결된 로그인 계정(profiles.id)
  nickname: string | null;
  department: string | null; // field_options(category=department) 부서
  job_rank: string | null;   // field_options(category=job_rank) 직급
  job_title: string | null;  // field_options(category=job_title) 직책
  is_manager: boolean;       // 매니저(부서장) — 업무 배정 권한
  photo_url: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  // 인사기록
  birth: string | null;
  resident_no: string | null;
  name_en: string | null;       // 영문이름
  nationality: string | null;   // 국적
  gender: string | null;        // 성별
  hr_extra: Record<string, unknown> | null; // 인사카드 반복항목(가족·학력·경력·자격)
  address: string | null;
  emergency_contact: string | null;
  emergency_relation: string | null;
  dependents: number | null;
  children_under20: number | null;
  // 근로조건
  weekly_hours: number | null;
  work_days: string | null;
  work_start: string | null;
  work_end: string | null;
  probation_end: string | null;
  contract_end: string | null;
  // 4대보험
  ins_pension: boolean | null;
  ins_health: boolean | null;
  ins_employment: boolean | null;
  ins_industrial: boolean | null;
  ins_acquired_on: string | null;
  ins_lost_on: string | null;
  // 퇴사
  resigned_on: string | null;
  resign_reason: string | null;
}

export interface LaborContractRow {
  id: string;
  company_id: string | null;
  employee_id: string | null;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  wage_type: string | null; // MONTHLY | HOURLY
  wage_amount: number | null;
  work_hours: string | null;
  signed_on: string | null;
  file_url: string | null;
  memo: string | null;
  created_at: string;
}

export interface EmployeeDocumentRow {
  id: string;
  employee_id: string | null;
  doc_type: string | null;
  title: string | null;
  file_url: string | null;
  issued_on: string | null;
  expires_on: string | null;
  memo: string | null;
  created_at: string;
}

export interface EmployeeEventRow {
  id: string;
  employee_id: string | null;
  event_date: string | null;
  event_type: string | null;
  title: string | null;
  detail: string | null;
  created_at: string;
}

export interface DailyRecordRow {
  id: string;
  company_id: string;
  record_date: string;
  kind: "SALES" | "EXPENSE";
  category: string | null;        // field_options(sales_category | expense_category)
  payment_method: string | null;  // CASH | CARD | TRANSFER | OTHER
  amount: number;
  qty: number | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  company_id: string | null;
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  work_minutes: number | null;
  status: string;     // NORMAL/LATE/EARLY/LATE_EARLY/ABSENT/LEAVE
  work_mode: string;  // OFFICE/REMOTE/FIELD/TRIP
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentTemplateRow {
  id: string;
  name: string;
  category: string | null;
  body: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentIssueRow {
  id: string;
  template_id: string | null;
  company_id: string | null;
  employee_id: string;
  title: string;
  rendered_body: string;
  field_values: Record<string, string>;
  status: "DRAFT" | "ISSUED" | "SIGNED";
  signed_file: string | null;
  issued_on: string;
  signed_on: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ReceiptRow extends Timestamps {
  id: string;
  company_id: string;
  image_path: string;
  status: ReceiptStatus;
  partner_id: string | null;
  account_id: string | null;
  vendor_name: string | null;
  biz_no: string | null;
  doc_date: string | null;
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  payment_method: PaymentMethod | null;
  evidence_type: EvidenceType | null;
  vat_deductible: boolean | null;
  raw_ocr: unknown | null;
  ocr_error: string | null;
  memo: string | null;
}

export interface TaxInvoiceRow extends Timestamps {
  id: string;
  company_id: string;
  type: TaxInvoiceType;
  status: TaxInvoiceStatus;
  partner_id: string | null;
  doc_date: string | null;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  receipt_id: string | null;
  memo: string | null;
  due_date: string | null; // 결제예정일
  evidence: string; // 증빙구분: 세금계산서/카드/현금/무증빙
  account_id: string | null; // 계정과목
  settled_at: string | null; // 수기 정산일(null=미정산). 통장연결 또는 이 값이 있으면 정산완료
}

export interface PurchaseRequestRow extends Timestamps {
  id: string;
  company_id: string;
  requester_name: string | null;
  department: string | null;
  product_url: string | null;
  product_name: string | null;
  product_image: string | null;
  unit_price: number | null;
  quantity: number;
  amount: number;
  reason: string | null;
  status: PurchaseStatus;
  review_note: string | null;
  payer_name: string | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  receipt_id: string | null;
  partner_id: string | null; // 연결된 거래처(partners.id)
  account_id: string | null; // 계정과목
}

export interface LeaveRequestRow extends Timestamps {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
}

export interface PayrollRow extends Timestamps {
  id: string;
  company_id: string;
  employee_id: string;
  year_month: string;
  base_pay: number;
  allowance: number;
  nontax_allowance: number;
  income_tax: number;
  insurance: number;
  other_deduction: number;
  net_pay: number;
  memo: string | null;
  nontax_items: Record<string, number> | null; // 비과세 항목별 금액 {식대:200000,...}
}

export interface EmploymentCertificateRow {
  id: string;
  company_id: string;
  employee_id: string | null;
  cert_no: string;
  issued_on: string;
  employee_name: string;
  birth: string | null;
  address: string | null;
  department: string | null;
  position: string | null;
  employment_type: string | null;
  hired_on: string | null;
  purpose: string | null;
  submit_to: string | null;
  memo: string | null;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null; // 아이디 로그인용(없으면 이메일 로그인)
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

export type BankDirection = "IN" | "OUT";

export interface BankAccountRow extends Timestamps {
  id: string;
  company_id: string;
  bank_name: string | null;
  account_no: string | null;
  alias: string;
  opening_balance: number;
  is_active: boolean;
}

export interface BankTransactionRow extends Timestamps {
  id: string;
  bank_account_id: string;
  company_id: string;
  txn_date: string;
  txn_time: string | null; // 거래 시각 'HH:MM[:SS]' (수기 입력은 null)
  description: string | null;
  counterparty: string | null;
  direction: BankDirection;
  amount: number;
  balance_after: number | null;
  memo: string | null;
  source_ref: string | null;
  tax_status: string | null; // null=미확인 / 'NEEDED' / 'DONE' / 'NONE'
  tax_invoice_id: string | null; // 연결된 세금계산서(tax_invoices.id)
  receipt_id: string | null; // 연결된 영수증(receipts.id)
  partner_id: string | null; // 연결된 거래처(partners.id) — 돈 흐름 상대
  tax_partner_id: string | null; // 계산서 보낸/받은 곳(partners.id). 없으면 partner_id 대체
  account_id: string | null; // 계정과목(accounts.id)
  category: string | null; // 사용자 정의 구분(field_options 'bank_category')
  employee_id: string | null; // 직원 연동(employees.id) — 구분이 '직원' 연동일 때
  payroll_id: string | null; // 자동 생성/연결된 급여(payrolls.id)
  settles_card_id: string | null; // 카드대금 정산: 이 출금이 결제하는 카드(cards.id)
  settles_month: string | null; // 카드대금 정산: 대상 카드 사용월 'YYYY-MM'
}

export interface PaybackRow {
  id: string;
  company_id: string | null;
  bank_transaction_id: string | null;
  recipient_type: string; // 'PARTNER' | 'EMPLOYEE'
  partner_id: string | null;
  employee_id: string | null;
  gross_amount: number;
  tax_rate: number;
  tax_amount: number;
  net_amount: number;
  status: string; // 'PENDING' | 'PAID'
  paid_at: string | null;
  paid_txn_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardRow extends Timestamps {
  id: string;
  company_id: string;
  card_company: string | null;
  alias: string;
  card_no_last4: string | null;
  card_type: "CREDIT" | "CHECK";
  settlement_bank_account_id: string | null;
  billing_day: number | null;
  is_active: boolean;
}

export interface CardTransactionRow extends Timestamps {
  id: string;
  card_id: string;
  company_id: string;
  txn_date: string;
  txn_time: string | null;
  counterparty: string | null; // 가맹점
  description: string | null;
  direction: BankDirection; // OUT=사용 / IN=취소·환불
  amount: number;
  installment_months: number; // 0=일시불
  approval_no: string | null;
  memo: string | null;
  source_ref: string | null;
  tax_status: string | null;
  tax_invoice_id: string | null;
  receipt_id: string | null;
  partner_id: string | null;
  account_id: string | null;
  category: string | null; // field_options 'bank_category' 공유
  employee_id: string | null;
}

export interface RoleMenuPermissionRow {
  role: AppRole;
  menu_key: string;
  allowed: boolean;
}

export interface RoleRow {
  key: string;
  label: string;
  is_admin: boolean;
  sort_order: number;
  created_at: string;
}

export interface FieldOptionRow {
  id: string;
  category: string; // 'employment_type' | 'role'
  value: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  link_type: string | null; // 'employee'=직원 연동 / null=거래처(기본)
}

// ---------------- 업무공유캘린더 ----------------
export type TaskStatus = "TODO" | "DOING" | "DONE" | "HOLD";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TaskRow {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  category: string | null;        // field_options 'task_category'
  status: string;                 // TaskStatus
  priority: string;               // TaskPriority
  start_date: string | null;
  due_date: string | null;
  all_day: boolean;
  start_time: string | null;      // 'HH:MM'
  end_time: string | null;        // 'HH:MM'
  progress: number;               // 0~100
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssigneeRow {
  task_id: string;
  employee_id: string;
  created_at: string;
}

export interface TaskCommentRow {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface TaskChecklistRow {
  id: string;
  task_id: string;
  label: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

// ---------------- 자료실 ----------------
export type LibraryVisibility = "ALL" | "COMPANY" | "DEPT";

export interface LibraryFolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface LibraryFileRow {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  file_name: string;
  mime: string | null;
  size_bytes: number;
  storage_path: string;
  version: number;
  visibility: string;          // LibraryVisibility
  company_id: string | null;
  department: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  download_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LibraryFavoriteRow {
  profile_id: string;
  file_id: string;
  created_at: string;
}

type TableShape<Row, RequiredInsert extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      companies: TableShape<CompanyRow, "name">;
      accounts: TableShape<AccountRow, "code" | "name">;
      partners: TableShape<PartnerRow, "name">;
      employees: TableShape<EmployeeRow, "name">;
      receipts: TableShape<ReceiptRow, "company_id" | "image_path">;
      tax_invoices: TableShape<TaxInvoiceRow, "company_id" | "type">;
      purchase_requests: TableShape<PurchaseRequestRow, "company_id">;
      leave_requests: TableShape<
        LeaveRequestRow,
        "company_id" | "employee_id" | "start_date" | "end_date"
      >;
      payrolls: TableShape<PayrollRow, "company_id" | "employee_id" | "year_month">;
      employment_certificates: TableShape<
        EmploymentCertificateRow,
        "company_id" | "cert_no" | "employee_name"
      >;
      labor_contracts: TableShape<LaborContractRow, "employee_id">;
      employee_documents: TableShape<EmployeeDocumentRow, "employee_id">;
      employee_events: TableShape<EmployeeEventRow, "employee_id">;
      paybacks: TableShape<PaybackRow, "recipient_type">;
      profiles: TableShape<ProfileRow, "id">;
      field_options: TableShape<FieldOptionRow, "category" | "value" | "label">;
      role_menu_permissions: TableShape<RoleMenuPermissionRow, "role" | "menu_key">;
      roles: TableShape<RoleRow, "key" | "label">;
      bank_accounts: TableShape<BankAccountRow, "company_id" | "alias">;
      bank_transactions: TableShape<
        BankTransactionRow,
        "bank_account_id" | "company_id" | "txn_date" | "direction"
      >;
      cards: TableShape<CardRow, "company_id" | "alias">;
      card_transactions: TableShape<
        CardTransactionRow,
        "card_id" | "company_id" | "txn_date"
      >;
      tasks: TableShape<TaskRow, "title">;
      task_assignees: TableShape<TaskAssigneeRow, "task_id" | "employee_id">;
      task_comments: TableShape<TaskCommentRow, "task_id" | "body">;
      task_checklist: TableShape<TaskChecklistRow, "task_id" | "label">;
      library_folders: TableShape<LibraryFolderRow, "name">;
      library_files: TableShape<LibraryFileRow, "title" | "file_name" | "storage_path">;
      library_favorites: TableShape<LibraryFavoriteRow, "profile_id" | "file_id">;
      contracts: TableShape<ContractRow, "partner_id" | "name">;
      transactions: TableShape<TransactionRow, "partner_id" | "txn_date">;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      tax_type: TaxType;
      employment_type: EmploymentType;
      user_role: UserRole;
      receipt_status: ReceiptStatus;
      payment_method: PaymentMethod;
      evidence_type: EvidenceType;
      tax_invoice_type: TaxInvoiceType;
      tax_invoice_status: TaxInvoiceStatus;
      purchase_status: PurchaseStatus;
      leave_type: LeaveType;
      leave_status: LeaveStatus;
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
