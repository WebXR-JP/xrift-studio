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
export const SCRIPT_TEMPLATE_CATALOG_VERSION = 5 as const;

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
    id: "light-flicker",
    name: "Lightの点滅",
    description:
      "同じEntityのLightを、Inspectorで変えられる強度・色・速度で自然に点滅させます。",
    category: "appearance",
    suggestedName: "Light Flicker",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: ["Light"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    enabled: prop.boolean({ label: "点灯", default: true }),
    color: prop.color({ label: "色", default: "#ffd08a" }),
    baseIntensity: prop.number({
      label: "基本の明るさ",
      default: 2,
      min: 0,
      max: 100,
    }),
    flickerAmount: prop.number({
      label: "揺らぎ",
      default: 0.35,
      min: 0,
      max: 1,
    }),
    speed: prop.number({
      label: "点滅速度",
      default: 8,
      min: 0,
      max: 50,
    }),
  },
  start(ctx) {
    return {
      update() {
        const time = ctx.time.elapsed * ctx.props.speed;
        const flicker =
          Math.sin(time * 1.0) * 0.55 +
          Math.sin(time * 2.17 + 1.3) * 0.3 +
          Math.sin(time * 5.73 + 0.4) * 0.15;
        const intensity =
          ctx.props.baseIntensity *
          Math.max(0, 1 + flicker * ctx.props.flickerAmount);
        ctx.lights.setEnabled(ctx.props.enabled);
        ctx.lights.setColor(ctx.props.color);
        ctx.lights.setIntensity(intensity);
      },
      dispose() {
        ctx.lights.reset();
      },
    };
  },
});
`,
  },
  {
    id: "texture-scroll",
    name: "Textureスクロール",
    description:
      "Texture Assetの設定を継承して読み込み、共有Textureを変えずにUVをスクロールします。",
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
    let ready = false;
    let offsetX = 0;
    let offsetY = 0;
    void ctx.lifecycle.task(async (signal) => {
      const texture = await ctx.assets.loadTexture(ctx.props.texture, {
        wrapS: "repeat",
        wrapT: "repeat",
      });
      if (signal.aborted || !texture) return;
      ctx.materials.setTexture("baseColor", texture);
      ctx.materials.setTextureTransform("baseColor", {
        repeat: ctx.props.tiling,
        offset: [offsetX, offsetY],
      });
      ready = true;
    });
    return {
      update(delta) {
        if (!ready) return;
        offsetX += ctx.props.speed[0] * delta;
        offsetY += ctx.props.speed[1] * delta;
        ctx.materials.setTextureTransform("baseColor", {
          repeat: ctx.props.tiling,
          offset: [offsetX, offsetY],
        });
      },
      dispose() {
        ctx.materials.resetTextureTransform("baseColor");
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
    id: "audio-source-control",
    name: "Audio Sourceコントローラー",
    description:
      "同じEntityのAudio Sourceを選び、再生、音量、ループ、再生位置をPlay中に制御します。",
    category: "media",
    suggestedName: "Audio Source Controller",
    language: "ts",
    requiredAssetKinds: ["audio"],
    requiredComponents: ["Audio Source"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    audio: prop.asset({ label: "Audio", kind: "audio" }),
    playing: prop.boolean({ label: "再生", default: false }),
    volume: prop.number({ label: "音量", default: 1, min: 0, max: 1 }),
    loop: prop.boolean({ label: "ループ", default: false }),
    seekSeconds: prop.number({
      label: "再生位置（秒）",
      default: 0,
      min: 0,
      max: 86400,
    }),
  },
  start(ctx) {
    const sources = ctx.audioSources.select({
      audioAssetId: ctx.props.audio,
    });
    let playing = !ctx.props.playing;
    let seekSeconds = ctx.props.seekSeconds;

    return {
      update() {
        sources.setVolume(ctx.props.volume);
        sources.setLoop(ctx.props.loop);

        if (ctx.props.seekSeconds !== seekSeconds) {
          seekSeconds = ctx.props.seekSeconds;
          sources.seek(seekSeconds);
        }
        if (ctx.props.playing === playing) return;
        playing = ctx.props.playing;
        if (!playing) {
          sources.pause();
          return;
        }
        void ctx.lifecycle.task(async (signal) => {
          const started = await sources.play();
          if (signal.aborted || started > 0) return;
          const selected = ctx.audioSources.list().filter(
            (source) => source.audioAssetId === ctx.props.audio,
          );
          if (selected.some((source) => source.status === "autoplay-blocked")) {
            ctx.log(
              "Audio Sourceの自動再生がブロックされました。画面を操作してから再試行してください",
            );
          } else {
            ctx.log("再生できるAudio Sourceがありません");
          }
        });
      },
      dispose() {
        sources.reset();
      },
    };
  },
});
`,
  },
  {
    id: "proximity-event",
    name: "範囲に入ったらイベント",
    description:
      "明示参照したEntityがこのEntityの範囲へ入った／出た状態をchannel付きイベントで送ります。",
    category: "interaction",
    suggestedName: "Proximity Event",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: [],
    entityReferenceCount: 1,
    source: `import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

const PROXIMITY_EVENT = "xrift:proximity-state";
const SYNC_INTERVAL_SECONDS = 0.5;

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    target: prop.entity({ label: "検知するEntity" }),
    channel: prop.string({ label: "接続channel", default: "lamp-zone-1" }),
    radius: prop.number({ label: "入る距離", default: 2, min: 0, max: 1000 }),
    exitMargin: prop.number({
      label: "出る時の余白",
      default: 0.25,
      min: 0,
      max: 100,
    }),
  },
  start(ctx) {
    const origin = new Vector3();
    const targetPosition = new Vector3();
    let inside = false;
    let initialized = false;
    let routingSync = false;
    let syncElapsed = 0;
    let publishedChannel = ctx.props.channel;
    let trackedTargetId = ctx.props.target;

    const publish = (
      next: boolean,
      kind: "enter" | "exit" | "sync",
    ) => {
      ctx.emit(PROXIMITY_EVENT, {
        channel: publishedChannel,
        inside: next,
        kind,
        sourceEntityId: ctx.entity.id,
        targetEntityId: trackedTargetId,
      });
    };

    return {
      update(delta) {
        if (
          publishedChannel !== ctx.props.channel ||
          trackedTargetId !== ctx.props.target
        ) {
          if (initialized && inside) publish(false, "exit");
          publishedChannel = ctx.props.channel;
          trackedTargetId = ctx.props.target;
          inside = false;
          initialized = false;
          routingSync = true;
          syncElapsed = 0;
        }
        const target = ctx.find(trackedTargetId);
        if (!target) {
          if (!initialized) {
            initialized = true;
            inside = false;
            publish(false, "sync");
          } else if (inside) {
            inside = false;
            publish(false, "exit");
          }
          return;
        }
        ctx.object3d.getWorldPosition(origin);
        target.getWorldPosition(targetPosition);
        const threshold =
          Math.max(0, ctx.props.radius) +
          (inside ? Math.max(0, ctx.props.exitMargin) : 0);
        const next =
          origin.distanceToSquared(targetPosition) <= threshold * threshold;
        if (!initialized) {
          initialized = true;
          inside = next;
          publish(
            next,
            routingSync ? "sync" : next ? "enter" : "sync",
          );
          routingSync = false;
          syncElapsed = 0;
        } else if (next !== inside) {
          inside = next;
          publish(next, next ? "enter" : "exit");
          syncElapsed = 0;
        } else if (next) {
          syncElapsed += Number.isFinite(delta) ? Math.max(0, delta) : 0;
          if (syncElapsed >= SYNC_INTERVAL_SECONDS) {
            syncElapsed = 0;
            publish(true, "sync");
          }
        }
      },
      dispose() {
        if (initialized && inside) publish(false, "exit");
      },
    };
  },
});
`,
  },
  {
    id: "event-light",
    name: "イベントでLightを切替",
    description:
      "同じchannelの近接イベントを受け、同じEntityのLightの色と強度を滑らかに変えます。",
    category: "interaction",
    suggestedName: "Event Light",
    language: "ts",
    requiredAssetKinds: [],
    requiredComponents: ["Light"],
    entityReferenceCount: 0,
    source: `import { defineScript, prop } from "xrift:script";
import { Color } from "three";

const PROXIMITY_EVENT = "xrift:proximity-state";

function readProximityEvent(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    channel?: unknown;
    inside?: unknown;
    kind?: unknown;
    sourceEntityId?: unknown;
  };
  return typeof candidate.channel === "string" &&
    typeof candidate.inside === "boolean" &&
    (candidate.kind === "enter" ||
      candidate.kind === "exit" ||
      candidate.kind === "sync") &&
    typeof candidate.sourceEntityId === "string"
    ? {
        channel: candidate.channel,
        inside: candidate.inside,
        kind: candidate.kind,
        sourceEntityId: candidate.sourceEntityId,
      }
    : null;
}

export default defineScript({
  name: "${NAME_TOKEN}",
  props: {
    channel: prop.string({ label: "接続channel", default: "lamp-zone-1" }),
    idleColor: prop.color({ label: "待機中の色", default: "#334155" }),
    activeColor: prop.color({ label: "反応中の色", default: "#fbbf24" }),
    idleIntensity: prop.number({
      label: "待機中の明るさ",
      default: 0.15,
      min: 0,
      max: 100,
    }),
    activeIntensity: prop.number({
      label: "反応中の明るさ",
      default: 4,
      min: 0,
      max: 100,
    }),
    fadeSpeed: prop.number({
      label: "切替速度",
      default: 6,
      min: 0,
      max: 50,
    }),
  },
  start(ctx) {
    const sourcesByChannel = new Map<string, Set<string>>();
    let currentIntensity = ctx.props.idleIntensity;
    const currentColor = new Color(ctx.props.idleColor);
    const targetColor = new Color();
    const unsubscribe = ctx.on(PROXIMITY_EVENT, (payload) => {
      const event = readProximityEvent(payload);
      if (!event) return;
      let activeSources = sourcesByChannel.get(event.channel);
      if (event.inside) {
        if (!activeSources) {
          activeSources = new Set();
          sourcesByChannel.set(event.channel, activeSources);
        }
        activeSources.add(event.sourceEntityId);
      } else if (activeSources) {
        activeSources.delete(event.sourceEntityId);
        if (activeSources.size === 0) {
          sourcesByChannel.delete(event.channel);
        }
      }
    });

    return {
      update(delta) {
        const active =
          (sourcesByChannel.get(ctx.props.channel)?.size ?? 0) > 0;
        const targetIntensity = active
          ? ctx.props.activeIntensity
          : ctx.props.idleIntensity;
        const amount =
          ctx.props.fadeSpeed <= 0
            ? 1
            : 1 - Math.exp(-ctx.props.fadeSpeed * delta);
        currentIntensity +=
          (targetIntensity - currentIntensity) * amount;
        targetColor.set(active ? ctx.props.activeColor : ctx.props.idleColor);
        currentColor.lerp(targetColor, amount);
        ctx.lights.setEnabled(
          targetIntensity > 0 || currentIntensity > 0.001,
        );
        ctx.lights.setColor(currentColor.getHex());
        ctx.lights.setIntensity(currentIntensity);
      },
      dispose() {
        unsubscribe();
        ctx.lights.reset();
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
    let subscribedEventName = "";
    let unsubscribe = () => {};
    const subscribe = () => {
      if (subscribedEventName === ctx.props.eventName) return;
      unsubscribe();
      subscribedEventName = ctx.props.eventName;
      unsubscribe = ctx.on(subscribedEventName, () => {
        ctx.object3d.visible = !ctx.object3d.visible;
      });
    };
    subscribe();
    return {
      update() {
        subscribe();
      },
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
