export type ScriptTemplateCategory =
  | "basic"
  | "movement"
  | "appearance"
  | "particle"
  | "media"
  | "interaction";

export type ScriptTemplateDefinition = {
  id: string;
  name: string;
  description: string;
  category: ScriptTemplateCategory;
  suggestedName: string;
  /** Determines both Monaco language mode and the project source extension. */
  language: "ts" | "tsx";
  requiredAssetKinds: readonly (
    | "model"
    | "material"
    | "texture"
    | "audio"
    | "particle"
  )[];
  requiredComponents: readonly string[];
  entityReferenceCount: number;
  source: string;
};

const NAME_TOKEN = "__XRIFT_SCRIPT_NAME__";
export const SCRIPT_TEMPLATE_CATALOG_VERSION = 2 as const;

/**
 * Built-in Script examples shared by the Assets creation flow and MCP.
 *
 * Keep these sources portable: they are compiled in the Studio and emitted
 * unchanged into generated World / Item projects.
 */
export const SCRIPT_TEMPLATE_CATALOG: readonly ScriptTemplateDefinition[] = [
  {
    id: "blank",
    name: "空のScript",
    description: "最小のlifecycleから自由に実装します。",
    category: "basic",
    suggestedName: "New Script",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import { defineScript } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  start(ctx) {
    ctx.log("${NAME_TOKEN} started");
    return {
      stop() {
        ctx.log("${NAME_TOKEN} stopped");
      },
    };
  },
});
`,
  },
  {
    id: "rotate",
    name: "回転",
    description: "指定した軸と速度でEntityを回転します。",
    category: "movement",
    suggestedName: "Spinner",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    speed: prop.number({ label: "回転速度", default: 1, min: -20, max: 20 }),
    axis: prop.vec3({ label: "回転軸", default: [0, 1, 0] }),
  },
  start(ctx) {
    const axis = new Vector3();
    return {
      update(delta) {
        axis.fromArray(ctx.props.axis);
        if (axis.lengthSq() === 0) return;
        axis.normalize();
        ctx.object3d.rotateOnAxis(axis, ctx.props.speed * delta);
      },
    };
  },
});
`,
  },
  {
    id: "float",
    name: "上下に浮遊",
    description: "開始位置を中心に、滑らかに上下移動します。",
    category: "movement",
    suggestedName: "Floating Object",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    amplitude: prop.number({ label: "移動幅", default: 0.25, min: 0, max: 10 }),
    speed: prop.number({ label: "速度", default: 1, min: 0, max: 20 }),
  },
  start(ctx) {
    const baseY = ctx.object3d.position.y;
    return {
      update() {
        ctx.object3d.position.y =
          baseY + Math.sin(ctx.time.elapsed * ctx.props.speed) * ctx.props.amplitude;
      },
      dispose() {
        ctx.object3d.position.y = baseY;
      },
    };
  },
});
`,
  },
  {
    id: "keyboard-move",
    name: "キーボード移動",
    description: "WASDまたは矢印キーでEntityを移動します。",
    category: "movement",
    suggestedName: "Keyboard Mover",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    speed: prop.number({ label: "移動速度", default: 2, min: 0, max: 50 }),
  },
  start(ctx) {
    return {
      update(delta) {
        const step = ctx.props.speed * delta;
        if (ctx.input.isKeyDown("KeyW") || ctx.input.isKeyDown("ArrowUp")) {
          ctx.object3d.position.z -= step;
        }
        if (ctx.input.isKeyDown("KeyS") || ctx.input.isKeyDown("ArrowDown")) {
          ctx.object3d.position.z += step;
        }
        if (ctx.input.isKeyDown("KeyA") || ctx.input.isKeyDown("ArrowLeft")) {
          ctx.object3d.position.x -= step;
        }
        if (ctx.input.isKeyDown("KeyD") || ctx.input.isKeyDown("ArrowRight")) {
          ctx.object3d.position.x += step;
        }
      },
    };
  },
});
`,
  },
  {
    id: "follow-entity",
    name: "Entityを追従",
    description: "明示参照したEntityの位置へ滑らかに追従します。",
    category: "movement",
    suggestedName: "Entity Follower",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 1,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    target: prop.entity({ label: "追従先" }),
    speed: prop.number({ label: "追従速度", default: 4, min: 0, max: 30 }),
    offset: prop.vec3({ label: "位置オフセット", default: [0, 1, 0] }),
  },
  start(ctx) {
    return {
      update(delta) {
        const target = ctx.find(ctx.props.target);
        if (!target) return;
        const amount = Math.min(1, ctx.props.speed * delta);
        ctx.object3d.position.x +=
          (target.position.x + ctx.props.offset[0] - ctx.object3d.position.x) * amount;
        ctx.object3d.position.y +=
          (target.position.y + ctx.props.offset[1] - ctx.object3d.position.y) * amount;
        ctx.object3d.position.z +=
          (target.position.z + ctx.props.offset[2] - ctx.object3d.position.z) * amount;
      },
    };
  },
});
`,
  },
  {
    id: "material-pulse",
    name: "Materialパルス",
    description: "色、発光、粗さをPlay中にアニメーションします。",
    category: "appearance",
    suggestedName: "Material Pulse",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: ["Mesh Renderer"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    color: prop.color({ label: "基本色", default: "#38bdf8" }),
    emissive: prop.color({ label: "発光色", default: "#7c3aed" }),
    speed: prop.number({ label: "パルス速度", default: 2, min: 0, max: 20 }),
    minRoughness: prop.number({ label: "粗さ 最小", default: 0.2, min: 0, max: 1 }),
    maxRoughness: prop.number({ label: "粗さ 最大", default: 0.8, min: 0, max: 1 }),
  },
  start(ctx) {
    return {
      update() {
        const pulse = (Math.sin(ctx.time.elapsed * ctx.props.speed) + 1) * 0.5;
        ctx.materials.setColor(ctx.props.color);
        ctx.materials.setEmissive(ctx.props.emissive, pulse * 2);
        ctx.materials.setRoughness(
          ctx.props.minRoughness +
            (ctx.props.maxRoughness - ctx.props.minRoughness) * pulse,
        );
      },
      dispose() {
        ctx.materials.reset();
      },
    };
  },
});
`,
  },
  {
    id: "texture-scroll",
    name: "Textureスクロール",
    description: "明示参照したTextureを読み込み、UVをスクロールします。",
    category: "appearance",
    suggestedName: "Texture Scroller",
    language: "ts",
    requiredAssetKinds: ["texture"],
    requiredComponents: ["Mesh Renderer"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    texture: prop.asset({ label: "Texture", kind: "texture" }),
    speed: prop.vec2({ label: "UV速度", default: [0.15, 0] }),
    tiling: prop.vec2({ label: "タイリング", default: [1, 1] }),
  },
  start(ctx) {
    let loaded = null;
    void ctx.lifecycle.task(async (signal) => {
      const texture = await ctx.assets.loadTexture(ctx.props.texture, {
        colorSpace: "srgb",
        wrapS: "repeat",
        wrapT: "repeat",
      });
      if (signal.aborted || !texture) return;
      loaded = texture;
      texture.repeat.set(ctx.props.tiling[0], ctx.props.tiling[1]);
      ctx.materials.setTexture("baseColor", texture);
    });
    return {
      update(delta) {
        if (!loaded) return;
        loaded.offset.x += ctx.props.speed[0] * delta;
        loaded.offset.y += ctx.props.speed[1] * delta;
        loaded.repeat.set(ctx.props.tiling[0], ctx.props.tiling[1]);
        loaded.needsUpdate = true;
      },
      dispose() {
        ctx.materials.reset();
      },
    };
  },
});
`,
  },
  {
    id: "particle-control",
    name: "Particleコントローラー",
    description: "Particle Emitterの再生、Emission、速度、サイズ、色を制御します。",
    category: "particle",
    suggestedName: "Particle Controller",
    language: "ts",
    requiredAssetKinds: ["particle"],
    requiredComponents: ["Particle Emitter"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    playing: prop.boolean({ label: "再生", default: true }),
    emissionRate: prop.number({ label: "毎秒の粒子数", default: 30, min: 0, max: 10000 }),
    speedMultiplier: prop.number({ label: "速度倍率", default: 1, min: 0, max: 20 }),
    sizeMultiplier: prop.number({ label: "サイズ倍率", default: 1, min: 0, max: 20 }),
    color: prop.color({ label: "色", default: "#ffffff" }),
    opacity: prop.number({ label: "不透明度", default: 1, min: 0, max: 1 }),
  },
  start(ctx) {
    return {
      update() {
        if (ctx.props.playing) ctx.particles.play();
        else ctx.particles.pause();
        ctx.particles.setEmissionRate(ctx.props.emissionRate);
        ctx.particles.setSpeedMultiplier(ctx.props.speedMultiplier);
        ctx.particles.setSizeMultiplier(ctx.props.sizeMultiplier);
        ctx.particles.setColor(ctx.props.color);
        ctx.particles.setOpacity(ctx.props.opacity);
      },
      dispose() {
        ctx.particles.reset();
      },
    };
  },
});
`,
  },
  {
    id: "model-display",
    name: "外部Modelを表示",
    description:
      "明示参照したGLBまたは自己完結したglTFをRenderへ読み込み、速度を変えながら回転します。",
    category: "media",
    suggestedName: "Model Display",
    language: "tsx",
    requiredAssetKinds: ["model"],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import {
  defineScript,
  prop,
  type ScriptRenderProps,
} from "xrift:script";
import { Clone, useGLTF } from "@react-three/drei";

type ModelDisplayProps = {
  model: { kind: "asset"; assetKind: "model" };
  scale: { kind: "number" };
  rotationSpeed: { kind: "number" };
};

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    model: prop.asset({ label: "Model", kind: "model" }),
    scale: prop.number({ label: "表示倍率", default: 1, min: 0.01, max: 100 }),
    rotationSpeed: prop.number({
      label: "回転速度",
      default: 0.5,
      min: -20,
      max: 20,
    }),
  },
  start(ctx) {
    return {
      update(delta) {
        ctx.object3d.rotation.y += ctx.props.rotationSpeed * delta;
      },
    };
  },
});

