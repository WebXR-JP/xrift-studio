import { Box, Mountain, Workflow } from "lucide-react";
import { XRIFT_STUDIO_REPOSITORY_URL } from "../lib/support-links";

export const repositoryUrl = XRIFT_STUDIO_REPOSITORY_URL;
export const editorUrl = `${import.meta.env.BASE_URL}editor.html`;
export type ProjectKind = "world" | "item";

export const editorFeatures = [
  {
    icon: Mountain,
    title: "地形・空・水",
    text: "地形ブラシで起伏をつけ、草を配置できます。空と水面はプリセットから選び、ワールドに合う景色に調整できます。",
    formats: "地形ブラシ / Skybox / Water Shader",
  },
  {
    icon: Box,
    title: "3Dモデルと質感",
    text: "3Dモデルを配置し、色や表面の粗さ、透明度を調整できます。画像を質感に使ったり、HDRIで照明や反射を設定したりできます。",
    formats: "GLB / glTF / VRM / 画像 / HDRI",
  },
  {
    icon: Workflow,
    title: "動きと音",
    text: "スイッチで動く仕掛けや音を設定し、Playで動作を確認できます。BGMのほか、音源からの距離で音量が変わる音も使えます。",
    formats: "Components / Interactivity / Audio Source",
  },
] as const;

export const faqs = [
  {
    question: "無料で使えますか？",
    answer: "XRift Studioは無料で使えます。ソースコードもMIT Licenseで公開しています。連携するAIサービスの料金は、接続先のサービスで確認してください。",
  },
  {
    question: "iPadやスマートフォンでも編集できますか？",
    answer: "ブラウザ版βで編集できます。インストールは不要です。Hierarchy、Assets、Inspectorを切り替え、タッチで操作してください。AIとの連携やコード編集も使う場合はデスクトップ版を利用できます。",
  },
  {
    question: "ブラウザで編集したプロジェクトはどこに保存されますか？",
    answer: "編集内容は使っているブラウザに自動保存されます。ブラウザのデータを削除するとプロジェクトも消えます。「プロジェクトを書き出す」で.xriftstudioファイルを保存してください。このファイルで別の端末へ移すこともできます。",
  },
  {
    question: "エディターのURLを共有すると、プロジェクトも共有されますか？",
    answer: "エディターのURLには編集内容が含まれません。プロジェクトを共有するには、.xriftstudioファイルを書き出して相手に渡してください。",
  },
  {
    question: "ブラウザからXRiftへ公開できますか？",
    answer: "ブラウザ版βではワールドを送信できます。XRiftの設定画面で、write:worlds権限を付けたAPIキーを発行してください。アイテムやスクリプトを含むワールドは、プロジェクトを書き出してデスクトップ版から公開できます。",
  },
  {
    question: "コードを書かずに作れますか？",
    answer: "モデルの配置、質感や照明の調整は画面上で行えます。動きや音はComponentsやInteractivityで設定してください。デスクトップ版ではコード編集やAIとの連携も使えます。",
  },
] as const;

export const downloadSteps = {
  windows: [
    "ダウンロードした.exeファイルを開き、画面の案内に従ってインストールしてください。",
    "スタートメニューからXRift Studioを起動してください。",
  ],
  macos: [
    "ダウンロードした.dmgファイルを開き、XRift Studioをアプリケーションフォルダーへ移してください。",
    "アプリケーションフォルダーからXRift Studioを起動してください。",
  ],
  linux: [
    "AppImageは実行権限を付けてから開いてください。.debや.rpmはパッケージマネージャーでインストールしてください。",
    "インストールしたXRift Studioを起動してください。",
  ],
} as const;
