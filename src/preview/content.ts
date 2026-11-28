import { Box, Mountain, Workflow } from "lucide-react";
import { XRIFT_STUDIO_REPOSITORY_URL } from "../lib/support-links";

export const repositoryUrl = XRIFT_STUDIO_REPOSITORY_URL;
export const editorUrl = `${import.meta.env.BASE_URL}editor.html`;
export type ProjectKind = "world" | "item";

export const editorFeatures = [
  {
    icon: Mountain,
    title: "地形・空・水",
    text: "地形ブラシで起伏をつけたり草を生やしたりして、空や水面もプリセットから選んでワールドに合う景色へ仕上げられます。",
    formats: "地形ブラシ / Skybox / Water Shader",
  },
  {
    icon: Box,
    title: "3Dモデルと質感",
    text: "3Dモデルを配置して色や表面の粗さ、透明度を調整できるほか、画像を質感に使ったり、HDRIで照明や反射を整えたりできます。",
    formats: "GLB / glTF / VRM / 画像 / HDRI",
  },
  {
    icon: Workflow,
    title: "動きと音",
    text: "スイッチで動く仕掛けや音を設定し、Playで実際の動きを確かめられます。BGMだけでなく、音源からの距離で音量が変わる音も扱えます。",
    formats: "Components / Interactivity / Audio Source",
  },
] as const;

export const faqs = [
  {
    question: "無料で使えますか？",
    answer: "無料で利用でき、ソースコードもMIT Licenseで公開しています。連携するAIサービスの利用料金については、接続先のサービスでご確認ください。",
  },
  {
    question: "iPadやスマートフォンでも編集できますか？",
    answer: "インストール不要のブラウザ版βから編集できます。画面上でHierarchy、Assets、Inspectorを切り替えながらタッチで操作できます。AIとの連携やコード編集も使いたい場合は、デスクトップ版をご利用ください。",
  },
  {
    question: "ブラウザで編集したプロジェクトはどこに保存されますか？",
    answer: "編集内容はご利用のブラウザに自動保存されるため、ブラウザのデータを削除するとプロジェクトも消えてしまいます。バックアップや別端末への引き継ぎには、「プロジェクトを書き出す」から.xriftstudioファイルを保存してお使いください。",
  },
  {
    question: "エディターのURLを共有すると、プロジェクトも共有されますか？",
    answer: "いいえ、エディターのURLに編集内容は含まれません。プロジェクトを共有したいときは、.xriftstudioファイルを書き出して相手に渡してください。",
  },
  {
    question: "ブラウザからXRiftへ公開できますか？",
    answer: "ブラウザ版βからもワールドとアイテムを公開できます。あらかじめXRiftの設定画面で、ワールド用のwrite:worlds権限、またはアイテム用のwrite:items権限を付けたAPIキーを発行して入力してください。なお、スクリプトを含む作品は、プロジェクトを書き出したうえでデスクトップ版から公開してください。",
  },
  {
    question: "コードを書かずに作れますか？",
    answer: "はい、モデルの配置から質感・照明の調整まで画面上で完結します。動きや音もComponentsやInteractivityで組み込めます。さらにこだわりたいときは、デスクトップ版でコード編集やAIとの連携も使えます。",
  },
] as const;

export const downloadSteps = {
  windows: [
    "ダウンロードした.exeファイルを開き、画面の案内に従ってインストールしてください。",
    "インストールが終わったら、スタートメニューからXRift Studioを起動します。",
  ],
  macos: [
    "ダウンロードした.dmgファイルを開き、XRift Studioをアプリケーションフォルダーへドラッグします。",
    "アプリケーションフォルダーからXRift Studioを起動します。",
  ],
  linux: [
    "AppImageは実行権限を付けてから開き、.debや.rpmはパッケージマネージャーでインストールしてください。",
    "インストール後、XRift Studioを起動します。",
  ],
} as const;
