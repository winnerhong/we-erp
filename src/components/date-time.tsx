"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

/*
 * 위너 ERP date and time pickers in the Toss style (gray hierarchy + one indigo accent).
 * (원픽 src/components/DateTime.tsx 를 그대로 옮김 — 색은 app/datetime.css 변수로만 바꿈)
 * Use these instead of <input type="date"|"time"> everywhere. Values are the same strings the
 * native inputs use ("2026-11-20", "09:30"), and with `name` they submit in forms like a normal input.
 * Desktop: a card under the field. Phone (≤600px): a bottom sheet with a dimmed backdrop.
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const todayISO = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

export function formatTimeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${pad(m)}`;
}

// Pickers often sit inside a <label>; a click on the popover background would "activate" the label,
// which clicks the trigger again and closes the popover. Cancelling the default stops that.
const keepOpen = (e: MouseEvent) => e.preventDefault();

/** Closes the popover on an outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, root };
}

type FieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

/** Keeps the controlled/uncontrolled value in one place. */
function useFieldValue(p: FieldProps) {
  const [inner, setInner] = useState(p.defaultValue ?? "");
  const value = p.value ?? inner;
  const set = (v: string) => {
    if (p.value === undefined) setInner(v);
    p.onChange?.(v);
  };
  return [value, set] as const;
}

/** Hidden-but-validated input so the form submits the value and `required` still blocks submit. */
function Proxy({ name, value, required }: { name?: string; value: string; required?: boolean }) {
  return <input className="dt-proxy" name={name} value={value} onChange={() => {}} required={required} tabIndex={-1} aria-hidden="true" />;
}

function Trigger({ icon, label, empty, open, onClick, disabled, ariaLabel }: { icon: ReactNode; label: string; empty: boolean; open: boolean; onClick: () => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button type="button" className="dt-trigger" data-empty={empty || undefined} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined} onClick={onClick} disabled={disabled}>
      <span>{label}</span>
      {icon}
    </button>
  );
}

/** The card (desktop) / bottom sheet (phone) that holds a picker. */
function Sheet({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <>
      <div
        className="dt-dim"
        onClick={(e) => {
          keepOpen(e);
          onClose();
        }}
        aria-hidden="true"
      />
      <div className={`dt-pop ${className}`} role="dialog" aria-label={title} onClick={keepOpen}>
        <div className="dt-sheet-head">
          <span className="dt-grab" aria-hidden="true" />
          <b>{title}</b>
        </div>
        {children}
      </div>
    </>
  );
}

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
  </svg>
);
const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

