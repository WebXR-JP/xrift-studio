import type { ClassicR3fMaterialShader, ClassicR3fShaderUniform } from "./custom-shader-contract";
import { WATER_FRAGMENT_SHADER, WATER_VERTEX_SHADER } from "./water-shader-core";

/** Installed presets remain ordinary, self-contained Material Assets. */
export type WaterShaderCatalogCategory =
  | "lake" | "ocean" | "coast" | "tropical" | "weather" | "night" | "stylized" | "fantasy";
export type WaterShaderParameterGroup = "波・さざ波" | "反射・透明感" | "泡" | "演出" | "色";
export type WaterShaderParameter = {
  uniform: string;
  label: string;
  hint: string;
  group?: WaterShaderParameterGroup;
} & (
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "color" }
);
export type WaterShaderCatalogEntry = {
  id: string;
  label: string;
  category: WaterShaderCatalogCategory;
  description: string;
  features: readonly string[];
  /** Relative shader work, not a device-specific FPS guarantee. */
  cost: "low" | "medium" | "high";
  notes: string;
  parameters: readonly WaterShaderParameter[];
  shader: ClassicR3fMaterialShader;
};

export const WATER_SHADER_CATALOG_REVISION = "xrift-studio-water-shaders@2";
export const WATER_SHADER_CATALOG_SOURCE_URL = "https://github.com/WebXR-JP/xrift-studio";
export const WATER_SHADER_CATALOG_AUTHOR = "XRift Studio contributors";
export const WATER_SHADER_CATEGORIES = [
  "ocean", "coast", "tropical", "weather", "night", "stylized", "fantasy", "lake",
] as const satisfies readonly WaterShaderCatalogCategory[];
export const WATER_SHADER_PARAMETER_GROUPS = [
  "波・さざ波", "反射・透明感", "泡", "演出", "色",
] as const satisfies readonly WaterShaderParameterGroup[];

export function waterShaderCategoryLabel(category: WaterShaderCatalogCategory): string {
  return {
    lake: "湖・内海", ocean: "外洋・うねり", coast: "海岸・磯", tropical: "南国・浅瀬",
    weather: "荒天・雨", night: "夕景・夜の海", stylized: "アニメ・絵画", fantasy: "幻想・SF",
  }[category];
}
export function waterShaderCostLabel(cost: WaterShaderCatalogEntry["cost"]): string {
  return { low: "負荷目安：軽め", medium: "負荷目安：標準", high: "負荷目安：高め" }[cost];
}

