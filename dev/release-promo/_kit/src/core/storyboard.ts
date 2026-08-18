import type { ThemeName } from "./theme";

export type Point = { x: number; y: number };

/** 素材。画像でも動画でも同じ書き方で指定する。 */
export type SourceRef =
  | string
  | {
      src: string;
      type?: "image" | "video";
      /** 動画素材のみ。素材側の開始フレーム。 */
      startFrom?: number;
      /** 動画素材のみ。再生速度。 */
      playbackRate?: number;
      /** 素材の音を使う場合の音量。既定は無音。 */
      volume?: number;
    };

export type SfxId =
  | "click"
  | "tick"
  | "pop"
  | "type"
  | "whoosh"
  | "swish"
  | "zoom"
  | "riser"
  | "impact"
  | "chime"
  | "confirm";

/** シーン内の相対フレームで鳴らす効果音。 */
export type SfxCue = {
  id: SfxId;
  /** シーン先頭からの相対フレーム。 */
  at: number;
  volume?: number;
};

export type Pointer = {
  from: Point;
  to: Point;
  moveStartFrame: number;
  moveDurationInFrames: number;
  clickAtFrame?: number;
  /** 2回目以降のクリック。ドラッグ表現にも使う。 */
  extraClickFrames?: number[];
  scale?: number;
};

export type Focus = {
  x: number;
  y: number;
  scale: number;
  startFrame: number;
  durationInFrames: number;
  holdInFrames?: number;
};

/** 画面の一点を指す注釈。ズームと同じ座標系（0〜1）を使う。 */
export type Callout = {
  x: number;
  y: number;
  text: string;
  at: number;
  durationInFrames?: number;
  side?: "left" | "right" | "top" | "bottom";
};

/** キーボード操作の提示。WASD などの実操作を画面外の枠で見せる。 */
export type KeyHint = {
  keys: string[];
  label?: string;
  at: number;
  durationInFrames?: number;
  /** 押されているように見せるキーの順番。省略時は同時押し。 */
  sequence?: boolean;
};

type SceneBase = {
  id: string;
  /** どちらか一方を指定する。durationInBars は BGM の小節数。 */
  durationInFrames?: number;
  durationInBars?: number;
  /** このシーンが主張する事実。差分または実画面で裏づける。 */
  claim: string;
  /** 画面に出す短い文。音声なしで読めること。 */
  caption?: string;
  /** レビュー時の完了条件。 */
  doneWhen?: string;
  /** 明示的に鳴らす効果音。自動付与に足りない分だけ書く。 */
  sfx?: SfxCue[];
  /** シーン頭の切り替え音を止める。 */
  noTransitionSfx?: boolean;
};

export type TitleScene = SceneBase & {
  kind: "title";
  /** 既定は「XRift Studio アップデート情報」。 */
  title?: string;
  eyebrow?: string;
  version?: string;
};

export type FeatureScene = SceneBase & {
  kind: "feature";
  /** 1行目に「何が変わったか」、2行目に「何がよくなるか」。 */
  headline: string;
  subhead: string;
  eyebrow?: string;
  background?: SourceRef;
};

export type ScreenScene = SceneBase & {
  kind: "screen";
  source?: SourceRef;
  /** 画面の出どころを示すラベル。例: 実画面 / Visual Editor */
  label?: string;
  pointer?: Pointer;
  focus?: Focus;
  callouts?: Callout[];
  keyHint?: KeyHint;
};

export type CompareScene = SceneBase & {
  kind: "compare";
  before: SourceRef;
  after: SourceRef;
  beforeLabel?: string;
  afterLabel?: string;
  /** ワイプの開始フレームと長さ。 */
  wipeAtFrame?: number;
  wipeDurationInFrames?: number;
  label?: string;
};

export type BulletsScene = SceneBase & {
  kind: "bullets";
  heading: string;
  items: string[];
  background?: SourceRef;
};

export type EndScene = SceneBase & {
  kind: "end";
  featureLabel: string;
  version?: string;
  /** 次の一手。ダウンロード先やドキュメントの案内など。 */
  note?: string;
};

export type Scene =
  | TitleScene
  | FeatureScene
  | ScreenScene
  | CompareScene
  | BulletsScene
  | EndScene;

export type Storyboard = {
  id: string;
  /** 差分の範囲。extract-release-diff.mjs と揃える。 */
  from?: string;
  to?: string;
  version?: string;
  releaseStatus: "published" | "upcoming";
  scriptApproval: { status: "pending" | "approved"; approvedBy?: string };
  copyReview?: { audience: string; soundOffComprehension: boolean; status: string };
  sourceNotes?: string[];
  theme?: ThemeName;
  format: {
    width: number;
    height: number;
    fps: number;
    /** 省略時はシーンの合計から計算する。 */
    durationInFrames?: number;
    /** 収録素材の縦横比。既定は 16/9。ウィンドウ収録が 16:10 などのときに指定する。 */
    sourceAspect?: number;
  };
  music?: {
    /** _kit/assets/audio の BGM ID。none で無音。 */
    bed: "bright-120" | "calm-96" | "drive-128" | "none";
    volume?: number;
    /** 省略時は BED_BPM から引く。 */
    bpm?: number;
    fadeInInFrames?: number;
    fadeOutInFrames?: number;
  };
  sfx?: {
    enabled?: boolean;
    volume?: number;
    /** シーン種別から効果音を自動で付ける。既定は true。 */
    auto?: boolean;
  };
  scenes: Scene[];
};

/** durationInBars を含む長さをフレーム数へ解決する。 */
export const sceneDuration = (
  scene: Scene,
  framesPerBar: number,
): number => {
  if (typeof scene.durationInFrames === "number") return scene.durationInFrames;
  if (typeof scene.durationInBars === "number") return Math.round(scene.durationInBars * framesPerBar);
  throw new Error(`scene "${scene.id}": durationInFrames か durationInBars のどちらかを指定する`);
};

export const sceneStarts = (scenes: Scene[], framesPerBar: number): number[] => {
  const starts: number[] = [];
  let acc = 0;
  for (const scene of scenes) {
    starts.push(acc);
    acc += sceneDuration(scene, framesPerBar);
  }
  return starts;
};

export const totalDuration = (storyboard: Storyboard, framesPerBar: number): number =>
  storyboard.format.durationInFrames ??
  storyboard.scenes.reduce((sum, scene) => sum + sceneDuration(scene, framesPerBar), 0);

export const normalizeSource = (source: SourceRef) =>
  typeof source === "string"
    ? { src: source, type: inferType(source), startFrom: undefined, playbackRate: undefined, volume: 0 }
    : {
        src: source.src,
        type: source.type ?? inferType(source.src),
        startFrom: source.startFrom,
        playbackRate: source.playbackRate,
        volume: source.volume ?? 0,
      };

const inferType = (src: string): "image" | "video" =>
  /\.(mp4|webm|mov|m4v)$/i.test(src) ? "video" : "image";
