/** Private worker. The public launcher fixes its environment, loader and owned output directory. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lstatSync, unlinkSync } from "node:fs";
import { installRehearsalNetworkTripwire, requireRehearsalRuntime, writeRehearsalArtifact } from "./support/judge-rehearsal-runtime.mjs";

const schemaVersion = "judge-rehearsal-run-v1";
export async function runWorker(directory) {
  let phase = "preflight";
  const tripwire = installRehearsalNetworkTripwire();
  const created = [];
  function write(name, content) {
    const path = writeRehearsalArtifact(directory, name, content), stat = lstatSync(path);
    created.push({ path, dev: stat.dev, ino: stat.ino }); return path;
  }
  try {
    requireRehearsalRuntime();
    if (typeof directory !== "string" || directory !== resolve(directory)) throw new Error();
    phase = "loading";
    const { runJudgeRehearsal } = await import("./support/judge-rehearsal-runner.mjs");
    const { projectJudgeRehearsalReport, renderJudgeRehearsalReport } = await import("./support/judge-rehearsal-report.mjs");
    const execution = await runJudgeRehearsal({ onPhase(value) { phase = value; }, externalAttempts: () => tripwire.attempts });
    phase = "report";
    const report = projectJudgeRehearsalReport(execution.report);
    const json = JSON.stringify(report, null, 2) + "\n", html = renderJudgeRehearsalReport(report);
    execution.assertSafeArtifacts(json); execution.assertSafeArtifacts(html);
    if (tripwire.attempts !== 0) throw new Error();
    const evidencePath = write("evidence.json", json);
    const reportPath = write("report.html", html);
    process.stdout.write(JSON.stringify({ schemaVersion, status: "passed", mode: "local_injected", scenarioCount: report.scenarios.length,
      resetCount: report.resets.length, reportPath, evidencePath }) + "\n");
    return 0;
  } catch (error) {
    // Remove only files created by this failed run, never a pre-existing collision.
    for (const file of created) {
      try { const stat = lstatSync(file.path); if (stat.isFile() && stat.dev === file.dev && stat.ino === file.ino) unlinkSync(file.path); } catch { /* Preserve uncertain paths. */ }
    }
    const code = error.code === "REHEARSAL_NETWORK_BLOCKED" || tripwire.attempts ? "external_io_blocked"
      : error.code === "output_unavailable" ? "output_unavailable" : "rehearsal_failed";
    const value = { schemaVersion, status: "failed", code, phase };
    try { value.failurePath = writeRehearsalArtifact(directory, "failure.json", JSON.stringify(value, null, 2) + "\n"); } catch { /* Never overwrite a prior artifact or expose internal details. */ }
    process.stdout.write(JSON.stringify(value) + "\n"); return 1;
  } finally { tripwire.restore(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = await runWorker(process.argv[2]);