function number(uniform: string, label: string, hint: string, group: WaterShaderParameterGroup,
  min: number, max: number, step: number): WaterShaderParameter {
  return { uniform, label, hint, group, kind: "number", min, max, step };
}
function color(uniform: string, label: string, hint: string): WaterShaderParameter {
  return { uniform, label, hint, group: "色", kind: "color" };
}
const COMMON_PARAMETERS: readonly WaterShaderParameter[] = [
  number("uWaveSpeed", "波の速さ", "Scene設定のWindに対する倍率です。0で泡や演出も含めて停止します。", "波・さざ波", 0, 2, 0.01),
  number("uWaveLayers", "うねりの重ね数", "1〜4層のGerstner波です。増やすと交差する波が増えます。", "波・さざ波", 1, 4, 1),
  number("uWaveHeight", "うねりの強さ", "波の傾きです。メートル単位の高さではありません。重ねた波が折り返さない範囲で計算します。", "波・さざ波", 0, 1, 0.01),
  number("uWaveScale", "うねりの細かさ", "1で主波長18m。大きくすると波が小さくなります。", "波・さざ波", 0.05, 6, 0.05),
  number("uDetailScale", "さざ波の密度", "ワールド座標で繰り返すため、メッシュを拡大しても模様が引き伸ばされません。", "波・さざ波", 0.01, 3, 0.01),
  number("uDetailStrength", "さざ波の強さ", "うねりの上に乗る細かい凹凸です。0でうねりだけにします。", "波・さざ波", 0, 3, 0.05),
  number("uDetailQuality", "細部の品質", "0＝軽量、1＝標準、2＝高精細。0では雲の反射模様と雨の波紋を省きます。", "波・さざ波", 0, 2, 1),
  number("uWaveDisplacement", "頂点変位（分割メッシュ用）", "通常のPlaneでは0のまま使います。十分に分割した水平メッシュで上げると、輪郭も上下します。プレビューは分割済みです。", "波・さざ波", 0, 1, 0.05),
  number("uRoughness", "反射のぼけ", "小さいほど光が鋭く、大きいほど広い反射になります。遠景のちらつきは自動で抑えます。", "反射・透明感", 0.065, 0.8, 0.005),
  number("uReflectivity", "空の反射", "指定した空色と雲模様を反射方向に応じて描きます。Scene内の物体は映りません。", "反射・透明感", 0, 1, 0.02),
  number("uFresnelPower", "浅い角度の反射", "水面を水平に近い角度から見ると反射が強くなります。", "反射・透明感", 0.5, 8, 0.1),
  number("uGlintStrength", "光のきらめき", "Sceneの主Directional Lightから受ける反射の強さです。太陽や月の向きはScene側で設定します。", "反射・透明感", 0, 4, 0.05),
  number("uCloudReflection", "映り込む雲模様", "水専用の雲模様です。Skyboxの雲とは連動しません。", "反射・透明感", 0, 1, 0.02),
  number("uScatterStrength", "波頭の透け色", "逆光側の波頭に浅い水色を足す疑似散乱です。屈折ではありません。", "反射・透明感", 0, 3, 0.05),
  number("uHazeDistance", "遠景がかすむ距離", "大きいほど遠くまで水面の色と模様を保ちます。SceneのFogも別途反映します。", "反射・透明感", 30, 2000, 10),
  number("uOpacity", "不透明度", "浅い角度の反射と泡は不透明に近づきます。0で完全に非表示です。背景を歪ませる屈折は行いません。", "反射・透明感", 0, 1, 0.02),
  number("uFoamAmount", "白波の量", "波頭の圧縮に応じて、ちぎれた泡を出します。0で岸の白波も消えます。", "泡", 0, 1, 0.02),
  number("uFoamSharpness", "泡の広がり", "小さいほど泡の発生域の輪郭がはっきりします。", "泡", 0.01, 1, 0.01),
  number("uFoamScale", "泡の模様の密度", "泡の塊と、その中に空く小さな穴の細かさです。", "泡", 0.05, 4, 0.05),
  color("uDeepColor", "水のベース色", "深い水を表す色です。実際の水深を取得しているわけではありません。"),
  color("uShallowColor", "浅瀬・波頭の色", "浅瀬や光を受けた波頭に使う色です。"),
  color("uFoamColor", "泡の色", "泡にはSceneの主光と環境光も反映します。"),
  color("uZenithColor", "映り込む天頂の色", "SceneのSkyboxの色に合わせてください。"),
  color("uHorizonColor", "映り込む水平線の色", "水平線付近の反射と遠景のかすみに使います。"),
];

