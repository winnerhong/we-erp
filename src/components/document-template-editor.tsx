"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Image from "@tiptap/extension-image";

// 표 셀 배경색 + 높이(행 높이) 속성 추가
const cellAttrs = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (attrs: { backgroundColor?: string | null }) =>
      attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {},
  },
  minHeight: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.height || null,
    renderHTML: (attrs: { minHeight?: string | null }) =>
      attrs.minHeight ? { style: `height:${attrs.minHeight}` } : {},
  },
};
const CellBg = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });
const HeaderBg = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });

// 행 아래 경계를 드래그해 행 높이 조절 — 열 너비 드래그처럼 세로로도 가능하게
const BORDER = 6; // 경계 감지 px
function rowInfo(row: HTMLTableRowElement) {
  return { tr: row, cells: Array.from(row.children) as HTMLElement[], height: row.getBoundingClientRect().height };
}
// 행 경계 위·아래 어느 쪽에서든 감지: 아래 경계 근처면 그 행, 위 경계 근처면 바로 위 행을 조절 대상으로
function rowAtBorder(view: EditorView, e: MouseEvent): { tr: HTMLTableRowElement; cells: HTMLElement[]; height: number } | null {
  const t = e.target as HTMLElement | null;
  const cell = t?.closest?.("td,th") as HTMLElement | null;
  if (!cell || !view.dom.contains(cell)) return null;
  const row = cell.closest("tr") as HTMLTableRowElement | null;
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  if (Math.abs(e.clientY - rect.bottom) <= BORDER) return rowInfo(row);
  if (Math.abs(e.clientY - rect.top) <= BORDER) {
    const prev = row.previousElementSibling as HTMLTableRowElement | null;
    if (prev) return rowInfo(prev);
  }
  return null;
}
// 셀 DOM → 그 셀이 속한 tableRow 노드의 PM 위치(노드 앞). 못 찾으면 -1.
function rowPosFromCell(view: EditorView, cell: HTMLElement): number {
  const pos = view.posAtDOM(cell, 0);
  if (pos < 0) return -1;
  const $pos = view.state.doc.resolve(pos);
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type.name !== "tableRow") depth--;
  if (depth === 0) return -1;
  return $pos.before(depth);
}
// PM 상태로 행 높이 적용(드래그 중엔 히스토리 미적립, 종료 시 1회 적립)
function applyRowHeight(view: EditorView, rowPos: number, h: number, addHistory: boolean) {
  const rowNode = view.state.doc.nodeAt(rowPos);
  if (!rowNode || rowNode.type.name !== "tableRow") return;
  let p = rowPos + 1;
  const tr = view.state.tr;
  rowNode.forEach((cell) => {
    tr.setNodeMarkup(p, undefined, { ...cell.attrs, minHeight: `${Math.round(h)}px` });
    p += cell.nodeSize;
  });
  if (!addHistory) tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}
const RowResize = Extension.create({
  name: "rowResize",
  addProseMirrorPlugins() {
    let drag: { rowPos: number; startY: number; startH: number; lastH: number; raf: number } | null = null;
    return [
      new Plugin({
        key: new PluginKey("rowResize"),
        props: {
          handleDOMEvents: {
            mousemove(view, e) {
              if (drag) {
                drag.lastH = Math.max(20, drag.startH + (e.clientY - drag.startY));
                if (!drag.raf) {
                  drag.raf = requestAnimationFrame(() => {
                    if (!drag) return;
                    drag.raf = 0;
                    applyRowHeight(view, drag.rowPos, drag.lastH, false);
                  });
                }
                e.preventDefault();
                return true;
              }
              view.dom.style.cursor = rowAtBorder(view, e) ? "row-resize" : "";
              return false;
            },
            mousedown(view, e) {
              const info = rowAtBorder(view, e);
              if (!info) return false;
              const rowPos = rowPosFromCell(view, info.cells[0]);
              if (rowPos < 0) return false;
              drag = { rowPos, startY: e.clientY, startH: info.height, lastH: info.height, raf: 0 };
              e.preventDefault();
              const up = () => {
                if (drag) {
                  if (drag.raf) cancelAnimationFrame(drag.raf);
                  applyRowHeight(view, drag.rowPos, drag.lastH, true);
                }
                drag = null;
                view.dom.style.cursor = "";
                document.removeEventListener("mouseup", up);
              };
              document.addEventListener("mouseup", up);
              return true;
            },
          },
        },
      }),
    ];
  },
});
import { AUTO_VARS, ensureHtml, renderBody, sampleContext } from "@/lib/document-vars";
import type { DocumentTemplateRow } from "@/lib/supabase/database.types";
import { createTemplate, updateTemplate, deleteTemplate } from "@/app/(erp)/documents/actions";

