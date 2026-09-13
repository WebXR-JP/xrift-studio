import { Box, Mountain, Workflow } from "lucide-react";
import { XRIFT_STUDIO_REPOSITORY_URL } from "../lib/support-links";

export const repositoryUrl = XRIFT_STUDIO_REPOSITORY_URL;
export const editorUrl = `${import.meta.env.BASE_URL}editor.html`;
export type ProjectKind = "world" | "item";

export const editorFeatures = [
  {
    icon: Mountain,
    title: "地形・空・水",
    text: "ブラシで地面に起伏をつけ、草を生やす。Skyboxや水面のプリセットを選んで、景色を組み立てられます。",
    formats: "地形ブラシ / Skybox / Water Shader",
  },
  {
    icon: Box,
    title: "3Dモデルと質感",
    text: "モデルを配置し、色やRoughness、透明感を調整。テクスチャやHDRIも追加できます。",
    formats: "GLB / glTF / VRM / 画像 / HDRI",
  },
  {
    icon: Workflow,
    title: "動きと音",
    text: "スイッチで動くしかけや音を組み込み、Playで確認。BGMや、距離に応じて聞こえ方が変わる音も設定できます。",
    formats: "Components / Interactivity / Audio Source",
  },
] as const;

export const faqs = [
  {
    question: "無料で使えますか？",
    answer: "XRift Studioは無料のオープンソースソフトウェアです。ソースコードはMIT Licenseで公開しています。連携するAIサービスの利用料金は、それぞれのサービスに従います。",
  },
  {
    question: "iPadやスマートフォンでも編集できますか？",
    answer: "ブラウザ版βをインストール不要で試せます。Hierarchy、Assets、Inspectorを切り替えながらタッチで操作できますが、本格的な制作には画面が広く、すべての機能を使えるデスクトップ版をおすすめします。",
  },
  {
    question: "ブラウザで編集したプロジェクトはどこに保存されますか？",
    answer: "使っている端末のブラウザ内へ自動保存されます。ブラウザのデータを削除するとプロジェクトも消えるため、「プロジェクトを書き出す」で.xriftstudioファイルを残しておけます。別の端末へ移すときも、このファイルを使います。",
  },
  {
    question: "エディターのURLを共有すると、プロジェクトも共有されますか？",
    answer: "URLで共有できるのはエディターの入口です。編集内容は共有されません。プロジェクトを渡すには、.xriftstudioファイルを書き出して送ってください。",
  },
  {
    question: "ブラウザからXRiftへ公開できますか？",
    answer: "XRiftへの公開はデスクトップ版で行います。ブラウザ版でプロジェクトを書き出し、Windows・macOS・Linuxのデスクトップ版で開いて公開できます。",
  },
  {
    question: "コードを書かずに作れますか？",
    answer: "モデルの配置、質感や照明の調整は画面上で操作できます。動きや音を付けるにはComponentsやInteractivityを使います。デスクトップ版では、コードエディターやAIとの連携も利用できます。",
  },
] as const;

export const downloadSteps = {
  windows: [
    "ダウンロードした.exeファイルを開き、画面に沿ってインストールします。",
    "スタートメニューからXRift Studioを起動します。",
  ],
  macos: [
    "ダウンロードした.dmgファイルを開き、XRift Studioをアプリケーションフォルダーへ移します。",
    "アプリケーションフォルダーからXRift Studioを起動します。",
  ],
  linux: [
    "AppImageは実行権限を付けてから開きます。.debや.rpmはパッケージマネージャーでインストールします。",
    "インストールしたXRift Studioを起動します。",
  ],
} as const;
