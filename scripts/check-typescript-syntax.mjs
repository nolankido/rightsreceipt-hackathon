import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";
import ts from "typescript";

const root = new URL("../", import.meta.url);
async function collect(directory) {
  const entries = await readdir(new URL(`${directory}/`, root), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(child)));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(child);
  }
  return files;
}

const files = [
  ...(await collect("apps")),
  ...(await collect("packages")),
  "vite.config.ts",
  "vitest.config.ts",
];
const problems = [];
for (const file of files) {
  const content = await readFile(new URL(file, root), "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  for (const diagnostic of source.parseDiagnostics) {
    const position = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    problems.push(
      `${file}:${position.line + 1}:${position.character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`typescript syntax: ${files.length} files parsed`);
