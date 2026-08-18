#!/usr/bin/env node
// 新しいリリース動画プロジェクトを作る。
//
//   node _kit/scripts/new-promo.mjs --slug terrain-brush --title "地形ブラシを追加しました"
//   node _kit/scripts/new-promo.mjs --slug xxx --bed drive-128 --version 0.9.0 --from v0.8.0 --to HEAD
//
// テンプレートを写して storyboard の穴を埋め、音素材を配るところまで行う。
// 台本の承認前にレンダリングしないよう、scriptApproval は pending のままにする。
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, "..");
const ROOT = resolve(KIT, "..");
const TEMPLATE = join(KIT, "template");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const slug = flag("slug");
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error("--slug は英小文字・数字・ハイフンで指定してください。例: --slug terrain-brush");
  process.exit(1);
}

const repoPackage = (() => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "..", "..", "package.json"), "utf8"));
  } catch {
    return {};
  }
})();

const title = flag("title", "ここに更新の見出しを書く");
const version = flag("version", repoPackage.version ?? "");
const bed = flag("bed", "bright-120");
const from = flag("from", "");
const to = flag("to", "HEAD");

const dest = join(ROOT, slug);
if (existsSync(dest)) {
  console.error(`すでに存在します: ${dest}`);
  process.exit(1);
}

const substitute = (text) =>
  text
    .replaceAll("__SLUG__", slug)
    .replaceAll("__TITLE__", title)
    .replaceAll("__VERSION__", version)
    .replaceAll("__FROM__", from)
    .replaceAll("__TO__", to);

mkdirSync(join(dest, "src"), { recursive: true });
mkdirSync(join(dest, "public", "source"), { recursive: true });
mkdirSync(join(dest, "out"), { recursive: true });

for (const file of ["package.json", "storyboard.json"]) {
  writeFileSync(join(dest, file), substitute(readFileSync(join(TEMPLATE, file), "utf8")));
}
copyFileSync(join(TEMPLATE, "tsconfig.json"), join(dest, "tsconfig.json"));
copyFileSync(join(TEMPLATE, "gitignore"), join(dest, ".gitignore"));
cpSync(join(TEMPLATE, "src"), join(dest, "src"), { recursive: true });

// storyboard の BGM を指定に合わせる。
const storyboardPath = join(dest, "storyboard.json");
const storyboard = JSON.parse(readFileSync(storyboardPath, "utf8"));
storyboard.music.bed = bed;
if (!version) {
  delete storyboard.version;
  for (const scene of storyboard.scenes) delete scene.version;
}
writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);

const run = (script, extra = []) => {
  const r = spawnSync(process.execPath, [join(HERE, script), ...extra], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("gen-audio.mjs");
run("sync-assets.mjs", ["--project", dest]);

console.log(`
作成しました: dev/release-promo/${slug}

次の手順:
  1. 差分の抽出        node ../../.agents/skills/xrift-release-promo-video/scripts/extract-release-diff.mjs --from <tag> --to HEAD --output ${slug}/diff.json
  2. 実画面の収録      public/source/ に置く。素材側のカーソルは入れない。
  3. 台本の作成と承認  storyboard.json を埋め、scriptApproval.status を approved にしてから実装へ進む
  4. プレビュー        cd ${slug} && npm run studio
  5. 書き出し          npm run render      （縦型は npm run render:vertical）
`);
