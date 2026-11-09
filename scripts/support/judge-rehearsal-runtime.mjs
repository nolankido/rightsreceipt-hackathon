/** Local rehearsal boundaries. These guards prevent accidental external I/O;
 * they are not an OS sandbox for untrusted code or a preloaded host process. */
import { lstatSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";

export class RehearsalError extends Error {
  constructor(code) { super("The local judge rehearsal could not complete."); this.code = code; }
}

export function parseRehearsalArgs(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== "string")) throw new RehearsalError("invalid_arguments");
  if (args.length === 1 && args[0] === "--help") return { help: true, output: null };
  if (args.length === 0) return { help: false, output: null };
  if (args.length !== 2 || args[0] !== "--output" || !args[1] || args[1].startsWith("--")
    || /[\x00-\x1f\x7f]/u.test(args[1])) throw new RehearsalError("invalid_arguments");
  return { help: false, output: resolve(args[1]) };
}

export function requireRehearsalRuntime(version = process.versions.node) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (!match || Number(match[1]) !== 22 || Number(match[2]) < 13) throw new RehearsalError("node_22_required");
}

export function createRehearsalWorkerEnvironment(environment = {}) {
  const allowed = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]);
  const result = {};
  for (const [name, value] of Object.entries(environment)) {
    if (allowed.has(name.toUpperCase()) && typeof value === "string") result[name] = value;
  }
  return { ...result, TZ: "UTC", NO_COLOR: "1" };
}

/** Output is always a new owned directory. Existing reports are never overwritten. */
export function createRehearsalOutputDirectory(output) {
  if (typeof output !== "string" || !isAbsolute(output) || /[\x00-\x1f\x7f]/u.test(output)) throw new RehearsalError("output_unavailable");
  const target = resolve(output), root = parse(target).root;
  let current = root;
  try {
    for (const part of target.slice(root.length).split(sep).filter(Boolean)) {
      current = join(current, part);
      try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    }
    return mkdtempSync(join(target, "run-"));
  } catch { throw new RehearsalError("output_unavailable"); }
}

export function writeRehearsalArtifact(directory, name, contents) {
  if (!["report.html", "evidence.json", "failure.json"].includes(name) || typeof contents !== "string") throw new RehearsalError("output_unavailable");
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    const path = join(directory, name);
    writeFileSync(path, contents, { flag: "wx", mode: 0o600, encoding: "utf8" });
    return path;
  } catch { throw new RehearsalError("output_unavailable"); }
}

/** No worker diagnostic is reflected without passing this closed public shape. */
export function validateRehearsalWorkerResult(value, directory) {
  const exact = keys => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === keys.sort().join();
  if (value?.schemaVersion !== "judge-rehearsal-run-v1") throw new RehearsalError("worker_failed");
  if (value.status === "passed" && exact(["schemaVersion", "status", "mode", "scenarioCount", "resetCount", "reportPath", "evidencePath"])
    && value.mode === "local_injected" && value.scenarioCount === 3 && value.resetCount === 3
    && value.reportPath === join(directory, "report.html") && value.evidencePath === join(directory, "evidence.json")) return value;
  const fields = ["schemaVersion", "status", "code", "phase", ...(value?.failurePath === undefined ? [] : ["failurePath"])];
  const phases = ["preflight", "loading", "source", "repeatability", "report",
    ...["ordinary", "recovery", "repeat"].flatMap(id => ["baseline_" + id, "scenario_" + id, "reset_" + id])];
  if (value.status === "failed" && exact(fields) && ["external_io_blocked", "output_unavailable", "rehearsal_failed"].includes(value.code)
    && phases.includes(value.phase) && (value.failurePath === undefined || value.failurePath === join(directory, "failure.json"))) return value;
  throw new RehearsalError("worker_failed");
}

/** Install before dynamically importing the journey or any application source. */
export function installRehearsalNetworkTripwire() {
  const require = createRequire(import.meta.url), undo = [];
  let attempts = 0;
  const block = () => { attempts++; throw new RehearsalError("REHEARSAL_NETWORK_BLOCKED"); };
  function patch(object, key, replacement = block) {
    if (typeof object[key] !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { value: replacement, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false });
    undo.push(() => { if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key]; });
  }
  patch(globalThis, "fetch", async () => block());
  for (const name of ["node:http", "node:https"]) {
    const mod = require(name); for (const key of ["request", "get", "createServer"]) patch(mod, key);
  }
  const net = require("node:net"), tls = require("node:tls"), dns = require("node:dns"), dgram = require("node:dgram");
  for (const key of ["connect", "createConnection", "createServer"]) patch(net, key);
  patch(net.Socket.prototype, "connect"); patch(net.Server.prototype, "listen");
  for (const key of ["connect", "createServer"]) patch(tls, key);
  patch(tls.TLSSocket.prototype, "connect"); patch(dgram, "createSocket");
  for (const key of Object.keys(dns)) if (/^(?:lookup|resolve|reverse)/u.test(key)) patch(dns, key);
  for (const key of Object.keys(dns.promises)) if (/^(?:lookup|resolve|reverse)/u.test(key)) patch(dns.promises, key, async () => block());
  if (dns.Resolver) for (const key of Object.getOwnPropertyNames(dns.Resolver.prototype)) if (/^(?:resolve|reverse)/u.test(key)) patch(dns.Resolver.prototype, key);
  if (dns.promises.Resolver) for (const key of Object.getOwnPropertyNames(dns.promises.Resolver.prototype)) if (/^(?:resolve|reverse)/u.test(key)) patch(dns.promises.Resolver.prototype, key, async () => block());
  syncBuiltinESMExports();
  let restored = false;
  return Object.freeze({ get attempts() { return attempts; }, restore() {
    if (restored) return; restored = true;
    for (const restore of undo.reverse()) restore(); syncBuiltinESMExports();
  } });
}
