import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = new URL("../", import.meta.url);
const roots = ["apps", "packages", "scripts", "migrations", "seed", "public", "data"];
const rootFiles = [
  ".dev.vars.example",
  ".node-version",
  ".npmrc",
  ".nvmrc",
  "eslint.config.js",
  "index.html",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "wrangler.jsonc",
  "wrangler.judge.example.jsonc",
];
const checkedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsonc",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

async function collect(directory) {
  const absolute = new URL(`${directory}/`, root);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(child)));
    } else if (checkedExtensions.has(extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

const files = [
  ...rootFiles,
  ...(await Promise.all(roots.map(collect))).flat(),
];
const problems = [];

for (const file of files) {
  const content = await readFile(new URL(file, root), "utf8");
  const display = relative(process.cwd(), new URL(file, root).pathname) || file;
  if (!content.endsWith("\n")) problems.push(`${display}: missing final newline`);
  if (content.includes("\r")) problems.push(`${display}: contains CRLF characters`);
  if (content.includes("\u2014")) problems.push(`${display}: contains an em dash`);
  content.split("\n").forEach((line, index) => {
    if (/\s+$/.test(line) && line.length > 0) {
      problems.push(`${display}:${index + 1}: trailing whitespace`);
    }
    if (line.includes("\t")) {
      problems.push(`${display}:${index + 1}: tab character`);
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`format: ${files.length} scaffold, persistence, asset, and request files checked`);
