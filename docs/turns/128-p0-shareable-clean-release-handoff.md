# Turn 128: shareable clean-release diagnostics without private paths

**Date:** November 6, 2026  
**Scope:** P0 full-release operator handoff, privacy and regression coverage  
**Submission status:** NOT READY

## Practical release blocker

This execution environment has Node 24 and only a reconstructed subset of the private repository. It cannot honestly complete the pinned Node 22 release or real PayPal Sandbox acceptance. The existing Windows clean-checkout runner can execute the full release from Nolan's local private Git repository, but its normal JSON contains exact source commit, checkout and evidence paths. Those paths are needed for internal auditing and public-export preparation, yet should not be casually pasted into a chat.

## Change

- `scripts/clean-release-checkout.mjs` now accepts `--shareable` alone or with `--export-public`. All normal options and the Node 22 gate are unchanged.
- The mode executes the **same complete clean release** and retains the original detailed private evidence in the ignored `.data/clean-release/` area. The shareable output is only a projected JSON summary, not a different verifier or a cached prior result.
- Its `rightsreceipt-clean-release-handoff-v1` payload contains fixed release/export gate status, a safe fixed error code, and bounded allowlisted stage failures when present. It excludes source commit, private directory paths, export manifest locations, stdout/stderr, provider payloads and unrecognized error text.
- `package.json` adds `release:clean:shareable` as a convenience command without opting into a public export.
- `scripts/clean-release-checkout.test.mjs` adds tests for failure redaction, success and partial-export status, malformed/duplicate flags, the separate CLI behavior and package wiring.
- The [Windows clean-release runbook](../submission/CLEAN_CHECKOUT_RELEASE.md) and [final cutover checklist](../submission/FINAL_CUTOVER_CHECKLIST.md) explain what may be shared and what must remain private.

## Operator command

From PowerShell in the complete private RightsReceipt Git checkout, with Node 22.13 or newer in the 22.x series:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable
```

After it finishes, share only its path-free JSON to diagnose the first failed stage. The safe report deliberately omits paths needed for the actual export. If this diagnostic passes, run the original `node .\scripts\clean-release-checkout.mjs --export-public` to produce and privately locate the audited one-commit export.

Never paste the detailed `verification.json`, logs, invoice/account details, environment variables or normal path-bearing release output into a public channel.

## Tests actually executed

```bash
node --test scripts/clean-release-checkout.test.mjs
node scripts/clean-release-checkout.mjs --shareable
node scripts/clean-release-checkout.mjs --export-public --shareable
```

- **21/21** focused runner tests passed on Node 24.22.1. Those tests include real temporary local Git repositories, evidence path tampering, archive identity checks, private-path redaction and Node version refusal.
- The direct `--shareable` invocation exited 1 and returned only `code: "node_22_required"`, `releaseStatus: "not_verified"`, `publicExportStatus: "not_requested"` and the fixed limitation. The combined flags correctly reported `publicExportStatus: "not_verified"`.
- No full Node 22 release was performed, no Sandbox credentials were present, and no genuine financial, public GitHub, public YouTube or Devpost submission evidence was produced.

## Release priorities remain unchanged

The next P0 action is to run the **real** clean release on Nolan's Windows checkout, fix the first failing stage if necessary, and then run the verified private public export. Genuine Sandbox buyer-paid invoice/PAID retrieval/signature-verified exact-invoice webhook acceptance remains a separate financial gate. The final video must show functioning product behavior, be under three minutes, and play publicly signed out. The Devpost form must be submitted and confirmed.

This diagnostics improvement is complete. **Hackathon submission remains blocked** by external release and provider evidence, not by this focused test result.