export function DateField(props: FieldProps & { min?: string; max?: string }) {
  const [value, setValue] = useFieldValue(props);
  const { open, setOpen, root } = usePopover();
  const today = todayISO();
  const [month, setMonth] = useState((value || today).slice(0, 7));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 열 때 한 번만 보는 달을 맞춤
    if (open) setMonth((value || today).slice(0, 7));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset the view only when opening

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // only as many weeks as the month needs; blank cells before the 1st
    const lead = first.getUTCDay();
    const cells = Math.ceil((lead + lastDay) / 7) * 7;
    return Array.from({ length: cells }, (_, i) => {
      const day = i - lead + 1;
      if (day < 1 || day > lastDay) return null;
      const iso = `${month}-${pad(day)}`;
      return { iso, day, weekday: i % 7 };
    });
  }, [month]);

  const shift = (by: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7));
  };
  const blocked = (iso: string) => (props.min && iso < props.min) || (props.max && iso > props.max);
  const pick = (iso: string) => {
    setValue(iso);
    setOpen(false);
  };
  const [y, m] = month.split("-").map(Number);

  return (
    <div className={`dt-field ${props.className ?? ""}`} ref={root}>
      <Trigger icon={<CalendarIcon />} label={value ? formatDateLabel(value) : (props.placeholder ?? "날짜 고르기")} empty={!value} open={open} onClick={() => setOpen((o) => !o)} disabled={props.disabled} ariaLabel={props["aria-label"]} />
      <Proxy name={props.name} value={value} required={props.required} />
      {open && (
        <Sheet title={props["aria-label"] ?? "날짜 선택"} onClose={() => setOpen(false)}>
          <div className="dt-cal-head">
            <b>
              {y}년 {m}월
            </b>
            <div className="dt-navs">
              <button type="button" className="dt-nav" onClick={() => shift(-1)} aria-label="이전 달">
                <Chevron dir="left" />
              </button>
              <button type="button" className="dt-nav" onClick={() => shift(1)} aria-label="다음 달">
                <Chevron dir="right" />
              </button>
            </div>
          </div>
          <div className="dt-cal-grid" role="grid">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className="dt-wd" data-sun={i === 0 || undefined} data-sat={i === 6 || undefined}>
                {w}
              </span>
            ))}
            {days.map((d, i) =>
              d ? (
                <button
                  key={d.iso}
                  type="button"
                  className="dt-day"
                  data-today={d.iso === today || undefined}
                  data-sun={d.weekday === 0 || undefined}
                  data-sat={d.weekday === 6 || undefined}
                  aria-pressed={d.iso === value}
                  aria-label={formatDateLabel(d.iso)}
                  disabled={!!blocked(d.iso)}
                  onClick={() => pick(d.iso)}
                >
                  {d.day}
                </button>
              ) : (
                <span key={`blank-${i}`} />
              ),
            )}
          </div>
          <div className="dt-foot">
            {!props.required && value && (
              <button type="button" className="dt-btn dt-btn-gray" onClick={() => pick("")}>
                지우기
              </button>
            )}
            <button type="button" className="dt-btn dt-btn-gray" disabled={!!blocked(today)} onClick={() => pick(today)}>
              오늘
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function TimeField(props: FieldProps & { step?: number }) {
  const [value, setValue] = useFieldValue(props);
  const { open, setOpen, root } = usePopover();
  const step = props.step ?? 5;
  // the sheet edits a draft; 「확인」 writes it to the field
  const [draft, setDraft] = useState(value || "09:00");
  const [h24, min] = draft.split(":").map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  const lists = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 열 때 한 번만 초안을 채움
    setDraft(value || "09:00");
    requestAnimationFrame(() =>
      lists.current?.querySelectorAll<HTMLElement>('[aria-pressed="true"]').forEach((el) => {
        const col = el.parentElement!;
        col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2;
      }),
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- seed the draft only when opening

  // built from the latest draft, so quick taps in a row (오후 → 3시 → 15분) all count
  const set = (next: { pm?: boolean; h12?: number; min?: number }) =>
    setDraft((prev) => {
      const [ph, pmin] = prev.split(":").map(Number);
      const P = next.pm ?? ph >= 12;
      const H = next.h12 ?? (ph % 12 === 0 ? 12 : ph % 12);
      const M = next.min ?? pmin;
      return `${pad((H % 12) + (P ? 12 : 0))}:${pad(M)}`;
    });

  return (
    <div className={`dt-field ${props.className ?? ""}`} ref={root}>
      <Trigger icon={<ClockIcon />} label={value ? formatTimeLabel(value) : (props.placeholder ?? "시간 고르기")} empty={!value} open={open} onClick={() => setOpen((o) => !o)} disabled={props.disabled} ariaLabel={props["aria-label"]} />
      <Proxy name={props.name} value={value} required={props.required} />
      {open && (
        <Sheet title={props["aria-label"] ?? "시간 선택"} onClose={() => setOpen(false)} className="dt-time">
          <div className="dt-seg" role="radiogroup" aria-label="오전 오후">
            {[false, true].map((p) => (
              <button key={String(p)} type="button" role="radio" aria-checked={pm === p} onClick={() => set({ pm: p })}>
                {p ? "오후" : "오전"}
              </button>
            ))}
          </div>
          <div className="dt-cols" ref={lists}>
            <div className="dt-col" aria-label="시">
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                <button key={h} type="button" className="dt-opt" aria-pressed={h === h12} onClick={() => set({ h12: h })}>
                  {h}시
                </button>
              ))}
            </div>
            <div className="dt-col" aria-label="분">
              {minutes.map((mm) => (
                <button key={mm} type="button" className="dt-opt" aria-pressed={mm === min} onClick={() => set({ min: mm })}>
                  {pad(mm)}분
                </button>
              ))}
            </div>
          </div>
          <div className="dt-foot">
            {!props.required && value && (
              <button
                type="button"
                className="dt-btn dt-btn-gray"
                onClick={() => {
                  setValue("");
                  setOpen(false);
                }}
              >
                지우기
              </button>
            )}
            <button
              type="button"
              className="dt-btn dt-btn-primary"
              onClick={() => {
                setValue(draft);
                setOpen(false);
              }}
            >
              {formatTimeLabel(draft)} 확인
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
