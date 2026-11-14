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
  Object.keys(guide.design ?? {}).sort().join(",") !== "environment,model-quality,refinement,spatial-ui" ||
  !Object.values(guide.design).every((topic) => text(topic.summary) &&
    Array.isArray(topic.instructions) && topic.instructions.length > 0 && topic.instructions.every(text)) ||
  !text(guide.design["spatial-ui"].exampleSource)
) {
  throw new Error("world-authoring-guide.jsonの形式が未対応か、必要な内容が不足しています。");
}

const code = (value) => "`" + value + "`";
// 各項目の最初の文を、その手順の見出しとして強調する。句点は強調の外へ置く。
// 強調の閉じ記号が句点の直後・文字の直前に来ると、Markdownの強調として解釈されない。
const step = (instruction, index) => {
  const end = instruction.indexOf("。");
  const body = end < 0 ? `**${instruction}**` : `**${instruction.slice(0, end)}**${instruction.slice(end)}`;
  return `${index + 1}. ${body}`;
};
const steps = (instructions) => instructions.map(step).join("\n\n");
// 品質を上げる手順は、接続先から取得しなくても読めるように全文を収録する。
const embedded = [
  ["refinement", "既にあるものの品質を上げる"],
  ["model-quality", "3Dモデルを作る・直す"],
];
const embeddedNames = new Set(embedded.map(([name]) => name));
const sections = embedded.map(([name, heading]) => `## ${heading}

${guide.design[name].summary}${code("get_world_authoring_guide")}の${code(`topic: "${name}"`)}と同じ内容。

${steps(guide.design[name].instructions)}`).join("\n\n");
const topics = [
  ...Object.entries(guide.routes).map(([name, route]) => `- ${code(name)}（制作方法）: ${route.summary}`),
  ...Object.entries(guide.design).filter(([name]) => !embeddedNames.has(name))
    .map(([name, topic]) => `- ${code(name)}（設計）: ${topic.summary}`),
];
const content = `---
name: ${guide.skill.name}
description: ${JSON.stringify(guide.skill.description)}
---

<!-- scripts/generate-authoring-skill.mjsで生成。変更は共通ガイドの正本に加え、再生成してください。 -->

# XRift Studioでワールドと3Dモデルを制作する

最初に${code("list_projects")}と現在のSceneを確認する。接続中のStudioからは${code("get_world_authoring_guide")}で最新の制作ガイドを取得できる。この文書には、その基本方針と、品質を上げる手順を収録している。

## 進め方

${steps(guide.core)}

${sections}

## 必要なときに読むガイド

${code("get_world_authoring_guide")}のtopicは、使うものだけを取得する。作業前にすべてを読まない。

${topics.join("\n")}

## Studioでの制作と確認

静的ソースを保存して制作する場合は、${code("apply_r3f_scene")}で原本を所有するルートを作成・更新する。修正前に${code("get_entity_components")}でそのルートを読み、完全な${code("r3fAuthoring.source")}を使う。一般のComponentコード取り込みでは、保存された原本を更新できない。対応する操作と制限は、ツールのスキーマと返された機能情報で確認する。

ワールド全体の制作では、${code("get_world_authoring")}で作業を再開するか、${code("begin_world_authoring")}で設計内容と完成条件を保存する。書き込みには現在のrevisionを使う。保存した結果をスポーン視点（spawn）と斜め上からの俯瞰（iso）で撮影し、${code("review_world_authoring")}で完成条件を一つずつ確認・記録して、${code("complete_world_authoring")}で終える。小さな直接編集では、ワールド全体の制作手順を始める必要はない。

[共通ガイド](../../../src/lib/visual-editor/world-authoring-guide.json)から、Studio ChatGPT・MCP・このスキルへ同じ基本方針を渡す。
`;

let stale = false;
for (const directory of [".agents/skills", ".claude/skills"]) {
  const destination = path.join(root, directory, guide.skill.name, "SKILL.md");
  if (check) {
    let existing;
    try { existing = await readFile(destination, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    // 作業コピーの改行コードがCRLFでも、内容が同じなら一致として扱う。
    if (existing?.replace(/\r\n/g, "\n") !== content) {
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