function DeclaredModel({ url, scale }: { url: string; scale: number }) {
  const model = useGLTF(url);
  return <Clone object={model.scene} scale={scale} />;
}

export function Render({ ctx }: ScriptRenderProps<ModelDisplayProps>) {
  const url = ctx.assets.url(ctx.props.model);
  return url ? <DeclaredModel url={url} scale={ctx.props.scale} /> : null;
}
`,
  },
  {
    id: "audio-hotkey",
    name: "キーでAudio再生",
    description:
      "明示参照したAudioを読み込み、指定キーで再生と停止を切り替えます。",
    category: "media",
    suggestedName: "Audio Hotkey",
    language: "ts",
    requiredAssetKinds: ["audio"],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import {
  defineScript,
  prop,
  type ScriptAudio,
} from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    audio: prop.asset({ label: "Audio", kind: "audio" }),
    keyCode: prop.string({ label: "再生キー", default: "Space" }),
    volume: prop.number({ label: "音量", default: 1, min: 0, max: 1 }),
    playbackRate: prop.number({
      label: "再生速度",
      default: 1,
      min: 0.1,
      max: 4,
    }),
    loop: prop.boolean({ label: "ループ", default: false }),
  },
  start(ctx) {
    let audio: ScriptAudio | null = null;
    let keyWasDown = false;

    void ctx.lifecycle.task(async (signal) => {
      const loaded = await ctx.assets.loadAudio(ctx.props.audio, {
        volume: ctx.props.volume,
        playbackRate: ctx.props.playbackRate,
        loop: ctx.props.loop,
      });
      if (signal.aborted) {
        loaded?.stop();
        return;
      }
      audio = loaded;
      if (!audio) ctx.log("Audio Assetを読み込めませんでした");
    });

    return {
      update() {
        audio?.setVolume(ctx.props.volume);
        audio?.setPlaybackRate(ctx.props.playbackRate);
        audio?.setLoop(ctx.props.loop);
        const keyIsDown = ctx.input.isKeyDown(ctx.props.keyCode);
        if (keyIsDown && !keyWasDown && audio) {
          if (audio.playing) {
            audio.stop();
          } else {
            void ctx.lifecycle.task(async (signal) => {
              try {
                await audio?.play();
              } catch (error) {
                if (!signal.aborted) {
                  ctx.log("Audioを再生できませんでした", String(error));
                }
              }
            });
          }
        }
        keyWasDown = keyIsDown;
      },
      dispose() {
        audio?.stop();
      },
    };
  },
});
`,
  },
  {
    id: "event-visibility",
    name: "イベントで表示切替",
    description: "Scriptイベントを受け取り、Entityの表示状態を切り替えます。",
    category: "interaction",
    suggestedName: "Visibility Event",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    eventName: prop.string({ label: "イベント名", default: "toggle-visibility" }),
    visibleAtStart: prop.boolean({ label: "開始時に表示", default: true }),
  },
  start(ctx) {
    ctx.object3d.visible = ctx.props.visibleAtStart;
    const unsubscribe = ctx.on(ctx.props.eventName, () => {
      ctx.object3d.visible = !ctx.object3d.visible;
    });
    return {
      dispose() {
        unsubscribe();
      },
    };
  },
});
`,
  },
] as const;

export const DEFAULT_SCRIPT_TEMPLATE_ID = "rotate";

export function getScriptTemplate(
  templateId: string,
): ScriptTemplateDefinition | undefined {
  return SCRIPT_TEMPLATE_CATALOG.find((template) => template.id === templateId);
}

export function createScriptTemplateSource(
  templateId: string,
  scriptName: string,
): string | null {
  const template = getScriptTemplate(templateId);
  if (!template) return null;
  const safeName = scriptName.replace(/["\\\n\r]/g, "").trim() || template.suggestedName;
  return template.source.split(NAME_TOKEN).join(safeName);
}

export function listScriptTemplateSummaries(): Array<
  Omit<ScriptTemplateDefinition, "source">
> {
  return SCRIPT_TEMPLATE_CATALOG.map(({ source: _source, ...template }) => ({
    ...template,
  }));
}