type Feature = "SHORE" | "CAUSTICS" | "STREAKS" | "GLOW" | "TOON" | "PIGMENT" | "INK" | "IRIDESCENT" | "GRID" | "RAIN" | "ICE";
const FEATURE_PARAMETERS: Record<Feature, readonly WaterShaderParameter[]> = {
  SHORE: [
    number("uShoreAngle", "岸から沖へ向かう方角", "ワールドXZ上の角度です。0度は+X、90度は+Z。岸は指定した直線として扱います。", "演出", -180, 180, 1),
    number("uShoreOffset", "岸の位置", "方角に沿ったワールド原点からの距離です。地形との接触位置は自動検出しません。", "演出", -2000, 2000, 0.1),
    number("uShoreWidth", "寄せ波の幅", "指定した岸線に対して往復する波打ち際の幅です。", "演出", 0.2, 30, 0.1),
  ],
  CAUSTICS: [
    number("uCausticStrength", "水面の集光模様", "水面に描く疑似コースティクスです。水底のMeshを照らすものではありません。", "演出", 0, 4, 0.05),
    number("uCausticScale", "集光模様の密度", "細い光の網目の細かさです。", "演出", 0.05, 3, 0.05),
  ],
  STREAKS: [number("uStreakStrength", "風に流れる泡筋", "SceneのWindと同じ向きに細長い泡筋を出します。", "演出", 0, 3, 0.05)],
  GLOW: [
    number("uGlowStrength", "夜光の強さ", "泡・波頭・微粒子の発光です。Bloomがなくても光色は見えます。", "演出", 0, 6, 0.05),
    color("uGlowColor", "夜光の色", "Sceneの照明に依存しない発光色です。"),
  ],
  TOON: [number("uBandCount", "色の段数", "波の明暗を2〜8段に分けます。", "演出", 2, 8, 1)],
  PIGMENT: [number("uPigmentStrength", "絵の具のむら", "水面に追従する色むらと粒子感です。画面に固定したフィルターではありません。", "演出", 0, 2, 0.05)],
  INK: [],
  IRIDESCENT: [number("uIridescence", "偏光の色変化", "見る角度によって虹色を混ぜます。薄膜干渉の物理シミュレーションではありません。", "演出", 0, 1, 0.02)],
  GRID: [number("uGridScale", "発光グリッドの密度", "波の形で歪む光の格子です。遠くでは模様を薄くしてちらつきを抑えます。", "演出", 0.05, 2, 0.05)],
  RAIN: [number("uRainStrength", "雨の波紋", "時間差で広がる円形の波紋です。品質0では省略します。雨粒自体は生成しません。", "演出", 0, 3, 0.05)],
  ICE: [number("uIceCoverage", "氷の覆う割合", "流氷風の平面的な模様です。氷の立体Meshや衝突判定は作りません。", "演出", 0, 1, 0.02)],
};

const BASE_VALUES: Record<string, number | string> = {
  uTime: 0, uWindSpeed: 0, uWindTurbulence: 0,
  uSunColor: "#fff4e3", uSunIntensity: 1.2, uAmbientColor: "#ffffff", uAmbientIntensity: 0.65,
  uDeepColor: "#07334b", uShallowColor: "#278f9d", uZenithColor: "#437fab", uHorizonColor: "#c2dae3", uFoamColor: "#eaf4f2",
  uWaveHeight: 0.55, uWaveScale: 0.95, uWaveLayers: 3, uWaveSpeed: 0.28, uWaveDisplacement: 0,
  uDetailScale: 0.8, uDetailStrength: 1.1, uDetailQuality: 1,
  uReflectivity: 0.92, uFresnelPower: 5, uRoughness: 0.19, uGlintStrength: 1.25,
  uCloudReflection: 0.25, uScatterStrength: 1.15, uHazeDistance: 360, uOpacity: 0.9,
  uFoamAmount: 0.46, uFoamSharpness: 0.16, uFoamScale: 1.2,
};
const FEATURE_DEFAULTS: Record<Feature, Record<string, number | string>> = {
  SHORE: { uShoreAngle: -90, uShoreOffset: -1.5, uShoreWidth: 2.2 },
  CAUSTICS: { uCausticStrength: 1.4, uCausticScale: 0.65 },
  STREAKS: { uStreakStrength: 1.25 },
  GLOW: { uGlowColor: "#32f4dc", uGlowStrength: 2.5 },
  TOON: { uBandCount: 4 }, PIGMENT: { uPigmentStrength: 0.95 }, INK: {},
  IRIDESCENT: { uIridescence: 0.75 }, GRID: { uGridScale: 0.35 },
  RAIN: { uRainStrength: 1.2 }, ICE: { uIceCoverage: 0.65 },
};
const COMMON_NOTES = "通常のPlaneでも使用できます。輪郭を上下させる場合は、分割した水平メッシュに割り当てて「頂点変位」を上げてください。反射は空色の近似で、物体の映り込みや画面屈折はありません。";

