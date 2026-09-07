/**
 * GLB models bundled with the app for `SceneRecipe` "model" parts.
 *
 * Each entry pins the exact bytes a recipe expects: `assetId` is the same
 * deterministic id `asset-import.ts` would derive from the file (kind +
 * filename + content hash), computed up front so `ensureBuiltinModelAsset`
 * can check whether the current project already has it without any I/O.
 *
 * Unlike `BUNDLED_STARTER_ASSETS` (starter-templates.ts), these are imported
 * into an already-open project, not laid down while a new project is
 * created, so they carry no `projectRelativePath` of their own -- the import
 * pipeline picks a content-addressed one.
 */
export type BuiltinRecipeModelDefinition = {
  /** Stable key `SceneRecipePart` (kind: "model") parts reference. */
  modelId: string;
  /** Deterministic id: `model-${safeIdSegment(fileName without extension)}-${sha256.slice(0,12)}`. */
  assetId: string;
  /** Served from the app's own public/ directory, alongside starter-assets/. */
  publicPath: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  displayName: string;
  /**
   * Half the model's longest dimension in meters, at scale [1,1,1] -- a
   * hand-authored camera-framing hint (same spirit as recipeFraming's 0.2
   * particle/light fallback), not a computed bounding box. The GLB is the
   * source of truth for actual geometry; this only keeps catalog card
   * framing from over- or under-zooming before the model has loaded.
   */
  approxRadius: number;
  /** Local GLB bounds retain floor-based origins when framing catalog previews. */
  bounds?: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  /** Geometry and texture provenance; recording-studio retains its documented CC0 textures. */
  provenance: string;
};

