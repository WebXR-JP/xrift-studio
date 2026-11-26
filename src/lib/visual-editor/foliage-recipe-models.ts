import type { BuiltinRecipeModelDefinition } from "./builtin-recipe-models";

/**
 * The bundled tree models: bark and leaf cards grown by
 * `scripts/generate-foliage-models.mjs`, which also documents the vertex
 * attributes the foliage Material reads from them.
 *
 * Each tree comes twice. The lighter one has about half the leaf cards, each
 * drawn larger so the crown keeps its volume, and a trunk with fewer sides: a
 * wood of them costs a phone about half as much to draw.
 *
 * The values below are what `node scripts/generate-foliage-models.mjs --report`
 * prints; `--check` fails when a file no longer matches its generator.
 */
const PROVENANCE =
  "Project-original procedural mesh, grown by scripts/generate-foliage-models.mjs. No textures inside; the foliage Material supplies them.";

export const FOLIAGE_RECIPE_MODELS: readonly BuiltinRecipeModelDefinition[] = [
  {
    modelId: "foliageBroadleaf",
    assetId: "model-foliage-broadleaf-5579ce78de7c",
    publicPath: "/visual-editor/foliage/v1/foliage-broadleaf.glb",
    fileName: "foliage-broadleaf.glb",
    sha256: "5579ce78de7c878c9c3bc0ce86b7c0bc6bed8e94a6da771705f2393fc3888dda",
    byteLength: 374396,
    displayName: "広葉樹",
    approxRadius: 5.7818,
    bounds: { min: [-4.413600921630859, -0.18644635379314423, -6.155665874481201], max: [4.580948829650879, 10.243897438049316, 5.407912254333496] },
    provenance: PROVENANCE,
  },
  {
    modelId: "foliageBroadleafLight",
    assetId: "model-foliage-broadleaf-light-03dd0b6a7611",
    publicPath: "/visual-editor/foliage/v1/foliage-broadleaf-light.glb",
    fileName: "foliage-broadleaf-light.glb",
    sha256: "03dd0b6a761130a864869797caf9852022ce2d50634900e3c2affc7aea4ae962",
    byteLength: 174648,
    displayName: "広葉樹（軽量版）",
    approxRadius: 6.17,
    bounds: { min: [-4.831882953643799, -0.19047170877456665, -6.74129581451416], max: [5.251108646392822, 10.522051811218262, 5.598684310913086] },
    provenance: PROVENANCE,
  },
  {
    modelId: "foliageGardenTree",
    assetId: "model-foliage-garden-tree-31829482f491",
    publicPath: "/visual-editor/foliage/v1/foliage-garden-tree.glb",
    fileName: "foliage-garden-tree.glb",
    sha256: "31829482f491e1fbf58007297d4b984ddf87e6c24c6caa1a469900e743d0fca8",
    byteLength: 930536,
    displayName: "庭木",
    approxRadius: 3.6531,
    bounds: { min: [-3.583749532699585, -0.25666117668151855, -3.3990604877471924], max: [3.722400188446045, 5.047243595123291, 3.4284632205963135] },
    provenance: PROVENANCE,
  },
  {
    modelId: "foliageGardenTreeLight",
    assetId: "model-foliage-garden-tree-light-e911a3437b96",
    publicPath: "/visual-editor/foliage/v1/foliage-garden-tree-light.glb",
    fileName: "foliage-garden-tree-light.glb",
    sha256: "e911a3437b965eb4b8e8fc10d26e45bde9803b252ebf79fd6eccb04ce77d2bca",
    byteLength: 296988,
    displayName: "庭木（軽量版）",
    approxRadius: 3.8417,
    bounds: { min: [-3.799855947494507, -0.24350498616695404, -3.6285510063171387], max: [3.883448362350464, 5.2361321449279785, 3.562396287918091] },
    provenance: PROVENANCE,
  },
  {
    modelId: "foliageShrub",
    assetId: "model-foliage-shrub-8c90cd6fb632",
    publicPath: "/visual-editor/foliage/v1/foliage-shrub.glb",
    fileName: "foliage-shrub.glb",
    sha256: "8c90cd6fb63269120d73790d90d66940da61d8fdd1245520d85e725caccd335e",
    byteLength: 101784,
    displayName: "低木",
    approxRadius: 1.6076,
    bounds: { min: [-1.4484031200408936, -0.48723796010017395, -1.5520027875900269], max: [1.5677566528320312, 1.7115774154663086, 1.6631107330322266] },
    provenance: PROVENANCE,
  },
  {
    modelId: "foliageShrubLight",
    assetId: "model-foliage-shrub-light-9f2460e77ce7",
    publicPath: "/visual-editor/foliage/v1/foliage-shrub-light.glb",
    fileName: "foliage-shrub-light.glb",
    sha256: "9f2460e77ce772621fa44b893b5e9be08657b35da6c3c3d047705180a92b7fa6",
    byteLength: 49340,
    displayName: "低木（軽量版）",
    approxRadius: 1.9015,
    bounds: { min: [-1.9264607429504395, -0.6338704228401184, -1.8519175052642822], max: [1.8764557838439941, 2.1221675872802734, 1.7033531665802002] },
    provenance: PROVENANCE,
  },
];
