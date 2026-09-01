/**
 * How one node is drawn on the graph canvas.
 *
 * Kept apart from the editor because the card is the piece with the layout
 * rules — one fixed width for every operation, sockets at known offsets so the
 * wires meet them — and those rules are what「ノードがはみ出す」came from. The
 * editor decides what a card says; this file decides how big it is.
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  INTERACTIVITY_NODE_CARD_WIDTH,
  type InteractivityOperationTemplate,
  type InteractivityRuntimeSupport,
} from "../../lib/visual-editor";

export type GraphNodeCategory = InteractivityOperationTemplate["category"] | "extension";

export type GraphNodeData = {
  index: number;
  op: string;
  label: string;
  category: GraphNodeCategory;
  flowInputs: string[];
  flowOutputs: string[];
  valueInputs: string[];
  valueOutputs: string[];
  runtimeSupport: InteractivityRuntimeSupport;
  /**
   * What the operation does, from its template.
   *
   * Shown on hover rather than on the card: thirty cards each carrying two
   * lines of explanation stop reading as a structure. The tooltip is where an
   * author asks「これは何をするノードだったか」about one card at a time.
   */
  description?: string;
  /** One-line description of an Interaction Trigger action's target. */
  summary?: string;
  /**
   * When this node first ran in the timeline's dry run.
   *
   * `undefined` while the timeline is closed and nothing has been analysed;
   * `null` once it has been, and this node never ran.
   */
  reachedSeconds?: number | null;
};

/**
 * Card label for an operation Play will not run.
 *
 * Only the two states an author has to act on are labelled; a fully executed
 * operation stays unmarked so the badge means something when it appears.
 */
export const RUNTIME_SUPPORT_BADGE: Partial<
  Record<
    InteractivityRuntimeSupport,
    { label: string; title: string; className: string }
  >
> = {
  ignored: {
    label: "Play未対応",
    title:
      "Play の実行エンジンがこの operation を実行しません。詳細は右の Diagnostics を確認してください",
    className: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  },
  conditional: {
    // Not「接続が必要」. Nothing is missing on the node — an animation node with
    // its clip typed in is complete — and a badge that says a connection is
    // required reads as an error the author cannot find. What it actually
    // depends on is the Entity the graph is attached to, which the banner
    // above the canvas already names.
    label: "付け先しだい",
    title:
      "このノードは実行されます。実際に何が動くかは、このグラフを付けた Entity が持つ Model・Material・音源などで決まります",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  },
};

export type GraphFlowNode = Node<GraphNodeData, "interactivity">;

/**
 * Node colours for a dark canvas.
 *
 * These were the light Tailwind steps (`bg-sky-50` and friends) while the
 * canvas sits at `slate-900` under `colorMode="dark"`, so every card glowed
 * white against it and the whole editor read as a different application from
 * the rest of Studio. The hue still carries the category; only the value
 * changed, so a graph an author already knows stays recognisable.
 */
export const CATEGORY_CLASS: Record<GraphNodeCategory, string> = {
  event: "border-sky-500/70 bg-sky-950 text-sky-50",
  flow: "border-violet-500/70 bg-violet-950 text-violet-50",
  animation: "border-emerald-500/70 bg-emerald-950 text-emerald-50",
  variable: "border-amber-500/70 bg-amber-950 text-amber-50",
  pointer: "border-cyan-500/70 bg-cyan-950 text-cyan-50",
  math: "border-slate-500/70 bg-slate-800 text-slate-50",
  entity: "border-orange-500/70 bg-orange-950 text-orange-50",
  extension: "border-fuchsia-500/70 bg-fuchsia-950 text-fuchsia-50",
};

/** The same hues as flat colours, so the minimap is a map and not a legend of its own. */
export const CATEGORY_MINIMAP_COLOR: Record<GraphNodeCategory, string> = {
  event: "#0284c7",
  flow: "#7c3aed",
  animation: "#059669",
  variable: "#d97706",
  pointer: "#0891b2",
  math: "#475569",
  entity: "#ea580c",
  extension: "#c026d3",
};

