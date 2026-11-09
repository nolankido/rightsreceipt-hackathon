/** Private, local-only buyer handoff for a genuine PayPal Sandbox invoice. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PAYABLE = new Set(["UNPAID", "SENT", "SHARED"]);
const safeFailure = () => Object.assign(new Error("Sandbox payer link is unavailable."),
  { code: "payment_handoff_unavailable" });

/** No redirects, live PayPal hosts, opaque URL encodings or bearer-like query data. */
export function checkedSandboxHandoffUrl(value) {
  if (typeof value !== "string" || value.length > 2048
    // eslint-disable-next-line no-control-regex -- Reject ASCII controls before URL parsing can normalize them.
    || /[\s\\\x00-\x1f%]/u.test(value)) throw safeFailure();
  let url;
  try { url = new URL(value); } catch { throw safeFailure(); }
  if (url.origin !== "https://www.sandbox.paypal.com" || url.username || url.password || url.search
    || !/^https:\/\/www\.sandbox\.paypal\.com\//u.test(value)
    || !/^\/invoice\/(?:p\/|payerView\/details\/)[A-Za-z0-9/_-]*$/u.test(url.pathname)
    || !/^(?:#[A-Za-z0-9_-]+)?$/u.test(url.hash)
    || (url.pathname.endsWith("/") && !url.hash)) throw safeFailure();
  return value;
}

/** The private file never goes into public evidence or the CLI output body. */
export function writeSandboxPaymentHandoff(directory, view) {
  if (!view || !PAYABLE.has(view.status)) return null;
  const url = checkedSandboxHandoffUrl(view.paymentUrl);
  const path = join(directory, "sandbox-payment-link.txt");
  try { writeFileSync(path, url + "\n", { flag: "wx", mode: 0o600 }); }
  catch { throw safeFailure(); }
  return path;
}
