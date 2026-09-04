import { BUILTIN_PREFAB_RECIPES } from "./builtin-prefab-catalog";
import { getXriftComponentDefinition, XRIFT_COMPONENT_SCHEMA_IDS } from "./component-registry";
import type { VisualProjectKind } from "./project-document";
import type { SceneDocument, SceneEntity } from "./scene-document";

type WorldComponentGuidance = {
  purpose: string;
  selection: string;
  placement: string[];
  verification: string[];
};

// Shared by discovery, placement responses and persistent authoring resume.
// These are design decisions to review, not a layout inferred from entity names.
const GUIDANCE: Record<string, WorldComponentGuidance> = {
  [XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay]: {
    purpose: "画面を見せながら会話する・共同作業する・発表する",
    selection: "交流・共同作業・発表のワールドでは最初に検討する。採用するか、用途に合わず省くかを設計図に残す。動画URLの再生にはVideoScreen等を使い、画面共有の代わりにしない。",
    placement: [
      "客席・立ち見の範囲と発表者の位置を先に決め、表示面を観客へ向ける。前列・後列・端の目線から読める高さと幅を選ぶ。",
      "共有を始める人が操作する場所を確保し、入室から客席への通路が画面の前を横切らないようにする。",
      "壁や自立フレームに収め、表示面と操作UIを装飾で隠さない。共有映像の縦横比が変わっても床・天井・枠と重ならない余白を取る。",
    ],
    verification: [
      "観客の前列・後列・端と操作位置からcapture_scene_viewを撮り、表示面の向き、文字の見やすさ、遮蔽物、通路を確認する。",
      "対応する実行環境で共有開始・表示・停止を確認する。別の参加者への配信は複数クライアントで確認し、Editの待機画面だけで共有成功としない。未検証の項目は残す。",
    ],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.mirror]: {
    purpose: "アバターの確認・鏡の前での交流や撮影",
    selection: "アバターを見る体験があるときに選ぶ。景観だけのワールドへ一律に追加しない。",
    placement: [
      "鏡の前に複数人が立てる場所を確保し、反射面をその場所へ向ける。入口・客席・画面共有の視線から外す。",
      "壁やフレームと反射面を重ねず、周囲の素材と余白を揃える。向かい合わせの鏡や不要な大面積を避け、必要な見える範囲でサイズを決める。",
    ],
    verification: [
      "利用位置でアバターを確認できるか実行環境で確かめる。反射の向き・切れ・周囲との収まりを撮影し、metricsで描画負荷を確認する。",
    ],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.tagBoard]: {
    purpose: "イベント受付で参加者が役割・興味などのタグを選ぶ",
    selection: "タグ選択が必要な交流会やイベントで使う。現行の公式ComponentはTagBoardであり、任意の場所を示すTagMarkerとして扱わない。",
    placement: [
      "スポーンから見つけられる受付脇へ置き、立ち止まる場所と待機列を入口・退出路から離す。参加者へボードを向ける。",
      "title・tags・columnsをイベントに合わせ、読めて選べる大きさにする。ボードごとのinstanceStateKeyを確認する。",
    ],
    verification: [
      "入室時に見つけられるか、利用位置からラベルを読めるか撮影する。実行環境でタグ選択と状態反映を確認し、表示だけで完了にしない。",
    ],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint]: {
    purpose: "入室して目的の場所へ向かう",
    selection: "訪問者が最初に見るものと、受付・客席への移動を設計する。既存スポーンを確認してから配置する。",
    placement: ["安全な床面へ置き、主な体験や案内へ向ける。スクリーン・鏡・受付の利用場所や待機列の中へ出現させない。"],
    verification: ["スポーンの目の高さで撮影し、進む方向が分かるか、床とColliderが移動を支えるかPlayで確認する。"],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.entryLogBoard]: {
    purpose: "イベント会場で入退室の履歴を確認する",
    selection: "運営や参加者が入退室履歴を見る必要がある場合に選ぶ。受付のタグ選択にはTagBoardを使う。",
    placement: ["受付脇など立ち止まって読める場所へ向け、待機列と通路を塞がない。ボードごとのstateNamespaceを確認する。"],
    verification: ["利用位置から読めるか撮影し、対応する実行環境で参加者の入退室が反映されるか確認する。"],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.videoScreen]: {
    purpose: "動画URLの映像を一緒に鑑賞する",
    selection: "動画鑑賞なら選ぶ。デスクトップ等のライブ画面共有にはScreenShareDisplayを選ぶ。操作UI付き動画はVideoPlayer、ライブ配信URLはLiveVideoPlayerも検討する。",
    placement: ["観客へ表示面を向け、前列・後列・端から見える寸法と通路を確保する。音が他の会話場所を妨げない配置にする。"],
    verification: ["視線と遮蔽物を撮影し、実行環境でURL・再生・音量・必要な同期を確認する。"],
  },
  [XRIFT_COMPONENT_SCHEMA_IDS.portal]: {
    purpose: "別のワールドへ移動する",
    selection: "会場間の移動など、行き先が決まっている場合に選ぶ。",
    placement: ["行き先が分かる案内とともに動線の先へ置き、スポーンや受付に重ねない。"],
    verification: ["行き先の設定と入口の見つけやすさを確認する。実際の遷移を確認していない場合は未検証と記録する。"],
  },
};

