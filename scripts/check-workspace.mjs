import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const expectedPackages = [
  "@rightsreceipt/web",
  "@rightsreceipt/api",
  "@rightsreceipt/contracts",
  "@rightsreceipt/domain",
  "@rightsreceipt/application",
  "@rightsreceipt/persistence",
  "@rightsreceipt/pricing",
  "@rightsreceipt/ai-runtime",
  "@rightsreceipt/paypal",
  "@rightsreceipt/receipts",
  "@rightsreceipt/observability",
  "@rightsreceipt/testing",
  "@rightsreceipt/ui",
];

async function packageFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, root), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}/package.json`);
}

const files = [
  ...(await packageFiles("apps")),
  ...(await packageFiles("packages")),
];
const packages = new Map();
for (const file of files) {
  const manifest = JSON.parse(await readFile(new URL(file, root), "utf8"));
  if (typeof manifest.name !== "string") {
    throw new Error(`${file} has no package name`);
  }
  if (packages.has(manifest.name)) {
    throw new Error(`duplicate workspace package: ${manifest.name}`);
  }
  packages.set(manifest.name, { file, manifest });
}

const actualNames = [...packages.keys()].sort();
const missing = expectedPackages.filter((name) => !packages.has(name));
const unexpected = actualNames.filter((name) => !expectedPackages.includes(name));
if (missing.length || unexpected.length) {
  throw new Error(
    `workspace mismatch; missing=${missing.join(",")}; unexpected=${unexpected.join(",")}`,
  );
}

const graph = new Map();
for (const [name, { file, manifest }] of packages) {
  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };
  const internal = [];
  for (const [dependency, specifier] of Object.entries(dependencies)) {
    if (!dependency.startsWith("@rightsreceipt/")) continue;
    if (!packages.has(dependency)) {
      throw new Error(`${file} references unknown workspace ${dependency}`);
    }
    if (specifier !== "workspace:*") {
      throw new Error(`${file} must use workspace:* for ${dependency}`);
    }
    internal.push(dependency);
  }
  graph.set(name, internal);
}

const visiting = new Set();
const visited = new Set();
function visit(name, trail = []) {
  if (visiting.has(name)) {
    throw new Error(`workspace dependency cycle: ${[...trail, name].join(" -> ")}`);
  }
  if (visited.has(name)) return;
  visiting.add(name);
  for (const dependency of graph.get(name) ?? []) {
    visit(dependency, [...trail, name]);
  }
  visiting.delete(name);
  visited.add(name);
}
for (const name of graph.keys()) visit(name);

const domainSource = await readFile(
  new URL("packages/domain/src/index.ts", root),
  "utf8",
);
const forbiddenDomainImports = [
  "react",
  "hono",
  "drizzle",
  "cloudflare",
  "@rightsreceipt/persistence",
  "@rightsreceipt/paypal",
];
for (const forbidden of forbiddenDomainImports) {
  if (domainSource.includes(forbidden)) {
    throw new Error(`domain package contains forbidden dependency text: ${forbidden}`);
  }
}

const rootPackage = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
if (!rootPackage.scripts?.verify || !rootPackage.scripts?.["verify:static"]) {
  throw new Error("root package must define verify and verify:static scripts");
}
if (rootPackage.packageManager !== "pnpm@12.8.2") {
  throw new Error("pnpm version is not pinned as expected");
}

console.log(
  `workspace: ${packages.size} packages, ${[...graph.values()].flat().length} internal edges, no cycles`,
);