export const CATEGORY_LABEL: Record<GraphNodeCategory, string> = {
  event: "イベント",
  flow: "フロー",
  animation: "アニメーション",
  variable: "変数",
  pointer: "glTFプロパティ",
  math: "数値",
  entity: "Entity操作",
  extension: "拡張",
};

export const PALETTE_CATEGORY_ORDER: readonly GraphNodeCategory[] = [
  "event",
  "entity",
  "flow",
  "animation",
  "pointer",
  "variable",
  "math",
];

/**
 * Stable prop identities for the canvas.
 *
 * A fresh array here re-subscribes React Flow's key handler on every render,
 * and a re-render triggered by the key press itself then misses the key up:
 * the handler stays latched and the *next* Delete does nothing at all.
 */
export const DELETE_KEY_CODES: string[] = ["Backspace", "Delete"];
export const FIT_VIEW_OPTIONS = { padding: 0.25 } as const;

/**
 * Japanese names for the sockets an author actually reads.
 *
 * The canonical names are part of the KHR contract and stay in the saved JSON,
 * but `err`, `lastDelay` and `timeSinceLastTick` are not what a card should
 * show to someone building a sequence. The raw name stays in the row's tooltip,
 * so the two never drift apart in the author's head.
 */
export const SOCKET_LABELS: Readonly<Record<string, string>> = {
  in: "入力",
  out: "出力",
  done: "完了後",
  err: "失敗時",
  cancel: "取り消し",
  reset: "やり直し",
  completed: "すべて完了後",
  loopBody: "繰り返す先",
  default: "その他",
  condition: "条件",
  selection: "選ぶ番号",
  duration: "秒数",
  delay: "待機ID",
  lastDelay: "待機ID",
  value: "値",
  animation: "クリップ番号",
  startTime: "開始位置",
  endTime: "終了位置",
  stopTime: "停止位置",
  speed: "速度",
  n: "回数",
  startIndex: "開始番号",
  endIndex: "終了番号",
  index: "現在の番号",
  currentCount: "通った回数",
  remainingInputs: "残りの入力",
  lastRemainingTime: "残り秒数",
  event: "イベント",
  timeSinceStart: "開始からの秒",
  timeSinceLastTick: "前フレームからの秒",
  material: "Material",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
};

/** Numbered sockets read as positions, not as names. */
export function socketDisplayLabel(socket: string): string {
  const named = SOCKET_LABELS[socket];
  if (named) return named;
  return /^\d+$/.test(socket) ? `${Number(socket) + 1}番目` : socket;
}

/**
 * Every node is the same width.
 *
 * A card that grew to fit its longest line pushed its own summary past the
 * border and made the canvas read as a pile of different objects. One width
 * means the graph reads as a structure, and nothing can stick out of a card.
 */
export const NODE_CARD_WIDTH = INTERACTIVITY_NODE_CARD_WIDTH;

export const FLOW_SOCKET_COLOR = "#a78bfa";
export const VALUE_SOCKET_COLOR = "#22d3ee";

const SOCKET_ROW_HEIGHT = 20;
const SOCKET_ROW_PADDING = 6;

/**
 * Where a socket handle sits inside the node body.
 *
 * This has to agree with the row layout below it, not with a constant tuned by
 * eye: a handle that floats away from the label it belongs to is what makes an
 * author drag a wire into the wrong socket.
 */
function socketTop(index: number): number {
  return SOCKET_ROW_PADDING + index * SOCKET_ROW_HEIGHT + SOCKET_ROW_HEIGHT / 2;
}

/**
 * How the canvas moves under the pointer.
 *
 * Wheel and trackpad pan; Ctrl and wheel zooms. The library default is the
 * opposite, so scrolling to look at the next node pushed the whole graph into
 * the distance instead of moving the canvas, which is the single thing that
 * made this editor feel like it was fighting the author.
 */
/** Matches the background dots, so a snapped node lines up with what is drawn. */
export const CANVAS_GRID: [number, number] = [24, 24];

export const CANVAS_NAVIGATION = {
  panOnScroll: true,
  panOnDrag: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  minZoom: 0.2,
  maxZoom: 2,
} as const;