export function getWorldComponentGuidance(schemaId: string) {
  const guidance = GUIDANCE[schemaId];
  if (!guidance) return null;
  const definition = getXriftComponentDefinition(schemaId);
  const recipe = BUILTIN_PREFAB_RECIPES.find(candidate => candidate.schemaId === schemaId);
  if (!definition || !recipe) return null;
  return {
    schemaId,
    definitionId: definition.schemaId,
    componentName: definition.importName,
    recipeId: recipe.id,
    ...guidance,
    fields: definition.fields,
    prefabEditablePropertyNames: recipe.editablePropertyNames,
    authoring: "place_builtin_prefabで公式部品を配置し、get_entity_componentsでComponentとTransformを確認する。位置・回転・大きさはupdate_transformで調整する。Prefabの保護された寸法等を個別指定する場合はcreate_empty_entityとadd_componentで通常のComponentを作り、update_componentのpatch.propertiesで設定する。TransformとComponentのposition/rotationを二重に適用しない。",
  };
}

export function getWorldComponentAuthoring(scene: SceneDocument, projectKind: VisualProjectKind) {
  if (projectKind !== "world") return null;
  const effectiveEnabled = (entityId: string): boolean => {
    const visited = new Set<string>();
    let currentId: string | null = entityId;
    while (currentId !== null) {
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const entity: SceneEntity | undefined = scene.entities[currentId];
      if (!entity || !entity.enabled) return false;
      currentId = entity.parentId;
    }
    return true;
  };
  const components = Object.keys(GUIDANCE).map(schemaId => ({
    ...getWorldComponentGuidance(schemaId)!,
    instances: Object.values(scene.entities).flatMap(entity => entity.components.flatMap(component =>
      component.type === "xrift-component" && component.schemaId === schemaId
        ? [{ entityId: entity.id, componentId: component.id, entityName: entity.name,
          enabled: component.enabled && effectiveEnabled(entity.id) }]
        : [])),
  }));
  return {
    planning: "誰が何をするか、画面共有の採用/省略と理由、必要な設備、観客・操作・移動の場所、配置と動作の完成条件をbegin_world_authoringのblueprintとcriteriaに保存する。設備と利用場所を飾り付けより先に確保する。",
    components,
    screenShareDecision: components.find(component => component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay)!
      .instances.some(instance => instance.enabled)
      ? "有効なScreenShareDisplayがある。既存設備を確認し、重複追加より先に向き・寸法・利用場所を調整する。"
      : "有効なScreenShareDisplayが文書内に見つからない。交流・共同作業・発表に必要なら配置し、省く場合は用途に基づく理由を設計図へ残す。",
    evidenceLimit: "instancesはSceneDocument内の公式Componentの一覧。未展開PrefabやScript内の描画は含まない。存在だけでは配置品質や共有・同期の動作を証明しない。利用視点の画像と実行環境で確認し、未検証項目を報告する。",
    tools: ["get_entity_components", "place_builtin_prefab", "update_transform", "capture_scene_view"],
  };
}
