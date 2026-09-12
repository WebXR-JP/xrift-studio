import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Dispatched on this viewport's canvas, never on the whole editor. */
export const WORLD_PLAY_TOUCH_INTERACT_EVENT = "xrift-studio:play-touch-interact";

type HeldInput = {
  code: string;
  key: string;
  surface: HTMLCanvasElement;
};

const MOVEMENT_BUTTONS = [
  { code: "KeyW", key: "w", label: "前へ移動", Icon: ArrowUp, position: "col-start-2 row-start-1" },
  { code: "KeyA", key: "a", label: "左へ移動", Icon: ArrowLeft, position: "col-start-1 row-start-2" },
  { code: "KeyS", key: "s", label: "後ろへ移動", Icon: ArrowDown, position: "col-start-2 row-start-2" },
  { code: "KeyD", key: "d", label: "右へ移動", Icon: ArrowRight, position: "col-start-3 row-start-2" },
] as const;

function sendKey(input: HeldInput, type: "keydown" | "keyup") {
  // PhysicsPlayer owns the movement implementation and listens in window's
  // capture phase. Starting at the canvas gives it the normal event path and
  // keeps the source distinguishable from Inspector text input.
  input.surface.dispatchEvent(new KeyboardEvent(type, {
    code: input.code,
    key: input.key,
    bubbles: true,
    cancelable: true,
  }));
}

/** DOM sibling of Canvas; mount only while touch World Play is running. */
export function WorldPlayTouchControls({
  viewportRef,
  canInteract,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  canInteract: boolean;
}) {
  const heldRef = useRef(new Map<number, HeldInput>());
  const [pressedCodes, setPressedCodes] = useState<ReadonlySet<string>>(new Set());

  const syncPressed = useCallback(() => {
    setPressedCodes(new Set([...heldRef.current.values()].map((input) => input.code)));
  }, []);

  const releasePointer = useCallback((pointerId: number) => {
    const input = heldRef.current.get(pointerId);
    if (!input) return;
    heldRef.current.delete(pointerId);
    if (![...heldRef.current.values()].some((held) => held.code === input.code)) {
      sendKey(input, "keyup");
    }
    syncPressed();
  }, [syncPressed]);

  const releaseAll = useCallback(() => {
    const released = new Set<string>();
    for (const input of heldRef.current.values()) {
      if (released.has(input.code)) continue;
      released.add(input.code);
      sendKey(input, "keyup");
    }
    heldRef.current.clear();
  }, []);

  useEffect(() => {
    const endPointer = (event: PointerEvent) => releasePointer(event.pointerId);
    const cancelInputs = () => {
      releaseAll();
      syncPressed();
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancelInputs();
    };
    const onOutsideInput = (event: Event) => {
      if (event.target instanceof Node && !viewportRef.current?.contains(event.target)) {
        cancelInputs();
      }
    };
    window.addEventListener("pointerup", endPointer, true);
    window.addEventListener("pointercancel", endPointer, true);
    window.addEventListener("blur", cancelInputs);
    window.addEventListener("pagehide", cancelInputs);
    window.addEventListener("pointerdown", onOutsideInput, true);
    window.addEventListener("focusin", onOutsideInput);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointerup", endPointer, true);
      window.removeEventListener("pointercancel", endPointer, true);
      window.removeEventListener("blur", cancelInputs);
      window.removeEventListener("pagehide", cancelInputs);
      window.removeEventListener("pointerdown", onOutsideInput, true);
      window.removeEventListener("focusin", onOutsideInput);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseAll();
    };
  }, [releaseAll, releasePointer, syncPressed, viewportRef]);

  const press = (event: ReactPointerEvent<HTMLButtonElement>, code: string, key: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    const surface = viewport?.querySelector("canvas");
    if (!surface) return;
    viewport?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const alreadyPressed = [...heldRef.current.values()].some((input) => input.code === code);
    const input = { code, key, surface };
    heldRef.current.set(event.pointerId, input);
    if (!alreadyPressed) sendKey(input, "keydown");
    syncPressed();
  };

  const buttonClass = (pressed: boolean) =>
    `pointer-events-auto flex h-11 min-w-11 touch-none select-none items-center justify-center rounded-md border text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
      pressed
        ? "border-slate-500 bg-slate-200 text-slate-900"
        : "border-slate-300 bg-white/95 text-slate-700 active:bg-slate-100"
    }`;

  return (
    <div
      data-world-play-touch-controls
      className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex select-none items-end justify-between gap-3"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-3 grid-rows-2 gap-1" role="group" aria-label="移動">
        {MOVEMENT_BUTTONS.map(({ code, key, label, Icon, position }) => (
          <button
            key={code}
            type="button"
            className={`${buttonClass(pressedCodes.has(code))} ${position}`}
            aria-label={label}
            title={label}
            aria-pressed={pressedCodes.has(code)}
            onPointerDown={(event) => press(event, code, key)}
            onLostPointerCapture={(event) => releasePointer(event.pointerId)}
            onClick={(event) => event.stopPropagation()}
          >
            <Icon size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={`${buttonClass(false)} px-4 disabled:opacity-50`}
          disabled={!canInteract}
          title={canInteract ? "中央の対象を操作" : "操作できる対象に中央の照準を合わせる"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            const surface = viewportRef.current?.querySelector("canvas");
            surface?.dispatchEvent(new CustomEvent(WORLD_PLAY_TOUCH_INTERACT_EVENT));
          }}
        >
          操作
        </button>
        <button
          type="button"
          className={`${buttonClass(pressedCodes.has("Space"))} px-4`}
          title="ジャンプ"
          aria-pressed={pressedCodes.has("Space")}
          onPointerDown={(event) => press(event, "Space", " ")}
          onLostPointerCapture={(event) => releasePointer(event.pointerId)}
          onClick={(event) => event.stopPropagation()}
        >
          ジャンプ
        </button>
      </div>
    </div>
  );
}