const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

export function DocumentTemplateEditor({
  template,
  onSavedNew,
}: {
  template: DocumentTemplateRow | null; // null = 새 양식
  onSavedNew?: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [html, setHtml] = useState(ensureHtml(template?.body ?? ""));
  const [varQuery, setVarQuery] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, handleWidth: 14, cellMinWidth: 36, lastColumnResizable: true }),
      TableRow,
      HeaderBg,
      CellBg,
      RowResize,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: ensureHtml(template?.body ?? "<p></p>"),
    editorProps: { attributes: { class: "doc-content", "data-placeholder": "여기에 서류 내용을 작성하세요…" } },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  const today = todayStr();
  const preview = useMemo(() => renderBody(html, sampleContext(today)), [html, today]);

  function insertVar(token: string) {
    editor?.chain().focus().insertContent(`{{${token}}}`).run();
  }
  function resetBody() {
    if (!confirm("편집 내용을 양식 기본값으로 되돌릴까요?")) return;
    const base = ensureHtml(template?.body ?? "<p></p>");
    editor?.commands.setContent(base);
    setHtml(base);
  }
  function save() {
    if (!name.trim()) {
      alert("양식 이름을 입력하세요.");
      return;
    }
    const body = editor?.getHTML() ?? html;
    startTransition(async () => {
      if (!template) {
        const res = await createTemplate({ name, category: category || null, body });
        if (res.ok && res.id) onSavedNew?.(res.id);
        else if (!res.ok) alert(res.error ?? "저장 실패");
      } else {
        const res = await updateTemplate(template.id, { name, category: category || null, body });
        if (!res.ok) alert(res.error ?? "저장 실패");
      }
      router.refresh();
    });
  }
  function remove() {
    if (!template) return;
    if (!confirm("이 양식을 삭제할까요? (이미 발행된 서류는 유지됩니다)")) return;
    startTransition(async () => {
      await deleteTemplate(template.id);
      router.refresh();
    });
  }

  const vars = AUTO_VARS.filter(
    (v) => !varQuery.trim() || v.token.includes(varQuery.trim()) || v.label.includes(varQuery.trim())
  );

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_210px]">
      {/* 좌: 실시간 미리보기 */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between rounded-t-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
          <span>실시간 미리보기 (가상 데이터 적용)</span>
          <span className="text-xs font-normal text-white/80">A4 비율</span>
        </div>
        <A4Preview html={preview} />
      </div>

      {/* 중앙: 편집 */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2">
          <span className="text-sm font-semibold text-neutral-700">문서 편집 (워드처럼 편집)</span>
          <div className="flex items-center gap-1.5">
            <button onClick={resetBody} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">↻ 기본 양식으로 초기화</button>
            <button onClick={save} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">저장하기</button>
            {template && <button onClick={remove} className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">삭제</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="양식 이름(예: 표준 근로계약서)" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="분류(계약서·동의서 등)" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>

        <Toolbar editor={editor} />

        <div className="doc-editor-zoom max-h-[60vh] overflow-auto px-4 py-3">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* 우: 변수 목록 */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700">변수 목록</div>
        <div className="p-2">
          <input value={varQuery} onChange={(e) => setVarQuery(e.target.value)} placeholder="변수 검색…" className="mb-2 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs" />
          <p className="mb-1 px-1 text-[11px] text-neutral-400">클릭하여 삽입하세요</p>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
            {vars.map((v) => (
              <button
                key={v.token}
                onClick={() => insertVar(v.token)}
                title={v.label}
                className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:border-indigo-400 hover:bg-indigo-50"
              >
                {v.label}
                <span className="ml-1 text-[10px] text-neutral-400">{`{{${v.token}}}`}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A4 용지(210×297mm)를 컨테이너 폭에 맞춰 축소 렌더 — 전체 페이지가 A4 비율로 보임
const A4_W = 794; // 210mm @96dpi
const A4_H = 1123; // 297mm @96dpi
function A4Preview({ html }: { html: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [boxH, setBoxH] = useState(A4_H * 0.5);

  useEffect(() => {
    const wrap = wrapRef.current;
    const page = pageRef.current;
    if (!wrap || !page) return;
    let raf = 0;
    const update = () => {
      // 스크롤바 토글로 인한 떨림 방지: 폭은 RO에 보고된 contentRect 기준이 아니라 clientWidth 사용 +
      // scrollbar-gutter:stable 로 폭을 고정. 변화가 미미하면 state 갱신 생략(루프 차단).
      const avail = wrap.clientWidth - 24; // p-3 좌우 패딩
      const s = Math.min(1, Math.max(0.15, avail / A4_W));
      const h = Math.round(page.offsetHeight * s);
      setScale((prev) => (Math.abs(prev - s) > 0.003 ? s : prev));
      setBoxH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    ro.observe(page);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ scrollbarGutter: "stable" }} className="max-h-[72vh] overflow-y-scroll overflow-x-hidden bg-neutral-200 p-3">
      <div style={{ width: A4_W * scale, height: boxH, margin: "0 auto" }}>
        <div
          ref={pageRef}
          style={{ width: A4_W, minHeight: A4_H, transform: `scale(${scale})`, transformOrigin: "top left", padding: 48 }}
          className="bg-white shadow-md"
        >
          <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

function TBtn({ on, active, children, title }: { on: () => void; active?: boolean; children: React.ReactNode; title: string }) {
  return (
    <button
      onClick={on}
      title={title}
      className={`min-w-[28px] rounded px-1.5 py-1 text-sm ${active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}

const selCls = "flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700";

// 드롭다운 그룹
function Menu({
  id, icon, label, menu, setMenu, width = "w-64", children,
}: {
  id: string; icon: string; label: string; menu: string | null; setMenu: (v: string | null) => void; width?: string; children: React.ReactNode;
}) {
  const open = menu === id;
  return (
    <div className="relative">
      <button
        onClick={() => setMenu(open ? null : id)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${open ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
      >
        <span className={`grid h-5 w-5 place-items-center rounded text-[11px] font-bold ${open ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-700"}`}>{icon}</span>
        {label}
        <span className="text-[9px] opacity-60">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div className={`absolute left-0 z-50 mt-1.5 ${width} rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl`}>{children}</div>
        </>
      )}
    </div>
  );
}
// 메뉴 항목(아이콘+라벨, 클릭 시 닫힘)
function MI({ icon, label, on, active, close }: { icon: string; label: string; on: () => void; active?: boolean; close: () => void }) {
  return (
    <button
      onClick={() => { on(); close(); }}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${active ? "bg-indigo-50 font-medium text-indigo-700" : "text-neutral-700 hover:bg-neutral-100"}`}
    >
      <span className="grid w-5 place-items-center text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function Lab({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold text-neutral-400">{children}</div>;
}
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 px-1.5 py-1 text-sm">
      <span className="w-12 shrink-0 text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const imgRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  if (!editor) return <div className="h-11 border-y border-neutral-100" />;
  const close = () => setMenu(null);
  const e = editor;

  const insertImage = (file: File) => {
    const r = new FileReader();
    r.onload = () => e.chain().focus().setImage({ src: r.result as string }).run();
    r.readAsDataURL(file);
  };
  const setLink = () => {
    const prev = e.getAttributes("link").href as string | undefined;
    const url = prompt("링크 주소(URL)", prev ?? "https://");
    if (url === null) return;
    if (url === "") e.chain().focus().unsetLink().run();
    else e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const adjustRowHeight = (delta: number) => {
    e.chain().focus().command(({ tr, state, dispatch }) => {
      const { $from } = state.selection;
      let depth = $from.depth;
      while (depth > 0 && $from.node(depth).type.name !== "tableRow") depth--;
      if (depth === 0) return false;
      const rowNode = $from.node(depth);
      if (!dispatch) return true;
      let pos = $from.before(depth) + 1;
      rowNode.forEach((cell) => {
        const curPx = cell.attrs.minHeight ? parseInt(cell.attrs.minHeight, 10) || 32 : 32;
        const next = delta === 0 ? null : `${Math.max(20, curPx + delta)}px`;
        tr.setNodeMarkup(pos, undefined, { ...cell.attrs, minHeight: next });
        pos += cell.nodeSize;
      });
      return true;
    }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-y border-neutral-100 bg-neutral-50 px-3 py-1.5">
      {/* 글꼴 */}
      <Menu id="font" icon="Aa" label="글꼴" menu={menu} setMenu={setMenu} width="w-72">
        <Fld label="글꼴">
          <select className={selCls} value="" onChange={(ev) => { const v = ev.target.value; if (v) e.chain().focus().setFontFamily(v).run(); else e.chain().focus().unsetFontFamily().run(); }}>
            <option value="">기본</option>
            <option value="'Malgun Gothic', sans-serif">맑은 고딕</option>
            <option value="'Batang', serif">바탕</option>
            <option value="'Dotum', sans-serif">돋움</option>
            <option value="'Gulim', sans-serif">굴림</option>
            <option value="'Gungsuh', serif">궁서</option>
            <option value="'Times New Roman', serif">Times</option>
            <option value="Arial, sans-serif">Arial</option>
          </select>
        </Fld>
        <Fld label="크기">
          <select className={selCls} value="" onChange={(ev) => { const v = ev.target.value; if (v) e.chain().focus().setFontSize(v).run(); else e.chain().focus().unsetFontSize().run(); }}>
            <option value="">기본</option>
            {["12px", "14px", "16px", "18px", "20px", "24px", "28px", "36px"].map((s) => <option key={s} value={s}>{s.replace("px", "")}</option>)}
          </select>
        </Fld>
        <Fld label="줄간격">
          <select className={selCls} value="" onChange={(ev) => { const v = ev.target.value; if (v) e.chain().focus().setLineHeight(v).run(); else e.chain().focus().unsetLineHeight().run(); }}>
            <option value="">기본</option>
            {["1", "1.2", "1.5", "1.8", "2.2"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Fld>
      </Menu>

      {/* 서식 */}
      <Menu id="format" icon="𝐁" label="서식" menu={menu} setMenu={setMenu}>
        <div className="flex gap-1 px-1 pb-1">
          <TBtn title="굵게" on={() => e.chain().focus().toggleBold().run()} active={e.isActive("bold")}><b>B</b></TBtn>
          <TBtn title="기울임" on={() => e.chain().focus().toggleItalic().run()} active={e.isActive("italic")}><i>I</i></TBtn>
          <TBtn title="밑줄" on={() => e.chain().focus().toggleUnderline().run()} active={e.isActive("underline")}><u>U</u></TBtn>
          <TBtn title="취소선" on={() => e.chain().focus().toggleStrike().run()} active={e.isActive("strike")}><s>S</s></TBtn>
          <TBtn title="위첨자" on={() => e.chain().focus().toggleSuperscript().run()} active={e.isActive("superscript")}>x²</TBtn>
          <TBtn title="아래첨자" on={() => e.chain().focus().toggleSubscript().run()} active={e.isActive("subscript")}>x₂</TBtn>
          <TBtn title="인라인 코드" on={() => e.chain().focus().toggleCode().run()} active={e.isActive("code")}>{"</>"}</TBtn>
        </div>
        <Fld label="글자색">
          <input type="color" className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5" onChange={(ev) => e.chain().focus().setColor(ev.target.value).run()} />
        </Fld>
        <Fld label="형광펜">
          <input type="color" className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5" onChange={(ev) => e.chain().focus().setHighlight({ color: ev.target.value }).run()} />
        </Fld>
        <MI icon="🧽" label="글자색·형광펜 지우기" on={() => e.chain().focus().unsetColor().unsetHighlight().run()} close={close} />
        <MI icon="🧹" label="서식 모두 지우기" on={() => e.chain().focus().unsetAllMarks().clearNodes().run()} close={close} />
      </Menu>

      {/* 문단 */}
      <Menu id="para" icon="¶" label="문단" menu={menu} setMenu={setMenu}>
        <Lab>제목</Lab>
        <div className="flex gap-1 px-1">
          <TBtn title="제목1" on={() => e.chain().focus().toggleHeading({ level: 1 }).run()} active={e.isActive("heading", { level: 1 })}>H1</TBtn>
          <TBtn title="제목2" on={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive("heading", { level: 2 })}>H2</TBtn>
          <TBtn title="제목3" on={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive("heading", { level: 3 })}>H3</TBtn>
          <TBtn title="본문" on={() => e.chain().focus().setParagraph().run()} active={e.isActive("paragraph")}>본문</TBtn>
        </div>
        <Lab>정렬</Lab>
        <div className="flex gap-1 px-1">
          <TBtn title="왼쪽" on={() => e.chain().focus().setTextAlign("left").run()} active={e.isActive({ textAlign: "left" })}>⬅</TBtn>
          <TBtn title="가운데" on={() => e.chain().focus().setTextAlign("center").run()} active={e.isActive({ textAlign: "center" })}>↔</TBtn>
          <TBtn title="오른쪽" on={() => e.chain().focus().setTextAlign("right").run()} active={e.isActive({ textAlign: "right" })}>➡</TBtn>
          <TBtn title="양쪽" on={() => e.chain().focus().setTextAlign("justify").run()} active={e.isActive({ textAlign: "justify" })}>≡</TBtn>
        </div>
        <Lab>목록</Lab>
        <div className="flex gap-1 px-1 pb-1">
          <TBtn title="글머리 목록" on={() => e.chain().focus().toggleBulletList().run()} active={e.isActive("bulletList")}>•</TBtn>
          <TBtn title="번호 목록" on={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive("orderedList")}>1.</TBtn>
          <TBtn title="체크리스트" on={() => e.chain().focus().toggleTaskList().run()} active={e.isActive("taskList")}>☑</TBtn>
        </div>
        <MI icon="❝" label="인용구" on={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive("blockquote")} close={close} />
        <MI icon="{ }" label="코드 블록" on={() => e.chain().focus().toggleCodeBlock().run()} active={e.isActive("codeBlock")} close={close} />
      </Menu>

      {/* 삽입 */}
      <Menu id="insert" icon="＋" label="삽입" menu={menu} setMenu={setMenu} width="w-52">
        <MI icon="🔗" label="링크" on={setLink} active={e.isActive("link")} close={close} />
        <MI icon="🖼" label="이미지" on={() => imgRef.current?.click()} close={close} />
        <MI icon="―" label="구분선" on={() => e.chain().focus().setHorizontalRule().run()} close={close} />
        <MI icon="▦" label="표 삽입 (3×3)" on={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} close={close} />
      </Menu>

      {/* 표 */}
      <Menu id="table" icon="▦" label="표" menu={menu} setMenu={setMenu} width="w-60">
        <Lab>행 추가·삭제</Lab>
        <div className="flex gap-1 px-1">
          <TBtn title="위에 행 추가" on={() => e.chain().focus().addRowBefore().run()}>↑행</TBtn>
          <TBtn title="아래에 행 추가" on={() => e.chain().focus().addRowAfter().run()}>↓행</TBtn>
          <TBtn title="행 삭제" on={() => e.chain().focus().deleteRow().run()}>－행</TBtn>
        </div>
        <Lab>열 추가·삭제</Lab>
        <div className="flex gap-1 px-1">
          <TBtn title="왼쪽에 열 추가" on={() => e.chain().focus().addColumnBefore().run()}>←열</TBtn>
          <TBtn title="오른쪽에 열 추가" on={() => e.chain().focus().addColumnAfter().run()}>열→</TBtn>
          <TBtn title="열 삭제" on={() => e.chain().focus().deleteColumn().run()}>－열</TBtn>
        </div>
        <Lab>셀</Lab>
        <div className="flex flex-wrap items-center gap-1 px-1">
          <TBtn title="셀 병합" on={() => e.chain().focus().mergeCells().run()}>병합</TBtn>
          <TBtn title="셀 분할" on={() => e.chain().focus().splitCell().run()}>분할</TBtn>
          <TBtn title="머리행 토글" on={() => e.chain().focus().toggleHeaderRow().run()}>머리행</TBtn>
          <label title="셀 배경색" className="flex h-7 cursor-pointer items-center gap-1 rounded px-1 text-xs hover:bg-neutral-100">
            셀색<input type="color" className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(ev) => e.chain().focus().setCellAttribute("backgroundColor", ev.target.value).run()} />
          </label>
          <TBtn title="셀 배경 지우기" on={() => e.chain().focus().setCellAttribute("backgroundColor", null).run()}>셀✕</TBtn>
        </div>
        <Lab>행 높이</Lab>
        <div className="flex gap-1 px-1 pb-1">
          <TBtn title="행 높이 늘리기" on={() => adjustRowHeight(8)}>높이＋</TBtn>
          <TBtn title="행 높이 줄이기" on={() => adjustRowHeight(-8)}>높이－</TBtn>
          <TBtn title="행 높이 초기화" on={() => adjustRowHeight(0)}>초기화</TBtn>
        </div>
        <MI icon="🗑" label="표 삭제" on={() => e.chain().focus().deleteTable().run()} close={close} />
      </Menu>

      <span className="mx-1 h-5 w-px bg-neutral-200" />
      <TBtn title="실행 취소" on={() => e.chain().focus().undo().run()}>↶</TBtn>
      <TBtn title="다시 실행" on={() => e.chain().focus().redo().run()}>↷</TBtn>
      <span className="ml-auto hidden text-[11px] text-neutral-400 xl:block">표 경계를 드래그하면 크기 조절</span>

      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) insertImage(f); ev.target.value = ""; }} />
    </div>
  );
}
