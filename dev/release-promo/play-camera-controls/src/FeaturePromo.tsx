import {
  AbsoluteFill,
  Audio,
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

type SeriesTitleScene = BaseScene & { kind: "series-title" };
type FeatureIntroScene = BaseScene & {
  kind: "feature-intro";
  source: string;
  titleLines: [string, string];
};
type ScreenFocusScene = BaseScene & {
  kind: "screen-focus";
  source: string;
  pointer: {
    from: Point;
    to: Point;
    moveStartFrame: number;
    moveDurationInFrames: number;
    clickAtFrame: number;
    scale: number;
  };
  focus: {
    x: number;
    y: number;
    scale: number;
    startFrame: number;
    durationInFrames: number;
    holdInFrames: number;
  };
};
type PlayControlsScene = BaseScene & {
  kind: "play-controls";
  source: string;
  focus: {
    x: number;
    y: number;
    scale: number;
    startFrame: number;
    durationInFrames: number;
    holdInFrames: number;
  };
};
type MovementResultScene = BaseScene & {
  kind: "movement-result";
  sourceBefore: string;
  sourceAfter: string;
};
type CtaScene = BaseScene & { kind: "cta"; featureLabel: string };

type Scene =
  | SeriesTitleScene
  | FeatureIntroScene
  | ScreenFocusScene
  | PlayControlsScene
  | MovementResultScene
  | CtaScene;

export type Storyboard = {
  format: { width: number; height: number; fps: number; durationInFrames: number };
  audio: { src: string; volume: number };
  scenes: Scene[];
};

const FONT = '"Yu Gothic UI", "Meiryo", sans-serif';
const INK = "#0b1020";
const PURPLE = "#7c3aed";
const LILAC = "#c4b5fd";
const CYAN = "#67e8f9";

export const FeaturePromo = ({ storyboard }: { storyboard: Storyboard }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily: FONT }}>
      <Audio src={staticFile(storyboard.audio.src)} volume={storyboard.audio.volume} />
      {storyboard.scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={storyboard.scenes.slice(0, index).reduce((sum, item) => sum + item.durationInFrames, 0)}
          durationInFrames={scene.durationInFrames}
        >
          <SceneRenderer scene={scene} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const SceneRenderer = ({ scene }: { scene: Scene }) => {
  switch (scene.kind) {
    case "series-title":
      return <SeriesTitle scene={scene} />;
    case "feature-intro":
      return <FeatureIntro scene={scene} />;
    case "screen-focus":
      return <EnterPlay scene={scene} />;
    case "play-controls":
      return <PlayControls scene={scene} />;
    case "movement-result":
      return <MovementResult scene={scene} />;
    case "cta":
      return <PublishedCta scene={scene} />;
  }
};

const SeriesTitle = ({ scene }: { scene: SeriesTitleScene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });
  const lineWidth = interpolate(reveal, [0, 1], [0, 214], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 820, height: 820, right: -245, top: -365, borderRadius: 999, border: "1px solid rgba(196,181,253,.25)" }} />
      <div style={{ position: "absolute", width: 560, height: 560, left: -190, bottom: -360, borderRadius: 999, background: "radial-gradient(circle, rgba(124,58,237,.30), transparent 70%)" }} />
      <div style={{ color: LILAC, fontSize: 30, letterSpacing: 3.5, fontWeight: 700, opacity: reveal }}>
        XRIFT STUDIO
      </div>
      <div style={{ marginTop: 26, color: "white", fontSize: 74, fontWeight: 700, letterSpacing: 1, opacity: reveal }}>
        {scene.caption}
      </div>
      <div style={{ width: lineWidth, height: 5, marginTop: 34, borderRadius: 999, background: "linear-gradient(90deg, #a78bfa, #67e8f9)" }} />
    </AbsoluteFill>
  );
};

