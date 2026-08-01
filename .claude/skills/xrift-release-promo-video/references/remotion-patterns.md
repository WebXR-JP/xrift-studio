# Remotion 演出パターン

このファイルは、画面キャプチャを中心にした XRift Studio の新機能紹介で再利用する最小パターンをまとめる。実際の Remotion のバージョンと公式 API を実装前に確認する。

## シーンを時間軸へ配置する

```tsx
import {AbsoluteFill, Sequence} from 'remotion';

export const FeaturePromo = ({storyboard}: {storyboard: Storyboard}) => {
  return (
    <AbsoluteFill style={{backgroundColor: '#111827'}}>
      {storyboard.scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={storyboard.scenes.slice(0, index).reduce((sum, item) => sum + item.durationInFrames, 0)}
          durationInFrames={scene.durationInFrames}
        >
          <FeatureScene scene={scene} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
```

シーンの開始フレームをデータから計算し、各シーンの長さを重複させない。トランジションが必要な場合も、隣接シーンの責務とオーバーラップ量を storyboard で明示する。

## 画面とフォーカスを重ねる

```tsx
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const ScreenFocus = ({scene}: {scene: ScreenFocusScene}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const focus = scene.focus;
  const elapsed = frame - focus.startFrame;
  const progress = spring({
    frame: Math.max(0, elapsed),
    fps,
    config: {damping: 200},
  });
  const scale = interpolate(
    progress,
    [0, 1],
    [1, focus.scale],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  // 左上原点で拡大し、フォーカス点を画面中央へ寄せる。
  const translateX = interpolate(
    progress,
    [0, 1],
    [0, (0.5 - focus.x * focus.scale) * width],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const translateY = interpolate(
    progress,
    [0, 1],
    [0, (0.5 - focus.y * focus.scale) * height],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        }}
      >
        <Img
          src={scene.source.src}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </div>
      <FocusRing x={focus.x * width} y={focus.y * height} scale={scale} />
      <ExaggeratedPointer scene={scene} />
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};
```

実素材の `object-fit` と録画のアスペクト比が一致しない場合、先に letterbox / crop の扱いを決める。フォーカス座標は、素材を crop した後の座標系へ合わせる。

## 強調ポインターとクリック波紋

ポインターは HTML の文字カーソルではなく、SVG または CSS で輪郭が明瞭なレイヤーとして描く。座標は storyboard の正規化値から計算する。

```tsx
const ExaggeratedPointer = ({scene}: {scene: ScreenFocusScene}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const pointer = scene.pointer;
  const moveProgress = spring({
    frame: Math.max(0, frame - pointer.moveStartFrame),
    fps,
    config: {damping: 180},
  });
  const x = interpolate(moveProgress, [0, 1], [pointer.from.x, pointer.to.x], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const y = interpolate(moveProgress, [0, 1], [pointer.from.y, pointer.to.y], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const clickProgress = spring({
    frame: Math.max(0, frame - pointer.clickAtFrame),
    fps,
    config: {damping: 120},
  });

  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <CursorSvg
        x={x * width}
        y={y * height}
        scale={pointer.scale}
        clickProgress={clickProgress}
      />
    </div>
  );
};
```

クリック波紋は対象を覆わない大きさにし、クリック直後にテロップを出す。実カーソルが残っている素材にもう一つのポインターを足すと視線が分裂するので、収録時に隠せない場合は編集前に素材側をクロップするか、実カーソルと同じ位置へ合わせる。

## 実装上の注意

- レイアウトの根拠が画面サイズに依存する場合、`width` と `height` を固定値で乱用せず `useVideoConfig()` から得る。
- `spring()` の負のフレームは意図した初期値になるか確認し、必要なら `Math.max(0, frame - startFrame)` を渡す。
- 素材を切り替える直前に `<Img>` / `<Video>` をマウントし、黒画面やちらつきをプレビューで確認する。
- 重要な字幕・ロゴを拡大レイヤーの中へ入れず、画面上の固定レイヤーとして扱う。
- 1つの scene に複数の `spring()` を増やしすぎず、ポインター、フォーカス、字幕の開始フレームを storyboard で揃える。

公式の API 仕様は [Animation](https://www.remotion.dev/docs/animation)、[CLI](https://www.remotion.dev/docs/cli)、[Player](https://www.remotion.dev/docs/player) を優先する。
