import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Point = { x: number; y: number };
type BaseScene = {
  id: string;
  durationInFrames: number;
  claim: string;
  caption: string;
  doneWhen: string;
};
type HookSceneData = BaseScene & { kind: "hook" };
type ScreenFocusSceneData = BaseScene & {
  kind: "screen-focus";
  source: { type: "image"; src: string; width: number; height: number };
  pointer: { from: Point; to: Point; moveStartFrame: number; moveDurationInFrames: number; clickAtFrame: number; scale: number };
  focus: { x: number; y: number; scale: number; startFrame: number; durationInFrames: number; holdInFrames: number };
};
type ProofSceneData = BaseScene & {
  kind: "proof";
  displayLabel: string;
  errorTitle: string;
  errorRecovery: string;
  errorDetail: string;
  pointer: { from: Point; to: Point; moveStartFrame: number; moveDurationInFrames: number; clickAtFrame: number; scale: number };
  focus: { x: number; y: number; scale: number; startFrame: number; durationInFrames: number; holdInFrames: number };
};
type BeforeAfterSceneData = BaseScene & { kind: "before-after"; before: string; after: string };
type CtaSceneData = BaseScene & { kind: "cta" };
type Scene = HookSceneData | ScreenFocusSceneData | ProofSceneData | BeforeAfterSceneData | CtaSceneData;
export type Storyboard = {
  format: { width: number; height: number; fps: number; durationInFrames: number };
  scenes: Scene[];
};

const FONT = '"Yu Gothic UI", "Meiryo", sans-serif';
const PURPLE = "#7c3aed";
const CYAN = "#22d3ee";
const INK = "#111827";

export const FeaturePromo = ({ storyboard }: { storyboard: Storyboard }) => {
  let start = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily: FONT }}>
      {storyboard.scenes.map((scene) => {
        const from = start;
        start += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames}>
            <SceneRenderer scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneRenderer = ({ scene }: { scene: Scene }) => {
  if (scene.kind === "hook") return <HookScene scene={scene} />;
  if (scene.kind === "screen-focus") return <UploadScene scene={scene} />;
  if (scene.kind === "proof") return <DiagnosticScene scene={scene} />;
  if (scene.kind === "before-after") return <BeforeAfterScene scene={scene} />;
  return <CtaScene scene={scene} />;
};

const HookScene = ({ scene }: { scene: HookSceneData }) => {
  const frame = useCurrentFrame();
  const reveal = spring({ frame, fps: 30, config: { damping: 200 } });
  const opacity = interpolate(reveal, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ padding: 132, justifyContent: "center", opacity }}>
      <div style={{ color: "#a5b4fc", fontSize: 30, letterSpacing: 5, marginBottom: 28 }}>
        XRIFT STUDIO / NEXT UPDATE
      </div>
      <div style={{ color: "white", fontSize: 86, fontWeight: 700, lineHeight: 1.12, maxWidth: 1380 }}>
        公開エラーの
        <br />
        次の一手まで、見えるように
      </div>
      <div style={{ marginTop: 42, color: "#cbd5e1", fontSize: 32 }}>{scene.caption}</div>
      <div style={{ position: "absolute", right: 132, bottom: 112, color: "#64748b", fontSize: 22 }}>
        RELEASE PREVIEW
      </div>
      <div style={{ position: "absolute", right: 140, top: 112, width: 150, height: 150, border: `2px solid ${PURPLE}`, borderRadius: 36, transform: `rotate(${frame * 0.3}deg)` }} />
    </AbsoluteFill>
  );
};

