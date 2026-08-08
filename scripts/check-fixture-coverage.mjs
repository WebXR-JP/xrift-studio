// Fails when a fixture entry point exists but no one runs it.
//
// Fixture suites are plain exported functions, so a suite that is never added to
// the runner still typechecks, still builds, and still looks like coverage when
// someone reads the file.  Half of this repository's suites had drifted into
// that state before this check existed.  Registering a suite is what makes it
// coverage, so an unregistered suite is reported as a failure here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED_DIRECTORIES = ["src", "packages"];
const RUNNER_RELATIVE_PATH = path.join("cli", "convert.fixture.mjs");

/** Matches an exported fixture entry point such as `export function runTerrainFixtureAssertions()`. */
const ENTRY_POINT_PATTERN =
  /export\s+(?:async\s+)?function\s+(run[A-Za-z0-9_]*(?:Fixture|Fixtures|FixtureAssertions|Assertions))\s*\(/g;

/** Matches a `["label", runSomethingFixture]` row of the runner's suite table. */
const SUITE_TABLE_ROW_PATTERN = /,\s*(run[A-Za-z0-9_]*)\s*\]/g;

function collectSourceFiles(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(entryPath, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(entryPath);
  }
  return found;
}

function findDeclaredEntryPoints() {
  const declared = new Map();
  for (const directory of SCANNED_DIRECTORIES) {
    const absolute = path.join(repoRoot, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const file of collectSourceFiles(absolute)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(ENTRY_POINT_PATTERN)) {
        declared.set(match[1], path.relative(repoRoot, file).replace(/\\/g, "/"));
      }
    }
  }
  return declared;
}

function findRegisteredSuites() {
  const runner = fs.readFileSync(path.join(repoRoot, RUNNER_RELATIVE_PATH), "utf8");
  const table = runner.match(/runFixtureSuites\(\[([\s\S]*?)\n\s*\]\)/);
  if (!table) {
    throw new Error(
      `${RUNNER_RELATIVE_PATH} no longer contains a runFixtureSuites([...]) table, so fixture coverage cannot be checked`,
    );
  }
  return new Set([...table[1].matchAll(SUITE_TABLE_ROW_PATTERN)].map((row) => row[1]));
}

const declared = findDeclaredEntryPoints();
const registered = findRegisteredSuites();
const unregistered = [...declared.entries()]
  .filter(([name]) => !registered.has(name))
  .sort(([, a], [, b]) => a.localeCompare(b));

if (unregistered.length > 0) {
  process.stderr.write(
    `${unregistered.length} fixture suite(s) are never executed. Add each one to the runFixtureSuites table in ${RUNNER_RELATIVE_PATH}:\n`,
  );
  for (const [name, file] of unregistered) {
    process.stderr.write(`  ${name}\n      ${file}\n`);
  }
  process.exit(1);
}

process.stdout.write(`fixture coverage checked: ${declared.size} suites registered\n`);
