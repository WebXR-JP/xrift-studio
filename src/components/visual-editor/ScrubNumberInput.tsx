import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { roundTo } from "./editor-utils";
import { useValueScrubTransaction } from "./value-scrub-transaction";

const DRAG_THRESHOLD_PX = 3;
const SCRUB_DECIMALS = 4;

export type ScrubNumberInputProps = {
  value: number;
  onChange: (value: number) => void;
  /** スクラブ開始。Undo をひとまとめにしたい呼び出し元だけが渡す。 */
  onScrubStart?: () => void;
  /** スクラブ中の値。省略時は onChange を使う。 */
  onScrubChange?: (value: number) => void;
  /** ポインタを離してスクラブを確定した。 */
  onScrubEnd?: () => void;
  /** Escape などでスクラブを取り消した。開始時の値を受け取る。 */
  onScrubCancel?: (startValue: number) => void;
  min?: number;
  max?: number;
  /** キーボードの上下キーと native step。 */
  step?: number;
  /** 1px あたりの変化量。既定は step。 */
  scrubStep?: number;
  /** 表示の小数桁。省略時は値をそのまま丸めて表示する。 */
  precision?: number;
  /** スクラブ中の吹き出しに出す値の整形。 */
  formatDisplay?: (value: number) => string;
  /** 値がないときの表示。`value` に NaN を渡すと空欄になる。 */
  placeholder?: string;
  /** 入力を空にしたときの扱い。省略時は空にしても値を変えない。 */
  onClear?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  /** ドラッグの説明に前置きするラベル（例: "Position X"）。 */
  scrubLabel?: string;
  /** 入力欄の左に重ねる軸名などの短い表示。 */
  prefix?: ReactNode;
  /** 入力欄の右に重ねる単位表示。 */
  suffix?: ReactNode;
  /** 高さ。xs は h-6、sm は h-7、md は h-8。 */
  size?: "xs" | "sm" | "md";
  /** 数値の寄せ方。既定は右寄せ。 */
  align?: "right" | "left";
  /** 密度の高い一覧で使う小さい文字と余白。 */
  compact?: boolean;
  /** 外側の span へ渡すレイアウト用クラス。 */
  wrapperClassName?: string;
  /** 入力欄へ足すクラス。サイズや寄せは専用プロパティを使う。 */
  className?: string;
  /**
   * 既定の見た目を外し、`className` の指定だけを使う。Editor 以外の画面が
   * その画面の配色を保ったままドラッグ調整を使うための入口。
   */
  unstyled?: boolean;
  tone?: "light" | "dark";
};

type ScrubState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  startValue: number;
  currentValue: number;
  active: boolean;
};

const TONE_CLASS: Record<"light" | "dark", string> = {
  light:
    "border-slate-300 bg-white text-slate-800 focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
  dark: "border-slate-600 bg-slate-950 text-slate-100 focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-45",
};

const READOUT_CLASS: Record<"light" | "dark", string> = {
  light: "border-slate-300 bg-white text-slate-700",
  dark: "border-slate-600 bg-slate-900 text-slate-100",
};

/** ブラウザ既定の上下スピナーを消す。数値の増減は左右ドラッグと上下キーで行う。 */
export const NO_NUMBER_SPINNER_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:[appearance:none] [&::-webkit-outer-spin-button]:[appearance:none] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0";

