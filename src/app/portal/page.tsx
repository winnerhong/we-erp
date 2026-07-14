import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePartner } from "@/lib/auth-guard";
import { kstToday } from "@/lib/attendance";
import { PortalClient } from "./portal-client";
import type {
  TransactionRow,
  SettlementRow,
  TaxInvoiceRow,
  ReceiptRow,
  PartnerAttachmentRow,
  NoticeRow,
} from "@/lib/supabase/database.types";

export const metadata = { title: "거래처 포털" };

const FILE_BUCKET = "library";

export default async function PortalPage() {
  const g = await ensurePartner();
  if (g.error || !g.partner) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-800">
        {g.error ?? "거래처 정보를 찾을 수 없습니다."}
        <br />
        <span className="mt-1 block text-xs text-amber-600">담당자(위너키즈스포츠)에게 문의하세요.</span>
      </div>
    );
  }

  const p = g.partner;
  const pid = p.id;
  const cid = p.company_id;
  const db = createAdminClient();
  const today = kstToday();

  const [
    companyRes,
    { data: txnsRaw },
    { data: settlementsRaw },
    { data: taxRaw },
    { data: rcptRaw },
    { data: attachRaw },
    { data: noticesRaw },
    { data: empRaw },
  ] = await Promise.all([
    cid
      ? db.from("companies").select("name, biz_no, ceo_name").eq("id", cid).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("transactions")
      .select("id, contract_id, type, txn_date, title, qty, unit_price, amount, instructor_id, status, present_count, progress_note, settlement_id, tax_invoice_id")
      .eq("partner_id", pid)
      .order("txn_date", { ascending: false }),
    db.from("settlements").select("id, type, period, title, subtotal, tax_amount, total, status, issued_at, paid_at, created_at").eq("partner_id", pid).order("created_at", { ascending: false }),
    db.from("tax_invoices").select("id, type, status, supply_amount, vat_amount, total_amount, doc_date, due_date, settled_at").eq("partner_id", pid).order("doc_date", { ascending: false }),
    db.from("receipts").select("id, vendor_name, total_amount, doc_date, status, evidence_type").eq("partner_id", pid).order("doc_date", { ascending: false }),
    db.from("partner_attachments").select("*").eq("partner_id", pid).order("created_at", { ascending: false }),
    cid
      ? db.from("notices").select("*").eq("status", "PUBLISHED").or(`company_id.eq.${cid},company_id.is.null`).order("published_at", { ascending: false })
      : db.from("notices").select("*").eq("status", "PUBLISHED").is("company_id", null).order("published_at", { ascending: false }),
    cid ? db.from("employees").select("id, name").eq("company_id", cid) : db.from("employees").select("id, name"),
  ]);

  const company = (companyRes.data ?? null) as { name: string; biz_no: string | null; ceo_name: string | null } | null;
  const txns = (txnsRaw ?? []) as Pick<TransactionRow, "id" | "contract_id" | "type" | "txn_date" | "title" | "qty" | "unit_price" | "amount" | "instructor_id" | "status" | "present_count" | "progress_note" | "settlement_id" | "tax_invoice_id">[];
  const settlements = (settlementsRaw ?? []) as Pick<SettlementRow, "id" | "type" | "period" | "title" | "subtotal" | "tax_amount" | "total" | "status" | "issued_at" | "paid_at" | "created_at">[];
  const taxInvoices = (taxRaw ?? []) as Pick<TaxInvoiceRow, "id" | "type" | "status" | "supply_amount" | "vat_amount" | "total_amount" | "doc_date" | "due_date" | "settled_at">[];
  const receipts = (rcptRaw ?? []) as Pick<ReceiptRow, "id" | "vendor_name" | "total_amount" | "doc_date" | "status" | "evidence_type">[];
  const attachments = (attachRaw ?? []) as PartnerAttachmentRow[];
  const employees = (empRaw ?? []) as { id: string; name: string }[];
  const empName = new Map(employees.map((e) => [e.id, e.name]));

  // 미수금 계산: 통장연결·수기정산 안 된 매출 세금계산서 (거래처 상세와 동일 로직)
  const taxIds = taxInvoices.map((t) => t.id);
  const linked = new Set<string>();
  if (taxIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < taxIds.length; i += 200) chunks.push(taxIds.slice(i, i + 200));
    const results = await Promise.all(
      chunks.map((c) => db.from("bank_transactions").select("tax_invoice_id").in("tax_invoice_id", c))
    );
    for (const { data } of results) for (const b of (data ?? []) as { tax_invoice_id: string }[]) linked.add(b.tax_invoice_id);
  }
  const unsettledTax = taxInvoices.filter((t) => t.type === "SALES" && !t.settled_at && !linked.has(t.id));
  const receivable = unsettledTax.reduce((s, t) => s + t.total_amount, 0);

  // 이번달 거래 합계
  const month = today.slice(0, 7);
  const thisMonthTotal = txns.filter((t) => (t.txn_date ?? "").startsWith(month) && t.status !== "CANCELED").reduce((s, t) => s + t.amount, 0);

  // 공지 필터 — 이 거래처가 대상인 것만
  const notices = ((noticesRaw ?? []) as NoticeRow[])
    .filter((n) => {
      if (n.audience === "ALL") return true;
      if (n.audience === "COMPANY") return n.company_id === cid;
      if (n.audience === "GROUP") return !!n.group_tag && n.group_tag === p.partner_group;
      if (n.audience === "PARTNERS") return Array.isArray(n.partner_ids) && n.partner_ids.includes(pid);
      return false;
    })
    .map((n) => ({ id: n.id, title: n.title, body: n.body, publishedAt: n.published_at, pinned: n.pinned }));

  // 문서함 서명 URL(1시간)
  const fileUrls: Record<string, string> = {};
  if (attachments.length > 0) {
    const { data: signed } = await db.storage.from(FILE_BUCKET).createSignedUrls(attachments.map((a) => a.storage_path), 3600);
    (signed ?? []).forEach((s, i) => {
      if (s.signedUrl) fileUrls[attachments[i].id] = s.signedUrl;
    });
  }

  return (
    <PortalClient
      partner={{ name: p.name, category: p.category, contact_name: p.contact_name, phone: p.phone, photo_url: p.photo_url }}
      supplier={company}
      userName={g.profile?.name ?? g.profile?.username ?? g.profile?.email ?? null}
      summary={{ receivable, thisMonthTotal, month }}
      sessions={txns.filter((t) => t.type === "CLASS").map((t) => ({
        id: t.id,
        date: t.txn_date,
        title: t.title,
        instructor: t.instructor_id ? empName.get(t.instructor_id) ?? null : null,
        present: t.present_count,
        note: t.progress_note,
        done: t.status === "DONE",
      }))}
      ledger={txns.map((t) => ({
        id: t.id,
        date: t.txn_date,
        type: t.type,
        title: t.title,
        qty: t.qty,
        amount: t.amount,
        status: t.status,
        settled: !!t.settlement_id,
      }))}
      settlements={settlements.map((s) => ({
        id: s.id,
        title: s.title,
        period: s.period,
        total: s.total,
        status: s.status,
        issuedAt: s.issued_at,
        paidAt: s.paid_at,
      }))}
      taxInvoices={taxInvoices.map((t) => ({
        id: t.id,
        type: t.type,
        docDate: t.doc_date,
        supply: t.supply_amount,
        vat: t.vat_amount,
        total: t.total_amount,
        status: t.status,
        settled: !!t.settled_at || linked.has(t.id),
      }))}
      receipts={receipts.map((r) => ({
        id: r.id,
        vendor: r.vendor_name,
        date: r.doc_date,
        total: r.total_amount,
        status: r.status,
        evidence: r.evidence_type,
      }))}
      files={attachments.map((a) => ({
        id: a.id,
        title: a.title,
        fileName: a.file_name,
        category: a.category,
        sizeBytes: a.size_bytes,
        createdAt: a.created_at,
        url: fileUrls[a.id] ?? null,
      }))}
      notices={notices}
    />
  );
}