/**
 * What each socket is for, in the words an author would use.
 *
 * 「出力」and「イベント」sit next to each other on the same card and say
 * nothing about which one to drag: one continues the flow, the other is a value
 * another node reads. Hovering has to answer that, because the colour alone
 * only says they are different.
 */
const SOCKET_HINTS: Readonly<Record<string, string>> = {
  in: "ここへ前のノードの流れをつなぎます",
  out: "この操作を始めた直後に、次のノードへ進みます",
  done: "この操作が終わってから、次のノードへ進みます",
  err: "この操作ができなかったときに、次のノードへ進みます",
  cancel: "ここへ流れが来ると、待機を取り消します",
  reset: "ここへ流れが来ると、数えた回数や状態を戻します",
  completed: "必要な入力がすべて揃ってから進みます",
  loopBody: "繰り返しの 1 回ごとに、ここから先が動きます",
  default: "どの番号にも当てはまらなかったときに進みます",
  condition: "true か false を出すノードをつなぎます",
  selection: "整数を出すノードをつなぎます。その番号の出力へ進みます",
  duration: "秒数。0 ならその場で、正の値ならその時間をかけて変わります",
  delay: "取り消したい待機の ID。「指定した秒だけ待つ」の待機ID からつなぎます",
  lastDelay: "この待機の ID。「待機を取り消す」の待機ID へつなげます",
  value: "書き込む値。数を出すノードをつないでも、直接入力してもかまいません",
  animation: "再生するクリップの番号",
  startTime: "クリップの何秒目から再生するか",
  endTime: "クリップの何秒目で止めるか",
  stopTime: "何秒目で止めるか",
  speed: "再生の速さ。1 が等速、2 で倍速",
  n: "何回まで通すか",
  startIndex: "繰り返しの開始番号",
  endIndex: "繰り返しの終了番号",
  index: "いま何回目かを出します。他のノードの値としてつなげます",
  currentCount: "ここまでに通した回数を出します",
  remainingInputs: "あと何本の入力を待っているかを出します",
  lastRemainingTime: "次に通せるようになるまでの残り秒数を出します",
  timeSinceStart: "ワールドが始まってからの秒数を出します",
  timeSinceLastTick:
    "前のフレームからの秒数を出します。速さを掛けると、フレームレートに関わらず同じ速度で動きます",
  isValid: "変数を読めたかどうかを出します",
  material: "書き込む先の Material。下のピッカーで選びます",
  p1: "補間の効き方を決める制御点。0〜1 の間で指定します",
  p2: "補間の効き方を決める制御点。0〜1 の間で指定します",
  event: "このノードが動いたことを値として出します",
  a: "1 つめの値",
  b: "2 つめの値",
  c: "3 つめの値",
  d: "4 つめの値",
};

function socketHint(socket: string, kind: "flow" | "value", side: "left" | "right"): string {
  const hint =
    SOCKET_HINTS[socket] ??
    // A numbered socket has no name to look up, and「2番目」on its own does not
    // say whether the author is looking at an order, a choice or a wait.
    (/^\d+$/.test(socket) && kind === "flow"
      ? side === "right"
        ? "上から数えてこの位置の行き先です。ノードによって、順番に進むか、番号で選ばれます"
        : "この位置の入力です。ここへ流れが来たことを、このノードが数えます"
      : undefined);
  const role =
    kind === "flow"
      ? side === "left"
        ? "flow の入力"
        : "flow の出力"
      : side === "left"
        ? "value の入力"
        : "value の出力";
  return hint ? `${socket}（${role}）\n${hint}` : `${socket}（${role}）`;
}

function SocketRow({
  socket,
  side,
  kind,
}: {
  socket: string;
  side: "left" | "right";
  kind: "flow" | "value";
}) {
  return (
    <p
      title={socketHint(socket, kind, side)}
      className={`h-5 truncate leading-5 ${side === "right" ? "text-right" : "text-left"} ${
        kind === "flow" ? "font-semibold text-violet-200" : "text-cyan-200"
      }`}
    >
      {socketDisplayLabel(socket)}
    </p>
  );
}

