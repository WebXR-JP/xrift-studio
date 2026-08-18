import { Composition, registerRoot } from "remotion";
import { Promo, resolveDurationInFrames, type Storyboard } from "../../_kit/src";
import storyboardJson from "../storyboard.json";

const storyboard = storyboardJson as unknown as Storyboard;
const durationInFrames = resolveDurationInFrames(storyboard);
const { fps } = storyboard.format;

registerRoot(() => (
  <>
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={durationInFrames}
      fps={fps}
      width={storyboard.format.width}
      height={storyboard.format.height}
      defaultProps={{ storyboard }}
    />
    {/* 同じ storyboard から縦型も書き出す。字幕と対象が画面内に収まるか必ず確認する。 */}
    <Composition
      id="PromoVertical"
      component={Promo}
      durationInFrames={durationInFrames}
      fps={fps}
      width={1080}
      height={1920}
      defaultProps={{ storyboard }}
    />
  </>
));