const UploadScene = ({ scene }: { scene: ScreenFocusSceneData }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const source = { x: 160, y: 122, width: 1600, height: 900 };
  const focusProgress = spring({ frame: Math.max(0, frame - scene.focus.startFrame), fps: 30, config: { damping: 200 } });
  const scale = interpolate(focusProgress, [0, 1], [1, scene.focus.scale], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const targetTranslateX = Math.min(0, Math.max(source.width * (1 - scene.focus.scale), (0.5 - scene.focus.x * scene.focus.scale) * source.width));
  const targetTranslateY = Math.min(0, Math.max(source.height * (1 - scene.focus.scale), (0.5 - scene.focus.y * scene.focus.scale) * source.height));
  const translateX = interpolate(focusProgress, [0, 1], [0, targetTranslateX], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const translateY = interpolate(focusProgress, [0, 1], [0, targetTranslateY], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pointer = {
    x: source.x + scene.pointer.to.x * source.width * scale + translateX,
    y: source.y + scene.pointer.to.y * source.height * scale + translateY,
  };

  return (
    <AbsoluteFill>
      <TopLabel text="実画面 / Visual Editor" />
      <div style={{ position: "absolute", left: source.x - 8, top: source.y - 8, width: source.width + 16, height: source.height + 16, borderRadius: 20, border: "1px solid #475569", overflow: "hidden", boxShadow: "0 22px 80px rgba(0,0,0,.45)" }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }}>
          <Img src={staticFile("source/visual-editor-screenshot.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(15,23,42,.08), rgba(15,23,42,.18))" }} />
      </div>
      <Pointer x={pointer.x} y={pointer.y} from={sourcePoint(scene.pointer.from, source)} clickAt={scene.pointer.clickAtFrame} scale={scene.pointer.scale} />
      <FocusRing x={pointer.x} y={pointer.y} progress={focusProgress} />
      <Caption text={scene.caption} />
      <div style={{ position: "absolute", left: width - 470, top: height - 146, color: "#cbd5e1", fontSize: 22 }}>公開ボタンへフォーカス</div>
    </AbsoluteFill>
  );
};

const DiagnosticScene = ({ scene }: { scene: ProofSceneData }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const source = { x: 0, y: 0, width, height };
  const cardProgress = spring({ frame: Math.max(0, frame - 18), fps: 30, config: { damping: 180 } });
  const cardY = interpolate(cardProgress, [0, 1], [72, 0]);
  const pointer = { x: 1360, y: 610 };
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, opacity: 0.26 }}>
        <Img src={staticFile("source/visual-editor-screenshot.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.78)" }} />
      <TopLabel text={scene.displayLabel} />
      <div style={{ position: "absolute", left: 228, top: 220 + cardY, width: 1464, borderRadius: 28, background: "#f8fafc", padding: 52, color: INK, boxShadow: "0 28px 100px rgba(0,0,0,.42)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#dc2626", fontSize: 28, fontWeight: 700 }}>
          <div style={{ width: 22, height: 22, borderRadius: 99, background: "#ef4444" }} />
          公開処理の診断
        </div>
        <div style={{ marginTop: 26, fontSize: 42, fontWeight: 700 }}>{scene.errorTitle}</div>
        <div style={{ marginTop: 24, borderLeft: `6px solid ${PURPLE}`, background: "#ede9fe", padding: "24px 28px", color: "#4c1d95", fontSize: 28, lineHeight: 1.45 }}>
          {scene.errorRecovery}
        </div>
        <div style={{ marginTop: 22, color: "#475569", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 22 }}>
          {scene.errorDetail}
        </div>
        <div style={{ marginTop: 34, display: "flex", gap: 18 }}>
          <Pill text="原因を保持" color={CYAN} />
          <Pill text="復旧方法を表示" color={PURPLE} />
          <Pill text="安全に再試行" color="#10b981" />
        </div>
      </div>
      <Pointer x={pointer.x} y={pointer.y} from={{ x: 920, y: 590 }} clickAt={110} scale={scene.pointer.scale} />
      <FocusRing x={pointer.x} y={pointer.y} progress={spring({ frame: Math.max(0, frame - 82), fps: 30, config: { damping: 180 } })} />
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

const BeforeAfterScene = ({ scene }: { scene: BeforeAfterSceneData }) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame, fps: 30, config: { damping: 180 } });
  const leftX = interpolate(progress, [0, 1], [-40, 0]);
  const rightX = interpolate(progress, [0, 1], [40, 0]);
  return (
    <AbsoluteFill style={{ padding: 120 }}>
      <TopLabel text="差分から見える改善" />
      <div style={{ position: "absolute", left: 120, top: 250, width: 760, height: 390, borderRadius: 26, background: "#1e293b", border: "1px solid #475569", padding: 38, transform: `translateX(${leftX}px)`, opacity: progress }}>
        <div style={{ color: "#94a3b8", fontSize: 24, marginBottom: 28 }}>BEFORE</div>
        <div style={{ color: "#fca5a5", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 28, lineHeight: 1.45 }}>{scene.before}</div>
        <div style={{ marginTop: 48, color: "#94a3b8", fontSize: 23 }}>原因も復旧方法も、ここからは分からない</div>
      </div>
      <div style={{ position: "absolute", left: 1040, top: 250, width: 760, height: 390, borderRadius: 26, background: "#fafafa", padding: 38, transform: `translateX(${rightX}px)`, opacity: progress, color: INK }}>
        <div style={{ color: PURPLE, fontSize: 24, marginBottom: 28, fontWeight: 700 }}>AFTER</div>
        <div style={{ color: "#312e81", fontSize: 28, lineHeight: 1.45, fontWeight: 700 }}>{scene.after}</div>
        <div style={{ marginTop: 48, color: "#475569", fontSize: 23 }}>エラーの次の一手へ、そのままつなげる</div>
      </div>
      <div style={{ position: "absolute", left: 916, top: 410, width: 88, height: 2, background: CYAN, opacity: progress }} />
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

const CtaScene = ({ scene }: { scene: CtaSceneData }) => {
  const frame = useCurrentFrame();
  const reveal = spring({ frame, fps: 30, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #111827 0%, #312e81 100%)" }}>
      <div style={{ color: "#a5b4fc", fontSize: 28, letterSpacing: 4, opacity: reveal }}>XRIFT STUDIO</div>
      <div style={{ marginTop: 30, color: "white", fontSize: 68, fontWeight: 700, opacity: reveal }}>{scene.caption}</div>
      <div style={{ marginTop: 34, color: "#cbd5e1", fontSize: 26, opacity: reveal }}>次回アップデート / RELEASE PREVIEW</div>
      <div style={{ position: "absolute", width: 560, height: 560, borderRadius: 999, border: `1px solid rgba(165,180,252,.38)`, transform: `scale(${interpolate(reveal, [0, 1], [0.8, 1])})` }} />
    </AbsoluteFill>
  );
};

const TopLabel = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", left: 112, top: 72, zIndex: 20, color: "#cbd5e1", fontSize: 24, letterSpacing: 2 }}>{text}</div>
);

const Caption = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", left: 112, bottom: 58, zIndex: 30, padding: "18px 28px", borderRadius: 14, background: "rgba(15,23,42,.88)", color: "white", fontSize: 28, fontWeight: 700, boxShadow: "0 10px 30px rgba(0,0,0,.28)" }}>{text}</div>
);

