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
const MINUTE_STEP_KEY = "dt-minute-step";

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

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
const isHHMM = (s: string | undefined | null): s is string => !!s && /^\d{1,2}:\d{2}$/.test(s);
const DAY_END = 23 * 60 + 59;

/** "1시간 30분", "40분", "5시간" */
export function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}시간` : "", m ? `${m}분` : ""].filter(Boolean).join(" ");
}

/** "2h", "1h30m", "40m" */
const shortLen = (m: number) => (m % 60 === 0 ? `${m / 60}h` : m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`);

/** The 오전/오후 + 시·분 wheel shared by TimeField and TimeRangeField; edits a draft "HH:MM". */
function useTimeDraft(open: boolean, seed: string, coarse: number) {
  const [draft, setDraft] = useState(seed);
  // 5분 by default, 1분 on request (remembered per browser)
  const [fine, setFine] = useState(false);
  const lists = useRef<HTMLDivElement>(null);

  const centerPicked = () =>
    requestAnimationFrame(() =>
      lists.current?.querySelectorAll<HTMLElement>('.dt-col [aria-pressed="true"]').forEach((el) => {
        const col = el.parentElement!;
        col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2;
      }),
    );

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 열 때 한 번만 초안을 맞춤
    setDraft(seed);
    let saved = false;
    try {
      saved = localStorage.getItem(MINUTE_STEP_KEY) === "1";
    } catch {}
    // a value like 09:07 can only be shown in 1분 mode
    setFine(saved || Number(seed.split(":")[1]) % coarse !== 0);
    centerPicked();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- seed the draft only when opening

  const toggleFine = (next: boolean) => {
    setFine(next);
    try {
      localStorage.setItem(MINUTE_STEP_KEY, next ? "1" : "5");
    } catch {}
    centerPicked();
  };

  // built from the latest draft, so quick taps in a row (오후 → 3시 → 15분) all count
  const set = (next: { pm?: boolean; h12?: number; min?: number }) =>
    setDraft((prev) => {
      const [ph, pmin] = prev.split(":").map(Number);
      const P = next.pm ?? ph >= 12;
      const H = next.h12 ?? (ph % 12 === 0 ? 12 : ph % 12);
      const M = next.min ?? pmin;
      return `${pad((H % 12) + (P ? 12 : 0))}:${pad(M)}`;
    });

  // the ref goes apart from the values, so render code never reads an object holding a ref
  return { wheel: { draft, set, fine, toggleFine, coarse }, lists };
}