const FeatureIntro = ({ scene }: { scene: FeatureIntroScene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 190 } });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={staticFile(scene.source)} style={{ position: "absolute", inset: -32, width: "calc(100% + 64px)", height: "calc(100% + 64px)", objectFit: "cover", filter: "blur(8px)", opacity: 0.36 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(11,16,32,.96) 0%, rgba(11,16,32,.82) 54%, rgba(11,16,32,.44) 100%)" }} />
      <div style={{ position: "absolute", left: 146, top: 126, color: LILAC, fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>今回のアップデート</div>
      <div style={{ position: "absolute", left: 146, top: 260, color: "white", fontSize: 68, fontWeight: 700, lineHeight: 1.26, opacity: reveal }}>
        <div>{scene.titleLines[0]}</div>
        <div style={{ marginTop: 18, color: "#dbeafe", fontSize: 48 }}>{scene.titleLines[1]}</div>
      </div>
      <div style={{ position: "absolute", left: 146, bottom: 120, width: 188, height: 5, borderRadius: 999, background: "linear-gradient(90deg, #a78bfa, #67e8f9)", opacity: reveal }} />
    </AbsoluteFill>
  );
};

const EnterPlay = ({ scene }: { scene: ScreenFocusScene }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const box = screenBox(width, height);
  const focusProgress = spring({ frame: Math.max(0, frame - scene.focus.startFrame), fps, config: { damping: 200 } });
  const scale = interpolate(focusProgress, [0, 1], [1, scene.focus.scale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pointerProgress = spring({ frame: Math.max(0, frame - scene.pointer.moveStartFrame), fps, config: { damping: 180 } });
  const pointerX = interpolate(pointerProgress, [0, 1], [scene.pointer.from.x, scene.pointer.to.x], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pointerY = interpolate(pointerProgress, [0, 1], [scene.pointer.from.y, scene.pointer.to.y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const clickProgress = spring({ frame: Math.max(0, frame - scene.pointer.clickAtFrame), fps, config: { damping: 130 } });
  const target = { x: box.left + scene.pointer.to.x * box.width, y: box.top + scene.pointer.to.y * box.height };

  return (
    <AbsoluteFill>
      <SceneLabel text="実画面 / Visual Editor" />
      <ScreenCard box={box} source={scene.source} scale={scale} origin={scene.focus} />
      <FocusRing x={target.x} y={target.y} progress={focusProgress} />
      <Pointer
        x={box.left + pointerX * box.width}
        y={box.top + pointerY * box.height}
        scale={scene.pointer.scale}
        clickProgress={clickProgress}
      />
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

const PlayControls = ({ scene }: { scene: PlayControlsScene }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const box = screenBox(width, height);
  const focusProgress = spring({ frame: Math.max(0, frame - scene.focus.startFrame), fps, config: { damping: 210 } });
  const scale = interpolate(focusProgress, [0, 1], [1, scene.focus.scale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneLabel text="実画面 / Play" />
      <ScreenCard box={box} source={scene.source} scale={scale} origin={scene.focus} />
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

const MovementResult = ({ scene }: { scene: MovementResultScene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const box = screenBox(width, height);
  const swap = interpolate(frame, [25, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneLabel text="実画面 / Play" />
      <ScreenCard box={box} source={scene.sourceBefore} />
      <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", borderRadius: 24, opacity: swap }}>
        <Img src={staticFile(scene.sourceAfter)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

const PublishedCta = ({ scene }: { scene: CtaScene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });
  const glow = interpolate(reveal, [0, 1], [0.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden", background: "linear-gradient(135deg, #101226 0%, #30225f 52%, #12233c 100%)" }}>
      <div style={{ position: "absolute", width: 920, height: 920, borderRadius: 999, background: "radial-gradient(circle, rgba(124,58,237,.45), transparent 66%)", opacity: glow }} />
      <div style={{ position: "relative", color: LILAC, fontSize: 28, fontWeight: 700, letterSpacing: 3, opacity: reveal }}>XRIFT STUDIO</div>
      <div style={{ position: "relative", marginTop: 28, color: "white", fontSize: 68, fontWeight: 700, opacity: reveal }}>{scene.caption}</div>
      <div style={{ position: "relative", marginTop: 32, color: "#dbeafe", fontSize: 29, opacity: reveal }}>{scene.featureLabel}</div>
    </AbsoluteFill>
  );
};

const screenBox = (width: number, height: number) => ({
  left: width * 0.084,
  top: height * 0.122,
  width: width * 0.832,
  height: height * 0.748,
});

const ScreenCard = ({
  box,
  source,
  scale = 1,
  origin = { x: 0.5, y: 0.5 },
}: {
  box: ReturnType<typeof screenBox>;
  source: string;
  scale?: number;
  origin?: Point;
}) => (
  <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", borderRadius: 24, border: "1px solid rgba(196,181,253,.46)", background: "#020617", boxShadow: "0 30px 80px rgba(0,0,0,.46)" }}>
    <div style={{ position: "absolute", inset: 0, transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`, transform: `scale(${scale})` }}>
      <Img src={staticFile(source)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  </div>
);

const SceneLabel = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", left: 162, top: 72, color: "#dbeafe", fontSize: 24, fontWeight: 700, letterSpacing: 1.2 }}>{text}</div>
);

const Caption = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", left: 162, bottom: 52, maxWidth: 1260, padding: "18px 28px", borderRadius: 16, background: "rgba(8,15,32,.91)", border: "1px solid rgba(196,181,253,.34)", color: "white", fontSize: 32, fontWeight: 700, boxShadow: "0 14px 36px rgba(0,0,0,.32)" }}>{text}</div>
);

const Pointer = ({ x, y, scale, clickProgress }: { x: number; y: number; scale: number; clickProgress: number }) => {
  const ripple = interpolate(clickProgress, [0, 1], [0.45, 1.62], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rippleOpacity = interpolate(clickProgress, [0, 0.72, 1], [0, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 30, transform: `translate(-8px, -8px) scale(${scale})`, transformOrigin: "top left", filter: "drop-shadow(0 6px 8px rgba(0,0,0,.5))" }}>
      <div style={{ position: "absolute", left: -28, top: -28, width: 76, height: 76, border: `3px solid ${CYAN}`, borderRadius: 999, opacity: rippleOpacity, transform: `scale(${ripple})` }} />
      <svg width="52" height="68" viewBox="0 0 52 68" fill="none">
        <path d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z" fill="#c4b5fd" stroke="white" strokeWidth="4" strokeLinejoin="round" />
        <path d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z" stroke="#111827" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const FocusRing = ({ x, y, progress }: { x: number; y: number; progress: number }) => (
  <div style={{ position: "absolute", left: x - 48, top: y - 48, width: 96, height: 96, zIndex: 20, border: `4px solid ${CYAN}`, borderRadius: 999, opacity: interpolate(progress, [0, 1], [0, 0.95], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `scale(${interpolate(progress, [0, 1], [0.68, 1.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`, boxShadow: "0 0 0 8px rgba(103,232,249,.16)" }} />
);