function clampValue(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

function defaultFormat(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return "";
  if (precision !== undefined) return value.toFixed(precision);
  return String(roundTo(value, SCRUB_DECIMALS));
}

/**
 * 数値入力。入力した値はキーストロークごとに反映し、確定のために別の場所を
 * クリックする必要をなくす。上下のスピナーの代わりに、入力欄を左右へ
 * ドラッグして値をスクラブできる。クリックすればそのまま数値を打てる。
 */
export function ScrubNumberInput({
  value,
  onChange,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  onScrubCancel,
  min,
  max,
  step,
  scrubStep,
  precision,
  formatDisplay,
  placeholder,
  onClear,
  disabled = false,
  readOnly = false,
  id,
  name,
  ariaLabel,
  scrubLabel,
  prefix,
  suffix,
  size = "md",
  align = "right",
  compact = false,
  wrapperClassName,
  className,
  unstyled = false,
  tone = "light",
}: ScrubNumberInputProps) {
  const transaction = useValueScrubTransaction();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrubRef = useRef<ScrubState | null>(null);
  const [scrub, setScrub] = useState<ScrubState | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const interactive = !disabled && !readOnly;
  const perPixel = scrubStep ?? step ?? 0.1;
  const format = formatDisplay ?? ((entry: number) => defaultFormat(entry, precision));

  const emitScrubValue = (next: number) => {
    if (onScrubChange) onScrubChange(next);
    else onChange(next);
  };

  const finishScrub = (mode: "commit" | "cancel") => {
    const active = scrubRef.current;
    if (!active) return;
    scrubRef.current = null;
    setScrub(null);
    if (!active.active) return;
    if (mode === "cancel") {
      if (onScrubCancel) onScrubCancel(active.startValue);
      else if (transaction) transaction.cancel();
      else emitScrubValue(active.startValue);
      return;
    }
    if (onScrubEnd) onScrubEnd();
    else transaction?.end();
  };

  useEffect(() => {
    if (!scrub?.active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finishScrub("cancel");
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (!interactive || event.button !== 0 || scrubRef.current) return;
    // すでに編集中なら、カーソル移動と範囲選択を優先する。
    if (document.activeElement === event.currentTarget) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startValue = Number.isFinite(value) ? value : 0;
    const next: ScrubState = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startValue,
      currentValue: startValue,
      active: false,
    };
    scrubRef.current = next;
    setScrub(next);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLInputElement>) => {
    const active = scrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const horizontalDelta = event.clientX - active.clientX;
    if (!active.active) {
      if (Math.abs(event.clientX - active.clientX) < DRAG_THRESHOLD_PX) return;
      const started = { ...active, active: true };
      scrubRef.current = started;
      setScrub(started);
      setDraft(null);
      if (onScrubStart) onScrubStart();
      else transaction?.begin();
    }
    const current = scrubRef.current;
    if (!current) return;
    const modifier = event.shiftKey ? 0.1 : event.ctrlKey || event.altKey ? 10 : 1;
    const nextValue = clampValue(
      roundTo(current.currentValue + horizontalDelta * perPixel * modifier, SCRUB_DECIMALS),
      min,
      max,
    );
    const moved: ScrubState = {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      currentValue: nextValue,
    };
    scrubRef.current = moved;
    setScrub(moved);
    if (nextValue !== current.currentValue) emitScrubValue(nextValue);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLInputElement>) => {
    const active = scrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const wasDragging = active.active;
    finishScrub("commit");
    if (!wasDragging) {
      // 動かさずに離したのは通常のクリック。そのまま数値を打てるようにする。
      const input = inputRef.current;
      input?.focus({ preventScroll: true });
      input?.select();
    }
  };

  const displayValue = draft ?? format(value);

  return (
    <span className={`relative block min-w-0 ${wrapperClassName ?? ""}`}>
      {prefix !== undefined && prefix !== null ? (
        <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-slate-400">
          {prefix}
        </span>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        value={displayValue}
        min={min}
        max={max}
        step={step ?? "any"}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        title={
          interactive
            ? `${scrubLabel ? `${scrubLabel}: ` : ""}左右にドラッグして調整。Shift: 微調整、Ctrl/Alt: 大きく調整。クリックで数値を入力`
            : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => finishScrub("cancel")}
        onLostPointerCapture={() => finishScrub("cancel")}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          setDraft(raw);
          if (raw.trim() === "") {
            onClear?.();
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return;
          const next = clampValue(parsed, min, max);
          if (next !== value) onChange(next);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={`min-w-0 touch-none ${NO_NUMBER_SPINNER_CLASS} ${
          interactive ? "cursor-ew-resize focus:cursor-text" : ""
        } ${
          unstyled
            ? ""
            : `w-full rounded border outline-none ${
                size === "xs" ? "h-6" : size === "sm" ? "h-7" : "h-8"
              } ${compact ? "text-[11px]" : "text-xs"} ${
                align === "left" ? "text-left" : "text-right tabular-nums"
              } ${
                prefix !== undefined && prefix !== null
                  ? "pl-5 pr-1"
                  : compact
                    ? "px-1.5"
                    : "px-2"
              } ${suffix !== undefined && suffix !== null ? "pr-10" : ""} ${
                TONE_CLASS[tone]
              }`
        } ${className ?? ""}`}
      />
      {suffix !== undefined && suffix !== null ? (
        <span className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 text-xs text-slate-400">
          {suffix}
        </span>
      ) : null}
      {scrub?.active ? (
        <span
          className={`pointer-events-none fixed z-50 whitespace-nowrap rounded border px-2 py-1 text-[11px] font-medium tabular-nums shadow-md ${READOUT_CLASS[tone]}`}
          style={{
            left: Math.max(8, Math.min(scrub.clientX + 12, window.innerWidth - 190)),
            top: Math.max(8, Math.min(scrub.clientY + 12, window.innerHeight - 36)),
          }}
        >
          {scrubLabel ? `${scrubLabel} ` : ""}
          {format(scrub.startValue)}
          {" → "}
          {format(scrub.currentValue)}
        </span>
      ) : null}
    </span>
  );
}
