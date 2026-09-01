import {
  AudioLines,
  Blocks,
  Bot,
  Box,
  CirclePlay,
  CloudSun,
  Droplets,
  Globe2,
  Image,
  Lightbulb,
  Mountain,
  MousePointer2,
  Music,
  PackageOpen,
  ShieldCheck,
  Upload,
  Workflow,
} from "lucide-react";
import { ASSET_FORMATS } from "../lib/visual-editor/asset-format-registry";
import { XRIFT_MCP_TOOL_NAMES } from "../lib/visual-editor/mcp-tool-registry";
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
    text: "手に取って持ち歩ける道具や飾りです。どのワールドへも持っていける形で作って、みんなに共有できます。",
    tone: "preview-kind-cyan",
  },
] as const;

/**
 * The things an author builds a world *out of*.
 *
 * Each line here is checked against the editor: the terrain brush and grass
 * painting, the Gerstner water parameters, the procedural sky presets, the
 * emissive lights, the spatial audio falloff, and the KHR_interactivity graph.
 * The interactivity wording names the triggers the graph actually has —
 * `event/onStart`, `event/onTick`, a received event, and `xrift/onInteract`.
 * Touch belongs on this list because the interact trigger ships, but it is
 * worded as being pressed rather than as gaze or proximity, which do not.
 *
 * The verbs are chosen for Japanese rather than carried over from the English
 * feature names they started as. "Place water" had become 水をおく, and water
 * is not something Japanese places; "Set the sky" had become 空をきめる, which
 * is the language of filling in a form. A reader should recognise the action
 * before they read the sentence under it.
 */
export const worldTools = [
  {
    icon: Mountain,
    title: "地形を彫る",
    text: "ブラシで丘や谷を彫り、草はなぞった場所に生えます。起伏のついたプリセットから始めることもできます。",
  },
  {
    icon: Droplets,
    title: "水を張る",
    text: "波の立つ水面を広げられます。波の速さ、高さ、細かさ、反射の強さは、数値を動かしながら決められます。",
  },
  {
    icon: CloudSun,
    title: "空を選ぶ",
    text: "昼、夕暮れ、星空。プリセットを選ぶだけで空ごと入れ替わり、シーンに差す光もそれに合わせて変わります。",
  },
  {
    icon: Lightbulb,
    title: "光をともす",
    text: "照明を置いて、色味と影の出かたを決めます。動かした分はその場でシーンに映るので、見ながら詰められます。",
  },
  {
    icon: Music,
    title: "音を流す",
    text: "ワールド全体に流れるBGMと、近づくほど大きくなる音。どのくらい離れたら聞こえなくなるかまで決められます。",
  },
  {
    icon: Workflow,
    title: "動きをつける",
    text: "押されたとき、ワールドに入った瞬間、そして毎フレーム。きっかけを選んで、位置・色・アニメーション・音をノードでつなぎます。glTFのKHR_interactivityに準拠しています。",
  },
] as const;

export const creationFlow = [
  {
    number: "01",
    icon: PackageOpen,
    title: "素材を持ち込む",
    text: "モデル、アバター、画像、音をドロップするだけ。手元にあるものが、そのまま制作のはじまりになります。",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "シーンを組む",
    text: "左のHierarchyで階層をたどり、中央のビューへ置いていきます。選んだものの細かい設定は、右側でそのまま詰められます。",
  },
  {
    number: "03",
    icon: CirclePlay,
    title: "中を歩いて確かめる",
    text: "エディターを開いたまま、その場でプレイ。歩いたときの感触も、アイテムの見え方も、すぐ確かめられます。",
  },
  {
    number: "04",
    icon: Upload,
    title: "XRiftへ届ける",
    text: "タイトル、サムネイル、容量の目安。ひととおり確かめたら、そのままアップロードへ進みます。",
  },
] as const;

/**
 * The formats an author can drop on the editor.
 *
 * The counts come from `ASSET_FORMATS`, the one table every importer resolves
 * against, because the written-down version of this list had fallen a long way
 * behind the app: the page offered four model formats while the importer
 * converted 27 of them through the Three.js Editor loaders, and it offered
 * "MP3 / 3D Audio" — a format and a feature in the same breath — for six audio
 * containers. Named formats stay hand-picked so the cards read as copy rather
 * than as a dump of every extension, but the counts beside them move on their
 * own when the table does.
 */
const modelFormatCount = Object.keys(ASSET_FORMATS.model).length;
const audioFormatCount = Object.keys(ASSET_FORMATS.audio).length;