type Preset = Pick<WaterShaderCatalogEntry, "id" | "label" | "category" | "description" | "features" | "cost"> & {
  effects?: readonly Feature[];
  values?: Record<string, number | string>;
  notes?: string;
  sunDirection?: [number, number, number];
};
function preset(input: Preset): WaterShaderCatalogEntry {
  const effects = input.effects ?? [];
  const values = { ...BASE_VALUES };
  for (const feature of effects) Object.assign(values, FEATURE_DEFAULTS[feature]);
  Object.assign(values, input.values);
  const uniforms: Record<string, ClassicR3fShaderUniform> = {
    uWindDirection: { kind: "vector", value: [1, 0] },
    uSunDirection: { kind: "vector", value: input.sunDirection ?? [-0.24, 0.42, -0.87] },
  };
  for (const [name, value] of Object.entries(values)) {
    uniforms[name] = typeof value === "number" ? { kind: "number", value } : { kind: "color", value };
  }
  return {
    id: input.id, label: input.label, category: input.category, description: input.description,
    features: input.features, cost: input.cost, notes: input.notes ?? COMMON_NOTES,
    // Stylized branches replace parts of the physical lighting result. Do not
    // offer controls which that branch cannot actually display.
    parameters: [
      ...COMMON_PARAMETERS.filter((parameter) => {
        if (effects.includes("INK") && ["uRoughness", "uReflectivity", "uGlintStrength", "uCloudReflection", "uScatterStrength", "uZenithColor"].includes(parameter.uniform)) return false;
        return !(effects.includes("TOON") && parameter.uniform === "uScatterStrength");
      }),
      ...effects.flatMap((feature) => FEATURE_PARAMETERS[feature]),
    ],
    shader: {
      kind: "classic-r3f", sourceModulePath: `studio://water-shader/${input.id}`,
      vertexShader: WATER_VERTEX_SHADER, fragmentShader: WATER_FRAGMENT_SHADER, uniforms,
      variants: [{ name: "water", defines: Object.fromEntries(effects.map((feature) => [`WATER_${feature}`, "1"])),
        side: "double", transparent: true, depthWrite: false }],
      animatedTimeUniform: "uTime",
    },
  };
}

