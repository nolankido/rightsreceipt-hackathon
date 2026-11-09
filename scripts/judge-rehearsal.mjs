#!/usr/bin/env node
/** One-command, dependency-free local judge rehearsal for the supported Node22 runtime. */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRehearsalOutputDirectory, createRehearsalWorkerEnvironment, parseRehearsalArgs,
  requireRehearsalRuntime, validateRehearsalWorkerResult } from "./support/judge-rehearsal-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "judge-rehearsal-run-v1";
const usage = `RightsReceipt local judge rehearsal

Usage: node scripts/judge-rehearsal.mjs [--output DIRECTORY]

Runs the canonical ordinary journey, interrupted-delivery recovery and a repeat
from the same asset/policy seed, with three verified in-memory resets.
Uses injected sessions and provider responses. No credentials, network, browser,
package installation or on-disk application database is required.

Requires Node 22.13 through 22.x. Each run creates a new folder containing
report.html and evidence.json under .data/judge-rehearsal or DIRECTORY.
Open report.html locally. External release gates remain separate.
`;

export async function main(args = process.argv.slice(2), environment = process.env) {
  let parsed;
  try { parsed = parseRehearsalArgs(args); if (parsed.help) { process.stdout.write(usage); return 0; } requireRehearsalRuntime(); }
  catch (error) {
    process.stdout.write(JSON.stringify({ schemaVersion, status: "failed", phase: "preflight", code: error.code ?? "invalid_arguments" }) + "\n");
    process.stderr.write("Local rehearsal preflight failed. Use --help for the supported command and runtime.\n"); return 1;
  }
  let directory;
  try { directory = createRehearsalOutputDirectory(parsed.output ?? join(root, ".data", "judge-rehearsal")); }
  catch {
    process.stdout.write(JSON.stringify({ schemaVersion, status: "failed", phase: "output", code: "output_unavailable" }) + "\n");
    process.stderr.write("A new rehearsal output directory could not be created. Existing files were preserved.\n"); return 1;
  }
  return new Promise(resolveResult => {
    const worker = spawn(process.execPath, ["--no-warnings", "--experimental-strip-types", "--experimental-loader",
      pathToFileURL(join(root, "scripts", "consent-ts-test-loader.mjs")).href, join(root, "scripts", "judge-rehearsal-worker.mjs"), directory],
    { cwd: root, env: createRehearsalWorkerEnvironment(environment), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", failed = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; worker.kill(); }, 120000);
    worker.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 32768) { failed = true; worker.kill(); } });
    // Worker error details may contain assertion data. The public launcher never echoes them.
    worker.stderr.on("data", () => {});
    worker.on("error", () => { failed = true; });
    worker.on("close", code => {
      clearTimeout(timer);
      try {
        const value = validateRehearsalWorkerResult(JSON.parse(output), directory);
        if (failed || timedOut || (value.status === "passed" && code !== 0)) throw new Error();
        process.stdout.write(JSON.stringify(value, null, 2) + "\n");
        if (value.status === "failed") process.stderr.write("Local rehearsal failed. The minimized failure record identifies the stage.\n");
        resolveResult(value.status === "passed" ? 0 : 1);
      } catch {
        process.stdout.write(JSON.stringify({ schemaVersion, status: "failed", phase: "worker", code: timedOut ? "rehearsal_timeout" : "worker_failed" }) + "\n");
        process.stderr.write("Local rehearsal failed before a valid report was produced.\n"); resolveResult(1);
      }
    });
  });
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) process.exitCode = await main();
