import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/lib/visual-editor/world-authoring-guide.json");
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("使い方: node scripts/generate-authoring-skill.mjs [--check]");
}

const guide = JSON.parse(await readFile(sourcePath, "utf8"));
const text = (value) => typeof value === "string" && value.trim().length > 0;
if (
  guide.version !== 1 ||
  !Array.isArray(guide.core) || !guide.core.length || !guide.core.every(text) ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.skill?.name ?? "") ||
  guide.skill.name.length > 64 || !text(guide.skill.description) ||
  Object.keys(guide.routes ?? {}).sort().join(",") !== "assets,blender,r3f" ||
  !Object.values(guide.routes).every((route) => text(route.summary) &&
    Array.isArray(route.instructions) && route.instructions.length > 0 && route.instructions.every(text)) ||
  Object.keys(guide.design ?? {}).sort().join(",") !== "environment,spatial-ui" ||
  !Object.values(guide.design).every((topic) => text(topic.summary) &&
    Array.isArray(topic.instructions) && topic.instructions.length > 0 && topic.instructions.every(text)) ||
  !text(guide.design["spatial-ui"].exampleSource)
) {
  throw new Error("world-authoring-guide.jsonの形式が未対応か、必要な内容が不足しています。");
}

const code = (value) => "`" + value + "`";
const content = `---
name: ${guide.skill.name}
description: ${JSON.stringify(guide.skill.description)}
---

<!-- scripts/generate-authoring-skill.mjsで生成。変更は共通ガイドの正本に加え、再生成してください。 -->

# XRift Studioで制作する

最初に${code("list_projects")}と現在のSceneを確認する。接続中のStudioから${code("get_world_authoring_guide")}で最新の制作ガイドを取得できる。${code('topic: "overview"')}で利用できる制作方法を確認し、${Object.keys(guide.routes).map(code).join("、")}のうち、実際に使う方法の詳細だけを読む。

${guide.core.map((instruction) => `- ${instruction}`).join("\n\n")}

設計のtopicは必要なものだけを取得する。${Object.entries(guide.design).map(([name, topic]) => `${code(name)}: ${topic.summary}`).join(" ")}

静的ソースを保存して制作する場合は、${code("apply_r3f_scene")}で原本を所有するルートを作成・更新する。修正前に${code("get_entity_components")}でそのルートを読み、完全な${code("r3fAuthoring.source")}を使う。一般のComponentコード取り込みでは、保存された原本を更新できない。対応する操作と制限は、ツールのスキーマと返された機能情報で確認する。

ワールド全体の制作では、${code("get_world_authoring")}で作業を再開するか、${code("begin_world_authoring")}で設計内容と完成条件を保存する。書き込みには現在のrevisionを使う。保存した結果をスポーン視点（spawn）と斜め上からの俯瞰（iso）で撮影し、${code("review_world_authoring")}で完成条件を一つずつ確認・記録して、${code("complete_world_authoring")}で終える。小さな直接編集では、ワールド全体の制作手順を始める必要はない。

[共通ガイド](../../../src/lib/visual-editor/world-authoring-guide.json)から、Studio ChatGPT・MCP・このスキルへ同じ基本方針を渡す。制作方法の詳細は必要に応じて取得し、作業前にすべての方法を読まない。
`;

let stale = false;
for (const directory of [".agents/skills", ".claude/skills"]) {
  const destination = path.join(root, directory, guide.skill.name, "SKILL.md");
  if (check) {
    let existing;
    try { existing = await readFile(destination, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing !== content) {
      console.error(`制作スキルの再生成が必要です: ${path.relative(root, destination)}`);
      stale = true;
    }
  } else {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    console.log(`生成しました: ${path.relative(root, destination)}`);
  }
}
if (stale) process.exitCode = 1;
else if (check) console.log("制作スキルと共通ガイドが一致しています。");
