import process from "node:process";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const [major, minor] = process.versions.node.split(".").map(Number);

if (major !== 22 || minor < 13) {
  console.error(
    `RightsReceipt requires Node 22.13 through 22.x. Current: ${process.versions.node}`,
  );
  process.exit(1);
}

if (packageJson.packageManager !== "pnpm@12.8.2") {
  console.error("packageManager must remain pinned to pnpm@12.8.2.");
  process.exit(1);
}

const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Run the verification command through pnpm: pnpm verify");
  process.exit(1);
}

console.log(`environment: node ${process.versions.node}, ${userAgent.split(" ")[0]}`);
