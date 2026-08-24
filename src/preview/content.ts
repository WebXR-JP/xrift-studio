import {
  AudioLines,
  Blocks,
  Bot,
  Box,
  CirclePlay,
  CloudSun,
  Droplets,
  FileBox,
  Globe2,
  Image,
  Lightbulb,
  Mountain,
  MousePointer2,
  Music,
  PackageOpen,
  ShieldCheck,
  Upload,
  WandSparkles,
  Workflow,
} from "lucide-react";
import {
  XRIFT_STUDIO_REPOSITORY_URL,
} from "../lib/support-links";

/**
 * Every word this landing page says about the product.
 *
 * Keeping the copy here rather than inline in the sections is what makes it
 * reviewable against the implementation: a claim on this page has to be
 * something the editor actually does, and that is far easier to audit when the
 * claims sit together instead of scattered through markup.
 */

export const releaseUrl =
  "https://github.com/WebXR-JP/xrift-studio/releases/latest";
export const repositoryUrl = XRIFT_STUDIO_REPOSITORY_URL;

export type ProjectKind = "world" | "item";

export const productKinds = [
  {
    icon: Globe2,
    title: "ワールド",
    label: "ワールド",
    text: "人が集まって一緒に過ごせる空間です。ロビーや美術館、遊び場を作ってXRiftに公開できます。",
    tone: "preview-kind-violet",
  },
  {
    icon: Box,
    title: "アイテム",
    label: "アイテム",
    text: "手に取って持ち歩ける道具や飾りです。いろんなワールドで使えるように作って、みんなに共有できます。",
    tone: "preview-kind-cyan",
  },
] as const;

/**
 * The things an author builds a world *out of*.
 *
 * Each line here is checked against the editor: the terrain brush and grass
 * painting, the Gerstner water parameters, the procedural sky presets, the
 * emissive lights, the spatial audio falloff, and the KHR_interactivity graph.
 * The interactivity wording is deliberately about time and events rather than
 * touch — the graph's only triggers are onStart, onTick and received events,
 * so a claim about reacting to a click would be false.
 */
export const worldTools = [
  {
    icon: Mountain,
    title: "地形をつくる",
    text: "ブラシで丘や谷を彫り、草を塗って生やします。整った地形のプリセットから始めることもできます。",
  },
  {
    icon: Droplets,
    title: "水をおく",
    text: "うねる波の水面を置けます。波の速さ、高さ、細かさ、反射の強さを、数値で確かめながら決められます。",
  },
  {
    icon: CloudSun,
    title: "空をきめる",
    text: "計算で描かれる空です。昼から夕暮れ、星空までプリセットから選べて、シーンの光と揃います。",
  },
  {
    icon: Lightbulb,
    title: "光をあてる",
    text: "発光する照明を置き、色味や影の出方を整えます。変えた分は、その場でシーンに映ります。",
  },
  {
    icon: Music,
    title: "音をならす",
    text: "全体に流れるBGMと、近づくほど大きく聞こえる音。距離でどう小さくなるかまで設定できます。",
  },
  {
    icon: Workflow,
    title: "動きをつける",
    text: "開始時や毎フレームをきっかけに、色・発光・アニメーションをノードでつないで動かせます。glTFのKHR_interactivity準拠です。",
  },
] as const;

export const creationFlow = [
  {
    number: "01",
    icon: PackageOpen,
    title: "素材を持ち込む",
    text: "モデル、アバター、画像、音をドロップ。使いたいものが、そのまま制作の入口になります。",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "シーンを組む",
    text: "左のHierarchyで階層を開き、中央のビューで配置。選んだものの詳細は右側で詰められます。",
  },
  {
    number: "03",
    icon: CirclePlay,
    title: "中を歩いて確かめる",
    text: "エディターを閉じずにプレイ。ワールドの操作感も、アイテムの見え方もすぐ確認できます。",
  },
  {
    number: "04",
    icon: Upload,
    title: "XRiftへ届ける",
    text: "タイトルやサムネイル、容量の目安を確認したら、そのままアップロードへ進めます。",
  },
] as const;

