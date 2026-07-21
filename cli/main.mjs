import packageMetadata from "../package.json";
import { pathToFileURL } from "node:url";
import {
  ConvertError,
  convertVisualProject,
  defaultOutputPathForSource,
} from "./convert.mjs";

export async function runCli(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(helpText());
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${packageMetadata.version}\n`);
    return 0;
  }
  if (argv[0] !== "convert") {
    process.stderr.write(`不明なコマンドです: ${argv[0]}\n\n${helpText()}`);
    return 2;
  }

  try {
    const options = parseConvertArguments(argv.slice(1));
    const jsonOutput = options.format === "json";
    const report = await convertVisualProject({
      ...options,
      cliVersion: packageMetadata.version,
      onProgress: jsonOutput
        ? undefined
        : (message) => {
            if (message) process.stderr.write(`${message}\n`);
          },
    });
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatTextReport(report));
    }
    return report.status === "blocked" ? 1 : 0;
  } catch (error) {
    if (error instanceof ConvertError) {
      process.stderr.write(`convertを完了できませんでした [${error.code}]\n${error.message}\n`);
      for (const detail of error.details) {
        process.stderr.write(`- ${detail.fieldPath ?? detail.code}: ${detail.message}\n`);
      }
      return error.code.startsWith("usage-") ? 2 : 1;
    }
    process.stderr.write(
      `convertを完了できませんでした\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

function parseConvertArguments(args) {
  let source;
  let out;
  let to;
  let dryRun = false;
  let update = false;
  let format = "text";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--to" || argument === "--out" || argument === "--format") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new ConvertError(
          "usage-option-value",
          `${argument}には値が必要です`,
        );
      }
      if (argument === "--to") to = value;
      if (argument === "--out") out = value;
      if (argument === "--format") format = value;
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--update") {
      update = true;
    } else if (argument.startsWith("-")) {
      throw new ConvertError(
        "usage-option-unknown",
        `未対応のoptionです: ${argument}`,
      );
    } else if (!source) {
      source = argument;
    } else {
      throw new ConvertError(
        "usage-argument-extra",
        `余分な引数があります: ${argument}`,
      );
    }
  }
  if (!source) {
    throw new ConvertError(
      "usage-source-required",
      "convertにはVisual Projectの入力フォルダが必要です",
    );
  }
  if (to !== "classic") {
    throw new ConvertError(
      "usage-target-required",
      "--to classicを指定してください",
    );
  }
  if (format !== "text" && format !== "json") {
    throw new ConvertError(
      "usage-format-invalid",
      "--formatはtextまたはjsonを指定してください",
    );
  }
  return {
    source,
    out: out ?? defaultOutputPathForSource(source),
    dryRun,
    update,
    format,
  };
}

function formatTextReport(report) {
  const lines = [];
  if (report.status === "blocked") {
    lines.push("Classic Projectへ書き出せません");
  } else if (report.status === "ready") {
    lines.push("dry-run: Classic Projectへ書き出せます");
  } else {
    lines.push("Classic Projectへの書き出しが完了しました");
  }
  lines.push(`target: ${report.targetKind}`);
  lines.push(`output: ${report.outputRoot}`);
  lines.push(`compiler: ${report.compilerVersion}`);
  const warnings = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const blockers = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  if (blockers.length > 0) {
    lines.push("", `blocking errors (${blockers.length})`);
    for (const diagnostic of blockers) {
      lines.push(`- [${diagnostic.code}] ${diagnostic.message}`);
    }
  }
  if (warnings.length > 0) {
    lines.push("", `warnings (${warnings.length})`);
    for (const diagnostic of warnings) {
      lines.push(`- [${diagnostic.code}] ${diagnostic.message}`);
    }
  }
  if (report.status === "succeeded") {
    lines.push("", "次の操作", `cd ${quotePath(report.outputRoot)}`, "npm install");
  }
  return `${lines.join("\n")}\n`;
}

function quotePath(value) {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function helpText() {
  return `XRift Studio CLI ${packageMetadata.version}

Usage:
  xrift-studio convert <visual-project> --to classic --out <directory> [options]

Options:
  --dry-run       書き込まずに診断と生成予定を表示する
  --update        同じVisual Projectから生成した未改変exportを更新する
  --format <type> textまたはjsonで結果を表示する
  -h, --help      ヘルプを表示する
  -v, --version   バージョンを表示する

Examples:
  npx xrift-studio convert ../my-visual-world --to classic --out .
  npx xrift-studio convert ../my-visual-world --to classic --out ./classic-world --dry-run
  npx xrift-studio convert ../my-visual-world --to classic --out ./classic-world --update
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli();
}