export function InteractivityNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  const badge = RUNTIME_SUPPORT_BADGE[data.runtimeSupport];
  const reachedSeconds = data.reachedSeconds;
  const unreached = reachedSeconds === null;
  return (
    <article
      style={{ width: NODE_CARD_WIDTH }}
      // No `overflow-hidden`: React Flow places the socket handles half outside
      // the border on purpose, and clipping them would leave nothing to grab.
      // The fixed width plus truncation is what keeps the content inside.
      className={`rounded-lg border-2 shadow-lg transition-opacity ${
        CATEGORY_CLASS[data.category]
      } ${
        selected ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-slate-900" : ""
      } ${unreached ? "opacity-45" : ""}`}
    >
      <header className="rounded-t-md border-b border-white/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.12em] opacity-60">
            {CATEGORY_LABEL[data.category]}
          </p>
          {unreached ? (
            <span
              title="タイムラインの範囲内では、このノードは一度も動きませんでした"
              className="shrink-0 rounded border border-slate-400/40 bg-slate-400/10 px-1.5 py-px text-[9px] font-semibold text-slate-300"
            >
              未到達
            </span>
          ) : reachedSeconds === undefined ? null : (
            <span
              title="タイムラインの実行で、このノードが最初に動いた時刻です"
              className="shrink-0 rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-emerald-200"
            >
              {Math.round(reachedSeconds * 100) / 100}s
            </span>
          )}
          {badge ? (
            <span
              title={badge.title}
              className={`shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <p
          title={data.description ? `${data.label}\n${data.description}` : data.label}
          className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-[1.3]"
        >
          {data.label}
        </p>
        {data.summary ? (
          <p
            title={data.summary}
            className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-90"
          >
            {data.summary}
          </p>
        ) : null}
        <code
          title={data.op}
          className="mt-0.5 block truncate text-[10px] opacity-60"
        >
          {data.op}
        </code>
      </header>
      <div className="relative min-h-10 px-3 py-2 text-[11px]">
        <div className="grid grid-cols-2 gap-x-4">
          <div className="min-w-0">
            {data.flowInputs.map((socket) => (
              <SocketRow
                key={`flow-in-${socket}`}
                socket={socket}
                side="left"
                kind="flow"
              />
            ))}
            {data.valueInputs.map((socket) => (
              <SocketRow
                key={`value-in-${socket}`}
                socket={socket}
                side="left"
                kind="value"
              />
            ))}
          </div>
          <div className="min-w-0">
            {data.flowOutputs.map((socket) => (
              <SocketRow
                key={`flow-out-${socket}`}
                socket={socket}
                side="right"
                kind="flow"
              />
            ))}
            {data.valueOutputs.map((socket) => (
              <SocketRow
                key={`value-out-${socket}`}
                socket={socket}
                side="right"
                kind="value"
              />
            ))}
          </div>
        </div>
        {data.flowInputs.map((socket, index) => (
          <Handle
            key={`flow-in-${socket}`}
            id={`flow-in:${socket}`}
            type="target"
            position={Position.Left}
            style={{ top: socketTop(index), width: 10, height: 10, background: FLOW_SOCKET_COLOR }}
          />
        ))}
        {data.valueInputs.map((socket, index) => (
          <Handle
            key={`value-in-${socket}`}
            id={`value-in:${socket}`}
            type="target"
            position={Position.Left}
            style={{
              top: socketTop(data.flowInputs.length + index),
              width: 10,
              height: 10,
              borderRadius: 2,
              background: VALUE_SOCKET_COLOR,
            }}
          />
        ))}
        {data.flowOutputs.map((socket, index) => (
          <Handle
            key={`flow-out-${socket}`}
            id={`flow-out:${socket}`}
            type="source"
            position={Position.Right}
            style={{ top: socketTop(index), width: 10, height: 10, background: FLOW_SOCKET_COLOR }}
          />
        ))}
        {data.valueOutputs.map((socket, index) => (
          <Handle
            key={`value-out-${socket}`}
            id={`value-out:${socket}`}
            type="source"
            position={Position.Right}
            style={{
              top: socketTop(data.flowOutputs.length + index),
              width: 10,
              height: 10,
              borderRadius: 2,
              background: VALUE_SOCKET_COLOR,
            }}
          />
        ))}
      </div>
    </article>
  );
}

export const nodeTypes = { interactivity: InteractivityNodeCard };