export const BUILTIN_RECIPE_MODELS: readonly BuiltinRecipeModelDefinition[] = [
  {
    modelId: "torch",
    assetId: "model-torch-12823625f7a4",
    publicPath: "/visual-editor/recipe-assets/torch.glb",
    fileName: "torch.glb",
    sha256:
      "12823625f7a45034c76b310bbee55361ec8e506e5126c06d9d49775c1361557b",
    byteLength: 102088,
    displayName: "松明",
    approxRadius: 0.6,
    bounds: {"min": [-0.054999999701976776, -0.6000000238418579, -0.054999999701976776], "max": [0.054999999701976776, 0.6000000238418579, 0.054999999701976776]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "bench",
    assetId: "model-bench-79f8ff4b7ab5",
    publicPath: "/visual-editor/recipe-assets/bench.glb",
    fileName: "bench.glb",
    sha256:
      "79f8ff4b7ab56e73c69d7d82b65686bd3edd051451ed7c4359db76243928ebe0",
    byteLength: 124748,
    displayName: "ベンチ",
    approxRadius: 0.86,
    bounds: {"min": [-0.8600000143051147, -0.4399999976158142, -0.22499999403953552], "max": [0.8600000143051147, 0.5199999809265137, 0.22499999403953552]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "stoneLantern",
    assetId: "model-stone-lantern-f87641eab6f2",
    publicPath: "/visual-editor/recipe-assets/stone-lantern.glb",
    fileName: "stone-lantern.glb",
    sha256:
      "f87641eab6f2d2be3fef71a55831b2176b79595319e2bfa5b567cba8db8e0dfc",
    byteLength: 119568,
    displayName: "石灯籠",
    approxRadius: 0.75,
    bounds: {"min": [-0.36000001430511475, -0.07999999821186066, -0.36000001430511475], "max": [0.36000001430511475, 1.4199999570846558, 0.36000001430511475]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "tree",
    assetId: "model-tree-3cbee4a6d022",
    publicPath: "/visual-editor/recipe-assets/tree.glb",
    fileName: "tree.glb",
    sha256:
      "3cbee4a6d0222eecb728397dea471195be15fc32f378ff133fd7cc2bca91a87e",
    byteLength: 499084,
    displayName: "木",
    approxRadius: 1.4925,
    bounds: {"min": [-0.9950000047683716, -0.8600000143051147, -0.949999988079071], "max": [1.149999976158142, 2.125, 0.949999988079071]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "streetLight",
    assetId: "model-street-light-f6c18bbe6545",
    publicPath: "/visual-editor/recipe-assets/street-light.glb",
    fileName: "street-light.glb",
    sha256:
      "f6c18bbe65457ab0ecea58ed2893e2440d5da5e6277bf8d791a02f5e5bbb5b41",
    byteLength: 60044,
    displayName: "街灯",
    approxRadius: 1.67,
    bounds: {"min": [-0.32339999079704285, 0.0, -0.3400000035762787], "max": [0.32339999079704285, 3.3399999141693115, 0.3400000035762787]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "rockA",
    assetId: "model-rock-a-bb9a3c956679",
    publicPath: "/visual-editor/recipe-assets/rock-a.glb",
    fileName: "rock-a.glb",
    sha256:
      "bb9a3c95667912e980792927bc0b544ac254f9b49da676e09d33d05f18133f56",
    byteLength: 53320,
    displayName: "岩A",
    approxRadius: 0.3993,
    bounds: {"min": [-0.3596999943256378, 0.0, -0.3952000141143799], "max": [0.4106000065803528, 0.6536999940872192, 0.4032999873161316]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "rockB",
    assetId: "model-rock-b-83f7636bc358",
    publicPath: "/visual-editor/recipe-assets/rock-b.glb",
    fileName: "rock-b.glb",
    sha256:
      "83f7636bc358c1a7ed4f9c9bd3353cc5e4cdc761063c6b2eb1dab583344af470",
    byteLength: 53320,
    displayName: "岩B",
    approxRadius: 0.4068,
    bounds: {"min": [-0.3709000051021576, 0.0, -0.41449999809265137], "max": [0.4027999937534332, 0.796999990940094, 0.39910000562667847]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "brazier",
    assetId: "model-brazier-1a200236e61b",
    publicPath: "/visual-editor/recipe-assets/brazier.glb",
    fileName: "brazier.glb",
    sha256:
      "1a200236e61b62dfc9b97a5b547363073be2014441f4103b5c278f96bf575a5e",
    byteLength: 85916,
    displayName: "かがり火の鉢",
    approxRadius: 0.4155,
    bounds: {"min": [-0.19499999284744263, -0.020999999716877937, -0.20960000157356262], "max": [0.2329999953508377, 0.8100000023841858, 0.20960000157356262]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "lantern",
    assetId: "model-lantern-772c099be529",
    publicPath: "/visual-editor/recipe-assets/lantern.glb",
    fileName: "lantern.glb",
    sha256:
      "772c099be529e2edc992074d3823fd1fb3bd4904a211afef422932e6409d925a",
    byteLength: 188180,
    displayName: "提灯",
    approxRadius: 0.175,
    bounds: {"min": [-0.12359999865293503, 0.0, -0.12999999523162842], "max": [0.12359999865293503, 0.3499999940395355, 0.12999999523162842]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "candelabra",
    assetId: "model-candelabra-18cf5bd045b9",
    publicPath: "/visual-editor/recipe-assets/candelabra.glb",
    fileName: "candelabra.glb",
    sha256:
      "18cf5bd045b91b4612f9cef4d917d9fa28863b16a65802740da166a87e37ec6f",
    byteLength: 74120,
    displayName: "燭台",
    approxRadius: 0.275,
    bounds: {"min": [-0.1599999964237213, 0.0, -0.14000000059604645], "max": [0.1599999964237213, 0.550000011920929, 0.14000000059604645]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "bambooStalk",
    assetId: "model-bamboo-stalk-a50d1fff6aff",
    publicPath: "/visual-editor/recipe-assets/bamboo-stalk.glb",
    fileName: "bamboo-stalk.glb",
    sha256:
      "a50d1fff6aff4e93ed0e46105b1caff2f78e63f0654033445707970acb9347d4",
    byteLength: 155676,
    displayName: "竹",
    approxRadius: 1.6166,
    bounds: {"min": [-0.34360000491142273, 0.0, -0.37940001487731934], "max": [0.5026999711990356, 3.233299970626831, 0.4235999882221222]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "stump",
    assetId: "model-stump-735c858da8cc",
    publicPath: "/visual-editor/recipe-assets/stump.glb",
    fileName: "stump.glb",
    sha256:
      "735c858da8cc172c31b66e4111505b4412ea2119471691940fb2980f29457c22",
    byteLength: 82660,
    displayName: "切り株",
    approxRadius: 0.46,
    bounds: {"min": [-0.46000000834465027, -0.010999999940395355, -0.46000000834465027], "max": [0.46000000834465027, 0.4169999957084656, 0.46000000834465027]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "log",
    assetId: "model-log-0144847967f0",
    publicPath: "/visual-editor/recipe-assets/log.glb",
    fileName: "log.glb",
    sha256:
      "0144847967f0a242a6138dd689062f573850e59e0ddce0ae11bd10267c845d00",
    byteLength: 69616,
    displayName: "薪",
    approxRadius: 0.4315,
    bounds: {"min": [0.0, 0.0, -0.052000001072883606], "max": [0.8629999756813049, 0.10400000214576721, 0.052000001072883606]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "bush",
    assetId: "model-bush-adb3484c44ee",
    publicPath: "/visual-editor/recipe-assets/bush.glb",
    fileName: "bush.glb",
    sha256:
      "adb3484c44ee8ee59b19f4f58153bb5299cfaa1e60c415a23af30d6bc7788287",
    byteLength: 142700,
    displayName: "茂み",
    approxRadius: 0.5006,
    bounds: {"min": [-0.46549999713897705, 0.01209999993443489, -0.35899999737739563], "max": [0.5356000065803528, 0.44769999384880066, 0.38960000872612]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "pillar",
    assetId: "model-pillar-5ee3fa0c4380",
    publicPath: "/visual-editor/recipe-assets/pillar.glb",
    fileName: "pillar.glb",
    sha256:
      "5ee3fa0c438083479717f0bee1301ffabf6c635597a4f6c2e423a591c9598209",
    byteLength: 100612,
    displayName: "石柱",
    approxRadius: 1.54,
    bounds: {"min": [-0.3100000023841858, 0.0, -0.3100000023841858], "max": [0.3100000023841858, 3.0799999237060547, 0.3100000023841858]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "stairs",
    assetId: "model-stairs-7872d31f018c",
    publicPath: "/visual-editor/recipe-assets/stairs.glb",
    fileName: "stairs.glb",
    sha256:
      "7872d31f018c523184d522632eca6f16c9dbde76fb7e4e41a3430e1c45766da1",
    byteLength: 176332,
    displayName: "階段",
    approxRadius: 1.0,
    bounds: {"min": [-0.800000011920929, 0.0, -1.7999999523162842], "max": [0.800000011920929, 0.8999999761581421, 0.20000000298023224]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "wall",
    assetId: "model-wall-80f7822be7ba",
    publicPath: "/visual-editor/recipe-assets/wall.glb",
    fileName: "wall.glb",
    sha256:
      "80f7822be7baf7d2f890d3a26868b335dea347f32418f7b0f1dad326d3cdc460",
    byteLength: 284476,
    displayName: "塀",
    approxRadius: 2.8394,
    bounds: {"min": [-2.839400053024292, 0.0, -0.3393999934196472], "max": [2.839400053024292, 2.1600000858306885, 0.3393999934196472]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "wellFrame",
    assetId: "model-well-frame-5ab6e9d24c23",
    publicPath: "/visual-editor/recipe-assets/well-frame.glb",
    fileName: "well-frame.glb",
    sha256:
      "5ab6e9d24c237044175c01620700c2deefabada2416f85da18ef026304928800",
    byteLength: 308072,
    displayName: "井戸の屋根",
    approxRadius: 1.11,
    bounds: {"min": [-0.7799999713897705, 0.0, -0.44999998807907104], "max": [0.7799999713897705, 2.2200000286102295, 0.44999998807907104]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "pier",
    assetId: "model-pier-61ba9fc60ae4",
    publicPath: "/visual-editor/recipe-assets/pier.glb",
    fileName: "pier.glb",
    sha256:
      "61ba9fc60ae46f2a08abb6924f9cbcb4b8e4ecd54e7b6604c8382b8eb2050e26",
    byteLength: 306576,
    displayName: "桟橋",
    approxRadius: 1.22,
    bounds: {"min": [-0.699999988079071, 0.0, -2.2200000286102295], "max": [0.699999988079071, 0.5299999713897705, 0.2199999988079071]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "table",
    assetId: "model-table-b0d84ca2ad7b",
    publicPath: "/visual-editor/recipe-assets/table.glb",
    fileName: "table.glb",
    sha256:
      "b0d84ca2ad7bf75b6f5365f36a1a2b2d5a1103ed6fea038b85498ba4f07e41f6",
    byteLength: 97036,
    displayName: "テーブル",
    approxRadius: 0.7,
    bounds: {"min": [-0.699999988079071, 0.0, -0.4000000059604645], "max": [0.699999988079071, 0.7699999809265137, 0.4000000059604645]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "stool",
    assetId: "model-stool-4435fd760ce2",
    publicPath: "/visual-editor/recipe-assets/stool.glb",
    fileName: "stool.glb",
    sha256:
      "4435fd760ce224ed7e6567308d048d68d04d491f0b13f27f283513d58b0c7fc4",
    byteLength: 74024,
    displayName: "丸椅子",
    approxRadius: 0.22,
    bounds: {"min": [-0.20000000298023224, 0.0, -0.20000000298023224], "max": [0.20000000298023224, 0.4399999976158142, 0.20000000298023224]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "magicCircle",
    assetId: "model-magic-circle-3a3059e4d98e",
    publicPath: "/visual-editor/recipe-assets/magic-circle.glb",
    fileName: "magic-circle.glb",
    sha256:
      "3a3059e4d98ef15def6a5b16d98dad3439fd0dc4d2d1b71477f1c284d500d254",
    byteLength: 160900,
    displayName: "魔法陣",
    approxRadius: 0.75,
    bounds: {"min": [-0.75, 0.0, -0.75], "max": [0.75, 0.05000000074505806, 0.75]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "warpPillar",
    assetId: "model-warp-pillar-91a2524cd0bf",
    publicPath: "/visual-editor/recipe-assets/warp-pillar.glb",
    fileName: "warp-pillar.glb",
    sha256:
      "91a2524cd0bf10e6080bf37be2b963ebf4b1644549577b4871c85c26132f7f18",
    byteLength: 52044,
    displayName: "ワープの柱",
    approxRadius: 1.58,
    bounds: {"min": [-0.3400000035762787, 0.0, -0.3400000035762787], "max": [0.3400000035762787, 3.1600000858306885, 0.3400000035762787]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "snowman",
    assetId: "model-snowman-8308126e1837",
    publicPath: "/visual-editor/recipe-assets/snowman.glb",
    fileName: "snowman.glb",
    sha256:
      "8308126e1837de10ecec52cbeee776f33a60ec87f0acb3cb7f5ec22bcfac5bdd",
    byteLength: 152860,
    displayName: "雪だるま",
    approxRadius: 0.6727,
    bounds: {"min": [-0.3986000120639801, -0.005200000014156103, -0.40610000491142273], "max": [0.4293000102043152, 1.3401999473571777, 0.413100004196167]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "door",
    assetId: "model-door-6ceedd615507",
    publicPath: "/visual-editor/recipe-assets/door.glb",
    fileName: "door.glb",
    sha256:
      "6ceedd6155073262434054030cc717a4b599713a4692a0cf373f0b63cf28f5d3",
    byteLength: 132612,
    displayName: "ドア",
    approxRadius: 1.045,
    bounds: {"min": [-0.5400000214576721, 0.0, -0.05999999865889549], "max": [0.5400000214576721, 2.0899999141693115, 0.07999999821186066]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "window",
    assetId: "model-window-0a87aaf32e91",
    publicPath: "/visual-editor/recipe-assets/window.glb",
    fileName: "window.glb",
    sha256:
      "0a87aaf32e91055dad6a7d988e25cecab54240c1e6e7d964d3a3b56104eccb2d",
    byteLength: 131884,
    displayName: "窓",
    approxRadius: 0.695,
    bounds: {"min": [-0.5799999833106995, 0.0, -0.06499999761581421], "max": [0.5799999833106995, 1.3899999856948853, 0.06499999761581421]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "floorPanel",
    assetId: "model-floor-panel-a1e714f44ea9",
    publicPath: "/visual-editor/recipe-assets/floor-panel.glb",
    fileName: "floor-panel.glb",
    sha256:
      "a1e714f44ea93b6ea7b2a568b44968d3b65260bba04ff8e912e3141e2a38dc56",
    byteLength: 142088,
    displayName: "床パネル",
    approxRadius: 1.0,
    bounds: {"min": [-1.0, -0.05000000074505806, -1.0], "max": [1.0, 0.0020000000949949026, 1.0]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "wallPanel",
    assetId: "model-wall-panel-782a592378b1",
    publicPath: "/visual-editor/recipe-assets/wall-panel.glb",
    fileName: "wall-panel.glb",
    sha256:
      "782a592378b1b3848ff14f53cb1ff260d24da24b5b55f4a8129dcbb0ac7e11d1",
    byteLength: 67344,
    displayName: "壁パネル",
    approxRadius: 1.2,
    bounds: {"min": [-1.0, 0.0, -0.09000000357627869], "max": [1.0, 2.4000000953674316, 0.10999999940395355]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "recordingStudio",
    assetId: "model-recording-studio-fbd21a2d1212",
    publicPath: "/visual-editor/recipe-assets/recording-studio.glb",
    fileName: "recording-studio.glb",
    sha256:
      "fbd21a2d1212511c9ebf0c599da7dc9dd0c35e23c93eab6783e825b48ecfccdf",
    byteLength: 842596,
    displayName: "収録スタジオ",
    approxRadius: 2.05,
    bounds: {"min": [-1.899999976158142, -0.10000000149011612, -2.6000001430511475], "max": [1.899999976158142, 2.5999999046325684, 1.5]},
    provenance:
      "Original XRift Studio recording-studio geometry retained and repacked. Poly Haven CC0 textures resized to 512px; see THIRD_PARTY_ASSETS.md.",
  },
  {
    modelId: "campfireBase",
    assetId: "model-campfire-base-f3d7d0182995",
    publicPath: "/visual-editor/recipe-assets/campfire-base.glb",
    fileName: "campfire-base.glb",
    sha256:
      "f3d7d0182995254233c575d16e9d8ed3fcd1e0e40c277baf74cc1bca7bfe298c",
    byteLength: 304528,
    displayName: "焚き火の炉と薪",
    approxRadius: 0.5806,
    bounds: {"min": [-0.5698636174201965, -0.005332989618182182, -0.5867459177970886], "max": [0.5913352966308594, 0.2646869122982025, 0.567358136177063]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "fountain",
    assetId: "model-fountain-61acff98f19f",
    publicPath: "/visual-editor/recipe-assets/fountain.glb",
    fileName: "fountain.glb",
    sha256:
      "61acff98f19fbcf7f1d1726ff1f9f0a9530a1471bab4147b4c6f43c898a8ad96",
    byteLength: 343992,
    displayName: "二段の石造噴水",
    approxRadius: 1.08,
    bounds: {"min": [-1.0800000429153442, 0.0, -1.0800000429153442], "max": [1.0800000429153442, 1.0499999523162842, 1.0800000429153442]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
  {
    modelId: "wellBasin",
    assetId: "model-well-basin-470f7ebeb749",
    publicPath: "/visual-editor/recipe-assets/well-basin.glb",
    fileName: "well-basin.glb",
    sha256:
      "470f7ebeb74945e4a6391f3a2e6c4aa05a8f980a2adb5c3615a26bdb1b168b55",
    byteLength: 263112,
    displayName: "井戸の石囲いと水面",
    approxRadius: 0.66,
    bounds: {"min": [-0.6600000262260437, 0.0, -0.6600000262260437], "max": [0.6600000262260437, 0.6800000071525574, 0.6600000262260437]},
    provenance:
      "Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see MODEL_REFRESH_README.ja.md.",
  },
];

export function getBuiltinRecipeModel(
  modelId: string,
): BuiltinRecipeModelDefinition | undefined {
  return BUILTIN_RECIPE_MODELS.find((definition) => definition.modelId === modelId);
}