export const importGroups = [
  {
    icon: Box,
    label: "3Dモデル・アバター",
    formats: "GLB / glTF / OBJ / VRM",
    tone: "preview-import-violet",
  },
  {
    icon: Image,
    label: "テクスチャ・空気感",
    formats: "PNG / JPG / WebP / KTX2 / HDR / EXR",
    tone: "preview-import-cyan",
  },
  {
    icon: AudioLines,
    label: "BGM・効果音",
    formats: "MP3 / 3D Audio",
    tone: "preview-import-amber",
  },
] as const;

/**
 * Where material comes from besides the author's own files.
 *
 * Unity and Open Brush used to sit under a section headed "挑戦中の機能" with a
 * note that coverage was still moving. Both ship with registered fixture
 * suites now, so they belong here with the other sources rather than being
 * presented as experiments.
 */
export const assetSources = [
  {
    mark: "P",
    name: "Poly Haven",
    text: "HDRIや素材を検索して、そのまま追加",
  },
  {
    mark: "X",
    name: "XRift公式パーツ",
    text: "Portal、Mirror、Spawn Pointなどを配置",
  },
  {
    mark: "O",
    name: "Open Brush",
    text: "描いた線を、専用の描画経路でシーンへ",
  },
  {
    mark: "U",
    name: "Unity",
    text: "UnityPackage、Scene、Prefabを変換",
  },
] as const;

/**
 * The MCP integration, told at the size it actually is.
 *
 * The tool count is the number the build checks: scripts/generate-mcp-tool-names.mjs
 * verifies it, and `pnpm cli:test` fails when the list drifts. Update this
 * number together with that check rather than guessing.
 */
export const aiPoints = [
  {
    icon: Bot,
    title: "会話でシーンを編集",
    text: "Codex、Claude Code、OpenCodeをワンクリックで登録。いま開いているシーンを読み取って、配置から見た目の調整まで任せられます。",
  },
  {
    icon: Blocks,
    title: "83のツールで動く",
    text: "地形を彫る、Prefabを置く、Materialを変える、Scriptを書く。エディターでできる操作を、AIからも呼び出せます。",
  },
  {
    icon: ShieldCheck,
    title: "任せても、戻せる",
    text: "AIの変更も通常のUndoと自動保存に入ります。Scriptは中身を確認して承認するまで実行されません。",
  },
] as const;

export const experimentalNote = {
  icon: WandSparkles,
  fileIcon: FileBox,
} as const;

export const faqs = [
  {
    question: "XRift Studioで、何が作れますか？",
    answer:
      "XRiftで遊べる「ワールド」と、ワールドをまたいで持ち歩ける「アイテム」の両方を作れます。新規作成時にどちらを選ぶか指定します。",
  },
  {
    question: "地形や水、空も作れますか？",
    answer:
      "作れます。ブラシで地形を彫って草を塗り、波の立つ水面を置き、空はプリセットから選べます。どれも別のツールを使わず、この中で完結します。",
  },
  {
    question: "コードが書けなくても使えますか？",
    answer:
      "はい。画面での制作なら、素材の取り込み、配置、調整、プレイ、公開まで進められます。コードで作りたい人向けのクラシック制作も同じアプリにあります。",
  },
  {
    question: "AIに手伝ってもらえると聞きました。",
    answer:
      "CodexやClaude Codeなどを登録すると、開いているシーンを会話から編集できます。変更は通常のUndoと自動保存に入り、Scriptは承認するまで実行されません。",
  },
  {
    question: "料金はかかりますか？",
    answer:
      "XRift Studioは無料で使えるオープンソースソフトウェアです。ソースコードはMIT Licenseで公開しています。",
  },
  {
    question: "このページのデモでは、どこまでできますか？",
    answer:
      "画面の操作感を試せます。ファイルの保存、AIクライアント接続、素材を含むワールドの公開はデスクトップ版で行います。",
  },
  {
    question: "WindowsやMac、Linuxで使えますか？",
    answer:
      "はい。Windows・macOS・Linuxに対応しています。インストーラーはGitHubのリリースページからダウンロードできます。",
  },
] as const;