/** v1 IDs remain stable. Existing saved Materials are never silently migrated. */
export const WATER_SHADER_CATALOG: readonly WaterShaderCatalogEntry[] = [
  preset({ id: "calm-lake", label: "Calm Lake", category: "lake", cost: "low",
    description: "穏やかな湖と入り江。長い弱いうねりに、繊細なさざ波と柔らかな空の反射を重ねます。",
    features: ["細かなさざ波", "静かな反射"],
    values: { uWaveHeight: 0.15, uWaveScale: 1.7, uWaveLayers: 2, uWaveSpeed: 0.16, uDetailStrength: 0.5,
      uFoamAmount: 0.04, uRoughness: 0.12, uDeepColor: "#143d43", uShallowColor: "#76a49a", uOpacity: 0.8 } }),
  preset({ id: "ocean-waves", label: "Ocean Waves", category: "ocean", cost: "medium",
    description: "標準の海。交差するうねり、細かなさざ波、ちぎれた白波、逆光の透け色を組み合わせます。",
    features: ["交差するうねり", "泡の網目", "逆光の波頭"] }),
  preset({ id: "stylized-toon", label: "Stylized Toon", category: "stylized", cost: "low", effects: ["TOON"],
    description: "段階的な陰影と明瞭な波の輪郭。従来のIDを保ったまま、波に沿う線と泡の形を改良したセルルックです。",
    features: ["段階的な陰影", "波の輪郭線"],
    values: { uDeepColor: "#17649d", uShallowColor: "#40bed0", uFoamAmount: 0.5, uWaveHeight: 0.62,
      uDetailQuality: 0, uDetailStrength: 0.45, uDetailScale: 0.4, uBandCount: 4 } }),
  preset({ id: "deep-swell", label: "Deep Ocean Swell", category: "ocean", cost: "medium",
    description: "遠くまで続く外洋。波長の長いうねりを4層で交差させ、青い谷と控えめな白波をつくります。",
    features: ["長いうねり", "4層の波", "深い青"],
    values: { uWaveScale: 0.36, uWaveHeight: 0.73, uWaveLayers: 4, uWaveSpeed: 0.2,
      uDeepColor: "#04192e", uShallowColor: "#1a617c", uDetailScale: 0.48, uFoamAmount: 0.5, uHazeDistance: 700 } }),
  preset({ id: "trade-wind-sea", label: "Trade Wind Sea", category: "ocean", cost: "medium", effects: ["STREAKS"],
    description: "風が一定方向に吹く海。短めの風波と、風下へ細長く伸びる泡筋で流れの方向を見せます。",
    features: ["方向性のある波", "風下への泡筋"],
    values: { uWaveScale: 1.5, uWaveHeight: 0.68, uWaveLayers: 4, uWaveSpeed: 0.36,
      uFoamAmount: 0.61, uStreakStrength: 2.1, uDetailStrength: 1.35, uDeepColor: "#123e55" } }),
  preset({ id: "tropical-lagoon", label: "Tropical Lagoon", category: "tropical", cost: "medium", effects: ["CAUSTICS"],
    description: "南国の浅いラグーン。小さな波と青緑の透明感、水面をゆっくり流れる集光模様を組み合わせます。",
    features: ["青緑の浅瀬", "疑似コースティクス", "小さな波"],
    values: { uDeepColor: "#08717e", uShallowColor: "#63d9c5", uWaveHeight: 0.2, uWaveScale: 2.4,
      uWaveLayers: 2, uWaveSpeed: 0.17, uDetailStrength: 0.55, uDetailScale: 0.9,
      uFoamAmount: 0.1, uOpacity: 0.62, uRoughness: 0.13, uCausticStrength: 1.8, uCausticScale: 0.8 } }),
  preset({ id: "coral-shallows", label: "Coral Shallows", category: "tropical", cost: "high", effects: ["SHORE", "CAUSTICS"],
    description: "白砂の海岸に合わせる明るい浅瀬。寄せ波の縁と細かな光の網目を描きます。岸線の位置は手動で合わせます。",
    features: ["寄せ波", "明るい浅瀬", "光の網目"],
    values: { uDeepColor: "#209a9f", uShallowColor: "#97e2cb", uWaveHeight: 0.25, uWaveScale: 1.8,
      uDetailStrength: 0.58, uFoamAmount: 0.43, uOpacity: 0.64, uShoreWidth: 1.6, uCausticStrength: 1.5 } }),
  preset({ id: "coastal-surf", label: "Coastal Surf", category: "coast", cost: "medium", effects: ["SHORE"],
    description: "砂浜に寄せて返す波。白い波の縁、沖側の砕ける帯、浅瀬から沖への色の変化を描きます。",
    features: ["往復する波打ち際", "砕ける波", "浅瀬の色変化"],
    values: { uWaveHeight: 0.52, uWaveScale: 1.1, uFoamAmount: 0.65, uShoreWidth: 2.5,
      uDeepColor: "#0d596c", uShallowColor: "#64b9b1", uFoamScale: 1.5, uOpacity: 0.78 } }),
  preset({ id: "rocky-coast", label: "Rocky Coast Surge", category: "coast", cost: "high", effects: ["SHORE", "STREAKS"],
    description: "磯に合わせる力強い海。斜めに重なるうねりと、広がって崩れる泡。岩の接触箇所を自動検出する機能ではありません。",
    features: ["交差波", "大きな寄せ波", "細長い泡"],
    values: { uWaveHeight: 0.86, uWaveScale: 0.7, uWaveLayers: 4, uWaveSpeed: 0.34,
      uFoamAmount: 0.71, uFoamScale: 1.4, uShoreWidth: 3.8, uStreakStrength: 1.7,
      uDeepColor: "#123741", uShallowColor: "#539891", uRoughness: 0.25, uDetailStrength: 1.4 } }),
  preset({ id: "storm-sea", label: "Storm Sea", category: "weather", cost: "high", effects: ["STREAKS"],
    description: "強風下の暗い海。4層の荒いうねり、崩れる白波、風に引き伸ばされた泡を重ねます。",
    features: ["荒いうねり", "崩れる白波", "風の泡筋"],
    values: { uWaveHeight: 0.98, uWaveScale: 0.58, uWaveLayers: 4, uWaveSpeed: 0.46,
      uFoamAmount: 0.77, uFoamSharpness: 0.2, uStreakStrength: 2.6, uDetailStrength: 1.6, uDetailQuality: 2,
      uRoughness: 0.33, uDeepColor: "#0b202b", uShallowColor: "#406776", uZenithColor: "#3d5262",
      uHorizonColor: "#8a9aa4", uCloudReflection: 0.8, uSunIntensity: 0.45, uHazeDistance: 140 } }),
  preset({ id: "rainy-harbor", label: "Rainy Harbor", category: "weather", cost: "high", effects: ["RAIN"],
    description: "雨の降る静かな港。緩いうねりの上に、時間差で広がる円形の波紋を重ねます。雨粒は別途配置してください。",
    features: ["雨の円形波紋", "静かなうねり", "曇天の反射"],
    values: { uWaveHeight: 0.15, uWaveScale: 2.6, uWaveSpeed: 0.28, uWaveLayers: 2,
      uFoamAmount: 0.02, uDetailStrength: 0.38, uRainStrength: 1.6, uRoughness: 0.16,
      uDeepColor: "#243b44", uShallowColor: "#719197", uZenithColor: "#607685", uHorizonColor: "#b0babc", uCloudReflection: 0.8 } }),
  preset({ id: "golden-tide", label: "Golden Tide", category: "night", cost: "medium",
    description: "夕方の長いうねりと、低い光が走る水面。暖かな水平線と寒色の波の谷を対比させます。",
    features: ["低い光のきらめき", "暖色の水平線", "長いうねり"], sunDirection: [-0.16, 0.13, -0.98],
    values: { uWaveHeight: 0.4, uWaveScale: 0.72, uWaveSpeed: 0.18, uFoamAmount: 0.2,
      uDeepColor: "#28384c", uShallowColor: "#747b80", uZenithColor: "#697c9c", uHorizonColor: "#f0b47d",
      uSunColor: "#ffba76", uSunIntensity: 1.6, uGlintStrength: 1.8, uRoughness: 0.18, uDetailStrength: 0.85 } }),
  preset({ id: "moonlit-ocean", label: "Moonlit Ocean", category: "night", cost: "medium",
    description: "月明かりを細く映す暗い海。波の谷を暗く保ち、反射とわずかな白波で水面を見せます。",
    features: ["月明かりの反射", "暗い波の谷", "控えめな白波"], sunDirection: [-0.2, 0.23, -0.95],
    values: { uWaveHeight: 0.35, uWaveScale: 0.8, uWaveSpeed: 0.17, uFoamAmount: 0.18,
      uDeepColor: "#020c1c", uShallowColor: "#164057", uZenithColor: "#09162e", uHorizonColor: "#466782",
      uSunColor: "#b3d8ff", uSunIntensity: 0.8, uAmbientIntensity: 0.22, uGlintStrength: 2.1,
      uRoughness: 0.15, uFoamColor: "#829baa", uCloudReflection: 0.12, uDetailStrength: 0.85 } }),
  preset({ id: "bioluminescent-bay", label: "Bioluminescent Bay", category: "night", cost: "high", effects: ["GLOW", "SHORE"],
    description: "夜光虫をイメージした海。寄せ波とちぎれた泡が青緑に光り、小さな光の粒が水面に混じります。",
    features: ["発光する寄せ波", "光る微粒子", "暗い水面"],
    values: { uWaveHeight: 0.63, uWaveScale: 1.25, uWaveSpeed: 0.23, uFoamAmount: 0.58,
      uDeepColor: "#010d1b", uShallowColor: "#093642", uZenithColor: "#07162b", uHorizonColor: "#294458",
      uFoamColor: "#2b727b", uGlowColor: "#24e9ec", uGlowStrength: 3.8, uSunIntensity: 0.25,
      uAmbientIntensity: 0.25, uShoreWidth: 2.3, uDetailStrength: 0.95 } }),
  preset({ id: "anime-ocean", label: "Anime Summer Sea", category: "stylized", cost: "medium", effects: ["TOON", "CAUSTICS"],
    description: "明るい夏のアニメ調の海。広い色面、波に沿う白い線、浅い部分の光の模様を合わせます。",
    features: ["鮮明な色面", "白い波線", "浅瀬の光"],
    values: { uDeepColor: "#137dac", uShallowColor: "#68d7d4", uFoamColor: "#f5fff0",
      uBandCount: 3, uWaveScale: 1.4, uWaveHeight: 0.55, uFoamAmount: 0.53,
      uDetailStrength: 0.45, uCausticStrength: 0.9, uHorizonColor: "#c6edea" } }),
  preset({ id: "watercolor-sea", label: "Watercolor Sea", category: "stylized", cost: "medium", effects: ["PIGMENT"],
    description: "絵の具の濃淡と細かな粒子感を重ねた水彩風の海。光の反射を広く柔らかくし、泡の縁をかすれさせます。",
    features: ["絵の具のむら", "かすれた泡", "柔らかな反射"],
    values: { uDeepColor: "#416e94", uShallowColor: "#a4cfc1", uZenithColor: "#b2c3cf",
      uHorizonColor: "#e6d8c4", uFoamColor: "#eee7d4", uWaveHeight: 0.65, uWaveScale: 1.2,
      uRoughness: 0.4, uReflectivity: 0.48, uGlintStrength: 0.4, uDetailStrength: 0.75,
      uPigmentStrength: 1.7, uFoamAmount: 0.65, uFoamScale: 1.7 } }),
  preset({ id: "ink-waves", label: "Ink Waves", category: "stylized", cost: "medium", effects: ["INK", "PIGMENT"],
    description: "墨と生成りの紙をイメージした海。波の高さに沿う曲線と斜線を重ね、単なるモノクロ化とは異なる輪郭表現にします。",
    features: ["墨の等高線", "斜線の陰影", "紙色の泡"],
    values: { uDeepColor: "#192831", uShallowColor: "#dbd6bc", uFoamColor: "#f1ead4",
      uZenithColor: "#7c898a", uHorizonColor: "#e5dfc8", uWaveHeight: 0.74, uWaveScale: 1.3,
      uDetailStrength: 0.55, uFoamAmount: 0.35, uPigmentStrength: 0.7, uGlintStrength: 0.15 } }),
  preset({ id: "aurora-tide", label: "Aurora Tide", category: "fantasy", cost: "high", effects: ["GLOW", "IRIDESCENT"],
    description: "緑から紫へ色が移る幻想的な海。角度による偏光色と発光する波頭を組み合わせます。空のオーロラを実際に反射するものではありません。",
    features: ["角度で変わる色", "発光する波頭", "光る微粒子"],
    values: { uDeepColor: "#11132b", uShallowColor: "#235952", uZenithColor: "#1b1c4a", uHorizonColor: "#7b79a0",
      uWaveHeight: 0.7, uWaveScale: 0.65, uFoamAmount: 0.51, uGlowColor: "#74f0b4", uGlowStrength: 2.3,
      uIridescence: 0.95, uFoamColor: "#519581", uSunIntensity: 0.45, uAmbientIntensity: 0.3 } }),
  preset({ id: "holographic-sea", label: "Holographic Sea", category: "fantasy", cost: "medium", effects: ["GLOW", "GRID"],
    description: "波で歪む発光グリッドの海。流れる光と波頭の発光で、SF空間や抽象的なワールドに使えます。",
    features: ["波で歪む格子", "流れる光", "発光する輪郭"],
    values: { uDeepColor: "#031427", uShallowColor: "#0d4262", uZenithColor: "#10152d", uHorizonColor: "#3a5b81",
      uWaveHeight: 0.78, uWaveScale: 1, uFoamAmount: 0.2, uGlowColor: "#26cfff", uGlowStrength: 2.3,
      uGridScale: 0.32, uDetailStrength: 0.55, uOpacity: 0.82, uSunIntensity: 0.3 } }),
  preset({ id: "iridescent-sea", label: "Iridescent Sea", category: "fantasy", cost: "medium", effects: ["IRIDESCENT"],
    description: "油膜や異星の海をイメージした偏光色。なめらかな反射と複数方向のうねりに、角度依存の虹色を混ぜます。",
    features: ["角度依存の虹色", "なめらかな反射", "交差する波"],
    values: { uDeepColor: "#2d3256", uShallowColor: "#5e918a", uWaveHeight: 0.34, uWaveScale: 1.5,
      uWaveSpeed: 0.14, uRoughness: 0.09, uDetailStrength: 0.48, uFoamAmount: 0.03,
      uIridescence: 1, uHorizonColor: "#c3c7e2", uZenithColor: "#5c6b8e" } }),
  preset({ id: "glacial-sea", label: "Glacial Sea", category: "weather", cost: "high", effects: ["ICE"],
    description: "冷たい青緑の水と、割れ目のある流氷風の模様。模様は水面上の表現で、立体的な氷塊は別のMeshで配置します。",
    features: ["流氷風の模様", "氷の割れ目", "穏やかな水面"],
    values: { uDeepColor: "#154952", uShallowColor: "#82bec6", uFoamColor: "#dfedf0",
      uZenithColor: "#8ba7bc", uHorizonColor: "#d9e6e7", uWaveHeight: 0.12, uWaveScale: 1.6,
      uWaveSpeed: 0.1, uDetailStrength: 0.5, uFoamAmount: 0.08, uIceCoverage: 0.69, uRoughness: 0.18 } }),
];