const Pill = ({ text, color }: { text: string; color: string }) => (
  <div style={{ borderRadius: 999, padding: "10px 18px", border: `1px solid ${color}`, color, fontSize: 22 }}>{text}</div>
);

const sourcePoint = (point: Point, source: { x: number; y: number; width: number; height: number }) => ({ x: source.x + point.x * source.width, y: source.y + point.y * source.height });

const Pointer = ({ x, y, from, clickAt, scale }: { x: number; y: number; from: Point; clickAt: number; scale: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: Math.max(0, frame - 18), fps, config: { damping: 180 } });
  const currentX = interpolate(progress, [0, 1], [from.x, x]);
  const currentY = interpolate(progress, [0, 1], [from.y, y]);
  const click = spring({ frame: Math.max(0, frame - clickAt), fps, config: { damping: 120 } });
  const clickScale = interpolate(click, [0, 1], [1.18, 0.92]);
  return (
    <div style={{ position: "absolute", left: currentX, top: currentY, zIndex: 40, transform: `translate(-5px, -3px) scale(${scale * clickScale})`, transformOrigin: "top left", filter: "drop-shadow(0 5px 7px rgba(0,0,0,.5))" }}>
      <svg width="52" height="68" viewBox="0 0 52 68" fill="none">
        <path d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z" fill="white" stroke="#111827" strokeWidth="5" strokeLinejoin="round" />
        <path d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z" fill="#c4b5fd" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: 4, top: 6, width: 62, height: 62, borderRadius: 999, border: `3px solid ${CYAN}`, opacity: interpolate(click, [0, 1], [0.1, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `scale(${interpolate(click, [0, 1], [0.7, 1.4])})` }} />
    </div>
  );
};

const FocusRing = ({ x, y, progress }: { x: number; y: number; progress: number }) => (
  <div style={{ position: "absolute", left: x - 48, top: y - 48, width: 96, height: 96, zIndex: 35, border: `4px solid ${CYAN}`, borderRadius: 999, opacity: interpolate(progress, [0, 1], [0, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `scale(${interpolate(progress, [0, 1], [0.72, 1.16], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`, boxShadow: `0 0 0 8px rgba(34,211,238,.14)` }} />
);
