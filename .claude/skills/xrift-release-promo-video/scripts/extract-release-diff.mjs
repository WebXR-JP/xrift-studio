#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log([
    'Usage: extract-release-diff.mjs [options]',
    '',
    '  --from <ref>             Start ref (default: HEAD~1)',
    '  --to <ref>               End ref (default: HEAD)',
    '  --output <file>          Write JSON to a file instead of stdout',
    '  --worktree               Include staged and unstaged worktree diffs',
    '  --max-diff-chars <n>     Limit each diff body (default: 120000)',
  ].join('\n'));
  process.exit(0);
}

function readOption(name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function hasFlag(name) {
  return args.includes(name);
}

function runGit(gitArgs, options = {}) {
  try {
    return execFileSync('git', gitArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || 'unknown git error';
    throw new Error(`git ${gitArgs.join(' ')} failed: ${detail}`);
  }
}

function parseNumstat(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [additions, deletions, ...pathParts] = line.split('\t');
    const path = pathParts.join('\t');
    return {
      path,
      additions: additions === '-' ? null : Number(additions),
      deletions: deletions === '-' ? null : Number(deletions),
      binary: additions === '-' || deletions === '-',
    };
  });
}

function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [status, ...pathParts] = line.split('\t');
    return {status, path: pathParts.join('\t')};
  });
}

function parseCommits(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [hash, subject, author, date] = line.split('\t');
    return {hash, subject, author, date};
  });
}

function isLikelyUserVisible(path) {
  if (/^(pnpm-lock|package-lock|yarn\.lock|.*\.snap)$/.test(path)) return false;
  if (/(^|\/)(test|tests|e2e|__tests__)(\/|\.)/i.test(path)) return false;
  return /^(src|packages|public|docs|cli|src-tauri)\//.test(path);
}

const from = readOption('--from', 'HEAD~1');
const to = readOption('--to', 'HEAD');
const output = readOption('--output');
const maxDiffChars = Number(readOption('--max-diff-chars', '120000'));
const includeWorktree = hasFlag('--worktree');

if (!Number.isFinite(maxDiffChars) || maxDiffChars < 1000) {
  throw new Error('--max-diff-chars must be a number of at least 1000');
}

const rangeArgs = [from, to];
const names = parseNameStatus(runGit(['diff', '--name-status', ...rangeArgs]));
const statsByPath = new Map(parseNumstat(runGit(['diff', '--numstat', ...rangeArgs])).map((item) => [item.path, item]));
const files = names.map((item) => ({
  ...item,
  ...(statsByPath.get(item.path) ?? {additions: null, deletions: null, binary: false}),
  likelyUserVisible: isLikelyUserVisible(item.path),
}));

const commits = parseCommits(runGit([
  'log', '--format=%H%x09%s%x09%an%x09%ad', '--date=short', `${from}..${to}`,
]));

let diff = runGit(['diff', '--no-ext-diff', '--unified=40', ...rangeArgs], {maxBuffer: Math.max(maxDiffChars * 2, 1024 * 1024)});
let diffTruncated = false;
if (diff.length > maxDiffChars) {
  diff = `${diff.slice(0, maxDiffChars)}\n\n[diff truncated by --max-diff-chars]`;
  diffTruncated = true;
}

let worktree = null;
if (includeWorktree) {
  const unstaged = runGit(['diff', '--no-ext-diff', '--unified=40'], {maxBuffer: Math.max(maxDiffChars * 2, 1024 * 1024)});
  const staged = runGit(['diff', '--cached', '--no-ext-diff', '--unified=40'], {maxBuffer: Math.max(maxDiffChars * 2, 1024 * 1024)});
  worktree = {
    unstaged: unstaged.length > maxDiffChars ? `${unstaged.slice(0, maxDiffChars)}\n\n[diff truncated]` : unstaged,
    staged: staged.length > maxDiffChars ? `${staged.slice(0, maxDiffChars)}\n\n[diff truncated]` : staged,
  };
}

const result = {
  generatedAt: new Date().toISOString(),
  repository: (() => {
    try {
      return runGit(['config', '--get', 'remote.origin.url']) || null;
    } catch {
      return null;
    }
  })(),
  from,
  to,
  includeWorktree,
  commits,
  files,
  diff,
  diffTruncated,
  worktree,
  reviewHint: '採用候補は likelyUserVisible が true のファイルから選び、実画面と成功後の結果で事実確認する。',
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (output) {
  const outputPath = resolve(output);
  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, json, 'utf8');
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}