export function getWaterShaderCatalogEntry(entryId: string): WaterShaderCatalogEntry | undefined {
  return WATER_SHADER_CATALOG.find((entry) => entry.id === entryId);
}

/** Reject invalid values, clamp ranges and quantize whole-number selectors. */
export function applyWaterShaderParameters(entry: WaterShaderCatalogEntry,
  values: Readonly<Record<string, number | string>>): ClassicR3fMaterialShader {
  const uniforms = { ...entry.shader.uniforms };
  for (const parameter of entry.parameters) {
    const value = values[parameter.uniform], current = uniforms[parameter.uniform];
    if (parameter.kind === "number") {
      if (current?.kind !== "number" || typeof value !== "number" || !Number.isFinite(value)) continue;
      const clamped = Math.min(Math.max(value, parameter.min), parameter.max);
      uniforms[parameter.uniform] = { kind: "number", value: parameter.step >= 1
        ? Math.min(parameter.max, parameter.min + Math.round((clamped-parameter.min)/parameter.step)*parameter.step)
        : clamped };
    } else if (current?.kind === "color" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
      uniforms[parameter.uniform] = { kind: "color", value: value.toLowerCase() };
    }
  }
  return { ...entry.shader, uniforms };
}

export function defaultWaterShaderParameterValues(entry: WaterShaderCatalogEntry): Record<string, number | string> {
  const values: Record<string, number | string> = {};
  for (const parameter of entry.parameters) {
    const uniform = entry.shader.uniforms[parameter.uniform];
    if ((parameter.kind === "number" && uniform?.kind === "number") ||
      (parameter.kind === "color" && uniform?.kind === "color")) values[parameter.uniform] = uniform.value;
  }
  return values;
}
