import { Composition, registerRoot } from "remotion";
import storyboard from "../storyboard.json";
import { FeaturePromo, type Storyboard } from "./FeaturePromo";

const typedStoryboard = storyboard as unknown as Storyboard;

registerRoot(() => (
  <Composition
    id="PlayCameraControls"
    component={FeaturePromo}
    durationInFrames={typedStoryboard.format.durationInFrames}
    fps={typedStoryboard.format.fps}
    width={typedStoryboard.format.width}
    height={typedStoryboard.format.height}
    defaultProps={{ storyboard: typedStoryboard }}
  />
));