export const importGroups = [
  {
    icon: Box,
    label: "3Dモデル・アバター",
    formats: `GLB / glTF / OBJ / VRM / FBX ほか計${modelFormatCount}形式`,
    tone: "preview-import-violet",
  },
  {
    icon: Image,
    label: "テクスチャ・空気感",
    formats: "PNG / JPG / WebP / AVIF / KTX2 / HDR / EXR",
    tone: "preview-import-cyan",
  },
  {
    icon: AudioLines,
    label: "BGM・効果音",
    formats: `MP3 / WAV / Ogg / FLAC ほか計${audioFormatCount}形式`,
    tone: "preview-import-amber",
  },
] as const;

/**
 * Where material comes from besides the author's own files.
 *
 * Every source listed here has a registered fixture suite behind it, which is
 * what earns it a place on this list rather than a caveat about coverage. A
 * source whose conversion is not covered by fixtures does not belong here.
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
    text: "描いたときの質感のまま、シーンへ",
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
 * The tool count is read from the registry rather than written down, because a
 * written-down one had already drifted: the page said 83 while the editor
 * exposed 119. `mcp-tool-registry` is the single table every surface derives
 * from and it imports nothing, so counting it here costs the page nothing and
 * cannot go stale.
 */
const mcpToolCount = XRIFT_MCP_TOOL_NAMES.length;

export const aiPoints = [
  {
    icon: Bot,
    title: "会話でシーンを編集",
    text: "Codex、Claude Code、OpenCodeをワンクリックで登録。いま開いているシーンを読み取って、配置から見た目の調整まで任せられます。",
  },
  {
    icon: Blocks,
    title: `${mcpToolCount}のツールで動く`,
    text: "地形を彫る、Prefabを置く、Materialを変える、Scriptを書く。エディターでできる操作を、AIからも呼び出せます。",
  },
  {
    icon: ShieldCheck,
    title: "任せても、戻せる",
    text: "AIが変えた分も、いつものUndoと自動保存の対象です。Scriptは中身を読んで承認するまで実行されません。",
  },
] as const;

export const faqs = [
  {
    question: "XRift Studioで、何が作れますか？",
    answer:
      "XRiftで遊べる「ワールド」と、ワールドをまたいで持ち歩ける「アイテム」の両方を作れます。新しく作るときに、どちらかを選びます。",
  },
  {
    question: "地形や水、空も作れますか？",
    answer:
      "作れます。ブラシで地形を彫って草を生やし、波の立つ水面を張り、空はプリセットから選びます。どれも別のツールを使わず、この中で完結します。",
  },
  {
    question: "コードが書けなくても使えますか？",
    answer:
      "はい。画面での制作なら、素材の取り込み、配置、調整、プレイ、公開まで進められます。コードで作りたい人向けのクラシック制作も同じアプリにあります。",
  },
  {
    question: "AIに手伝ってもらえると聞きました。",
    answer:
      "CodexやClaude Codeなどを登録すると、開いているシーンを会話から編集できます。変更はいつものUndoと自動保存の対象になり、Scriptは承認するまで実行されません。",
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
      "はい。Windows・macOS・Linuxに対応しています。このページのダウンロードボタンは、見ているパソコンに合うインストーラーをそのまま保存します。他のOSや形式もダウンロードの欄から選べます。",
  },
  {
    question: "ダウンロードしたら「WindowsによってPCが保護されました」と出ました。",
    answer:
      "コード署名を付けずに配布しているため、Windowsが初めて見るアプリとして警告を出します。「詳細情報」を押すと「実行」を選べます。ファイルの配布元はGitHubのリリースで、ページにはファイル名とSHA-256を表示しているので、保存したファイルと照合できます。",
  },
] as const;

/**
 * What happens after the file is saved.
 *
 * The warning steps are the reason this section exists. The app is shipped
 * without code signing, so Windows shows SmartScreen and macOS refuses the
 * first double click — and a person who has just downloaded an unfamiliar
 * `.exe` reads that as "this was a mistake". Saying it up front, before it
 * happens, is the difference between a warning and a scare.
 */
export const downloadSteps = {
  windows: [
    "保存した .exe ファイルを開きます。",
    "「WindowsによってPCが保護されました」と表示されたら、「詳細情報」を押して「実行」を選びます。コード署名を付けていない配布のため、Windowsが初めて見るアプリとして警告します。",
    "インストールが終わると、スタートメニューからXRift Studioを起動できます。",
  ],
  macos: [
    "保存した .dmg を開き、XRift Studioをアプリケーションフォルダへドラッグします。",
    "初回だけ、アプリを右クリックして「開く」を選びます。ダブルクリックでは「開発元を確認できません」と表示されます。",
    "次回からは、通常どおりLaunchpadやDockから起動できます。",
  ],
  linux: [
    "AppImageを選んだ場合は、実行権限を付けます（chmod +x でファイルを実行可能にします）。",
    "ファイルを実行します。.deb や .rpm を選んだ場合は、お使いのパッケージマネージャーでインストールします。",
    "起動後の使い方は、どの形式でも同じです。",
  ],
} as const;