function TimeWheel({ t, lists }: { t: ReturnType<typeof useTimeDraft>["wheel"]; lists: ReturnType<typeof useTimeDraft>["lists"] }) {
  const [h24, min] = t.draft.split(":").map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const step = t.fine ? 1 : t.coarse;
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  return (
    <div className="dt-wheel" ref={lists}>
      <div className="dt-seg" role="radiogroup" aria-label="오전 오후">
        {[false, true].map((p) => (
          <button key={String(p)} type="button" role="radio" aria-checked={pm === p} onClick={() => t.set({ pm: p })}>
            {p ? "오후" : "오전"}
          </button>
        ))}
      </div>
      {t.coarse > 1 && (
        <div className="dt-step" role="radiogroup" aria-label="분 단위">
          <span>분 단위</span>
          {[false, true].map((f) => (
            <button key={String(f)} type="button" role="radio" aria-checked={t.fine === f} onClick={() => t.toggleFine(f)}>
              {f ? "1분" : `${t.coarse}분`}
            </button>
          ))}
        </div>
      )}
      <div className="dt-cols">
        <div className="dt-col" aria-label="시">
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
            <button key={h} type="button" className="dt-opt" aria-pressed={h === h12} onClick={() => t.set({ h12: h })}>
              {h}시
            </button>
          ))}
        </div>
        <div className="dt-col" aria-label="분">
          {minutes.map((mm) => (
            <button key={mm} type="button" className="dt-opt" aria-pressed={mm === min} onClick={() => t.set({ min: mm })}>
              {pad(mm)}분
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimeField(props: FieldProps & { step?: number; trigger?: (p: { open: boolean; toggle: () => void }) => ReactNode }) {
  const [value, setValue] = useFieldValue(props);
  const { open, setOpen, root } = usePopover();
  // the sheet edits a draft; 「확인」 writes it to the field
  const { wheel: t, lists } = useTimeDraft(open, value || "09:00", props.step ?? 5);
  const toggle = () => setOpen((o) => !o);

  return (
    <div className={`dt-field ${props.className ?? ""}`} ref={root}>
      {props.trigger ? props.trigger({ open, toggle }) : <Trigger icon={<ClockIcon />} label={value ? formatTimeLabel(value) : (props.placeholder ?? "시간 고르기")} empty={!value} open={open} onClick={toggle} disabled={props.disabled} ariaLabel={props["aria-label"]} />}
      <Proxy name={props.name} value={value} required={props.required} />
      {open && (
        <Sheet title={props["aria-label"] ?? "시간 선택"} onClose={() => setOpen(false)} className="dt-time">
          <TimeWheel t={t} lists={lists} />
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
                setValue(t.draft);
                setOpen(false);
              }}
            >
              {formatTimeLabel(t.draft)} 확인
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

type QuickTime = { id: string; label: string; start_time: string; minutes: number };
const QUICK_MAX = 12;
const quickKey = (kind: string) => `dt-quick-${kind}`;
const newId = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function readQuick(kind: string): QuickTime[] {
  try {
    const raw = localStorage.getItem(quickKey(kind));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // 브라우저 저장소는 누구나 고칠 수 있으니 모양이 맞는 것만 씀
    return list
      .filter(
        (q): q is QuickTime =>
          !!q && typeof q.id === "string" && typeof q.label === "string" && isHHMM(q.start_time) && Number.isInteger(q.minutes) && q.minutes > 0 && q.minutes <= 1440,
      )
      .map((q) => ({ id: q.id, label: q.label.slice(0, 20), start_time: q.start_time, minutes: q.minutes }))
      .slice(0, QUICK_MAX);
  } catch {
    return [];
  }
}

function writeQuick(kind: string, list: QuickTime[]) {
  try {
    localStorage.setItem(quickKey(kind), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** This browser's own 퀵타임 for one kind of time (localStorage, `dt-quick-<kind>`, 최대 12개). */
function useQuickTimes(kind?: string) {
  const [items, setItems] = useState<QuickTime[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    // 서버 렌더와 어긋나지 않게 마운트 후에 읽음
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장소에서 한 번 불러옴
    setItems(kind ? readQuick(kind) : null);
  }, [kind]);
  const add = async (label: string, start: string, minutes: number) => {
    if (!kind) return;
    setError("");
    const list = readQuick(kind);
    if (list.length >= QUICK_MAX) return setError(`퀵타임은 ${QUICK_MAX}개까지 만들 수 있어요.`);
    const next = [...list, { id: newId(), label: label.trim().slice(0, 20), start_time: start, minutes }];
    if (!writeQuick(kind, next)) return setError("저장하지 못했어요. 다시 해 주세요.");
    setItems(next);
  };
  const remove = async (id: string) => {
    if (!kind) return;
    const next = readQuick(kind).filter((q) => q.id !== id);
    if (writeQuick(kind, next)) setItems(next);
  };
  return { items, add, remove, error };
}

/**
 * 시작~끝 on a day timeline: drag the start handle and the end handle, the time between them is filled in.
 * Tap a clock tick to move the nearer side, tap the times in the header for an exact pick, or type the 분.
 * Uncontrolled: submits `startName` / `endName` as "HH:MM" (use `defaultStart` / `defaultEnd`).
 * Controlled: pass `start` / `end` and `onChange(start, end)`. Put the date in its own field above.
 * Wrap it in a <div>, not a <label> (the label would re-click the time buttons).
 */
export function TimeRangeField(props: {
  startName?: string;
  endName?: string;
  defaultStart?: string;
  defaultEnd?: string;
  /** controlled start "HH:MM" ("" = not chosen yet) */
  start?: string;
  /** controlled end "HH:MM" */
  end?: string;
  onChange?: (start: string, end: string) => void;
  /** handle step in minutes (default 10) */
  step?: number;
  /** the part of the day the bar shows, in minutes from midnight (default 7:00 ~ 19:00); it widens to fit the value */
  dayStart?: number;
  dayEnd?: number;
  /** turns on 퀵타임 saved in this browser for this kind of time */
  quickKind?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  const step = props.step ?? 10;
  const LAST = DAY_END;
  const controlled = props.start !== undefined;
  const [innerStart, setInnerStart] = useState(isHHMM(props.defaultStart) ? props.defaultStart : "");
  const [innerEnd, setInnerEnd] = useState(isHHMM(props.defaultEnd) ? props.defaultEnd : "");
  const start = controlled ? (isHHMM(props.start) ? props.start : "") : innerStart;
  const end = controlled ? (isHHMM(props.end) ? props.end : "") : innerEnd;
  const chosen = !!start && !!end && toMin(end) > toMin(start);
  // until something is chosen the handles rest at 9:00 ~ 11:00 and nothing is submitted
  const s = chosen ? toMin(start) : start ? toMin(start) : 9 * 60;
  const e = chosen ? toMin(end) : Math.min(s + 120, LAST);
  const len = e - s;
  const off = props.disabled;

  const [lenText, setLenText] = useState(String(len));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 바깥에서 값이 바뀌면 분 칸도 맞춤
    setLenText(String(len));
  }, [len]);

  const setRange = (ns: number, ne: number) => {
    if (off) return;
    const a = Math.max(0, Math.min(Math.round(ns), LAST - step));
    const b = Math.max(a + step, Math.min(Math.round(ne), LAST));
    if (!controlled) {
      setInnerStart(fromMin(a));
      setInnerEnd(fromMin(b));
    }
    setLenText(String(b - a));
    props.onChange?.(fromMin(a), fromMin(b));
  };

  const winStart = Math.min(props.dayStart ?? 7 * 60, Math.floor(s / 60) * 60);
  const winEnd = Math.max(props.dayEnd ?? 19 * 60, Math.ceil(e / 60) * 60);
  const span = winEnd - winStart;
  // where a clock time sits on the rail (range thumbs travel 12px in from each end)
  const at = (t: number) => `calc(12px + (100% - 24px) * ${(t - winStart) / span})`;
  const period = (t: number) => (t % 1440 < 720 ? "오전" : "오후");
  const ticks = Array.from({ length: span / 30 + 1 }, (_, i) => winStart + i * 30);
  const hourNum = (t: number) => {
    const h = Math.floor(t / 60) % 12;
    return String(h === 0 ? 12 : h);
  };
  const firstHour = ticks.find((t) => t % 60 === 0);
  const title = props["aria-label"] ?? "시간";

  const quick = useQuickTimes(props.quickKind);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const timeBtn = (label: string, empty: boolean) =>
    // eslint-disable-next-line react/display-name -- render prop for TimeField
    ({ open, toggle }: { open: boolean; toggle: () => void }) => (
      <button type="button" className="dt-r-time" data-empty={empty || undefined} aria-haspopup="dialog" aria-expanded={open} onClick={toggle} disabled={off}>
        {label}
      </button>
    );
  const commitText = () => setRange(s, s + (Number(lenText) || len));

  return (
    <div className={`dt-field dt-range2 ${props.className ?? ""}`} data-unset={!chosen || undefined} data-disabled={off || undefined}>
      <div className="dt-r-len">
        <div className="dt-r-times">
          <TimeField value={chosen ? start : ""} onChange={(v) => v && setRange(toMin(v), toMin(v) + len)} aria-label={`${title} 시작`} trigger={timeBtn(chosen ? formatTimeLabel(start) : "시작", !chosen)} />
          <span aria-hidden="true">~</span>
          <TimeField value={chosen ? end : ""} onChange={(v) => v && (toMin(v) > s ? setRange(s, toMin(v)) : setRange(toMin(v) - len, toMin(v)))} aria-label={`${title} 끝`} trigger={timeBtn(chosen ? formatTimeLabel(end) : "끝", !chosen)} />
        </div>
        <span className="dt-r-num">
          <span>진행 {formatDuration(len)}</span>
          <input
            type="number"
            inputMode="numeric"
            min={step}
            max={LAST - s}
            step={5}
            value={lenText}
            disabled={off}
            aria-label="진행 시간(분)"
            onChange={(ev) => setLenText(ev.target.value)}
            onBlur={commitText}
            onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), commitText())}
          />
          분
        </span>
      </div>

      <div className="dt-tl">
        {chosen && (
          <>
            <span className="dt-tl-tag dt-tl-tag-start" data-flip={(s - winStart) / span < 0.18 || undefined} data-high={((s - winStart) / span < 0.18 || (winEnd - e) / span < 0.18) && len / span < 0.3 ? true : undefined} style={{ left: at(s) }} aria-hidden="true">
              시작 {formatTimeLabel(start)}
            </span>
            <span className="dt-tl-tag dt-tl-tag-end" data-flip={(winEnd - e) / span < 0.18 || undefined} style={{ left: at(e) }} aria-hidden="true">
              {formatTimeLabel(end)} 끝
            </span>
          </>
        )}
        <div className="dt-tl-rail">
          <div className="dt-tl-track" aria-hidden="true" />
          <div className="dt-tl-fill" style={{ left: at(s), width: `calc((100% - 24px) * ${len / span})` }} aria-hidden="true" />
          {/* the start handle sits on top once it is in the right half, so it can still be pulled back left */}
          <input
            type="range"
            className="dt-tl-a"
            min={winStart}
            max={winEnd}
            step={step}
            value={s}
            disabled={off}
            onChange={(ev) => {
              const v = Number(ev.target.value);
              setRange(v, Math.max(e, v + step));
            }}
            aria-label={`${title} 시작`}
            aria-valuetext={formatTimeLabel(fromMin(s))}
            style={{ zIndex: s > winStart + span / 2 ? 3 : 2 }}
          />
          <input type="range" className="dt-tl-b" min={winStart} max={winEnd} step={step} value={e} disabled={off} onChange={(ev) => setRange(s, Number(ev.target.value))} aria-label={`${title} 끝`} aria-valuetext={formatTimeLabel(fromMin(e))} />
        </div>
        <div className="dt-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <button key={t} type="button" tabIndex={-1} disabled={off} data-in={(t >= s && t <= e) || undefined} data-half={t % 60 !== 0 || undefined} style={{ left: at(t) }} onClick={() => (t <= s ? setRange(t, e) : setRange(s, t))}>
              <small data-show={(t % 60 === 0 && (t === firstHour || t % 720 === 0)) || undefined}>{period(t)}</small>
              {t % 60 === 0 ? hourNum(t) : <i className="dt-tick-dot" />}
            </button>
          ))}
        </div>
      </div>

      {props.quickKind && quick.items && !off && (
        <div className="dt-quick">
          {quick.items.map((q) => {
            const on = chosen && q.start_time === start && q.minutes === len;
            const qEnd = fromMin(Math.min(toMin(q.start_time) + q.minutes, LAST));
            return (
              <span key={q.id} className="dt-quick-chip" data-on={on || undefined} data-tip={`${formatTimeLabel(q.start_time)}부터 ${formatDuration(q.minutes)} (${formatTimeLabel(qEnd)}까지) · 누르면 이 시간으로 바꿔요`}>
                <button type="button" aria-pressed={on} onClick={() => setRange(toMin(q.start_time), toMin(q.start_time) + q.minutes)}>
                  <b>{q.label}</b> {formatTimeLabel(q.start_time)} · {shortLen(q.minutes)}
                </button>
                <button type="button" className="dt-quick-x" onClick={() => quick.remove(q.id)} aria-label={`퀵타임 ${q.label} 지우기`}>
                  ×
                </button>
              </span>
            );
          })}
          <button
            type="button"
            className="dt-quick-plus"
            aria-expanded={adding}
            aria-label="퀵타임 만들기"
            data-tip={chosen ? `지금 시간(${formatTimeLabel(start)} ~ ${formatTimeLabel(end)})을 퀵타임으로 저장해요` : "시간을 정한 뒤 퀵타임으로 저장할 수 있어요"}
            onClick={() => setAdding((v) => !v)}
          >
            +
          </button>
        </div>
      )}
      {props.quickKind && adding && !off && (
        <div className="dt-quick-panel">
          <div className="dt-quick-add">
            <input
              value={newLabel}
              onChange={(ev) => setNewLabel(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && ev.preventDefault()}
              maxLength={20}
              placeholder="퀵타임 이름 (예: 오전 회의)"
              aria-label="퀵타임 이름"
              autoFocus
            />
            <button
              type="button"
              className="dt-btn dt-btn-primary"
              disabled={!chosen || !newLabel.trim()}
              onClick={async () => {
                await quick.add(newLabel, start, len);
                setNewLabel("");
                setAdding(false);
              }}
            >
              {chosen ? `${formatTimeLabel(start)} · ${formatDuration(len)} 저장` : "시간을 먼저 정해 주세요"}
            </button>
          </div>
          {quick.error && <p className="dt-quick-err">{quick.error}</p>}
        </div>
      )}

      <Proxy name={props.startName} value={chosen ? start : ""} required={props.required} />
      <Proxy name={props.endName} value={chosen ? end : ""} required={props.required} />
    </div>
  );
}
