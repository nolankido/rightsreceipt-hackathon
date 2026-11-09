# RightsReceipt Devpost copy preflight

**Added:** November 5, 2026
**Status:** Offline structural review available. The existing draft is intentionally blocked until final public links are supplied.

The Devpost entry is a mandatory publication artifact, distinct from the source checkout and the local licensing demonstration. The final copy can fail even if the application works: required story sections may be missing, a private development repository may be linked by mistake, or a YouTube placeholder may survive the final paste.

## Windows one-command review

From the root of the private RightsReceipt repository, with Node 22 installed:

```powershell
node .\scripts\devpost-copy-preflight.mjs
```

Or:

```powershell
corepack pnpm submission:devpost:check
```

To inspect a final copy saved under `docs/submission/`:

```powershell
node .\scripts\devpost-copy-preflight.mjs --file docs/submission/DEVPOST_DRAFT.md
```

The tool is dependency-free, offline, read-only and never returns the draft text, private paths, public URL values or provider credentials. It checks only files within the repository's submission-docs directory, rejecting symlink files and oversized inputs.

## What the JSON result means

- `blocked`: Exit code 1. One or more required sections, PayPal/AI disclosures or exact public URL fields are missing, malformed, duplicated or still contain release placeholders.
- `copy_ready_for_manual_review`: Exit code 0. The draft has the required section headings and plausible GitHub and YouTube URL *syntax*. This does not establish that either page is public or that the submission is accurate.
- `invalid_arguments`: Exit code 2. Check the command form.

The GitHub URL must identify a distinct repository, not the private `nolankido/rightsReceipt` checkout. The YouTube URL must be a direct ordinary watch or short URL with an 11-character video identifier and no extra tracking query. The preflight looks for the labeled lines `Required public repository` and `YouTube` in their corresponding sections. It accepts a bare HTTPS URL or one Markdown hyperlink.

Only rendered Markdown sections count. Headings, disclosure text and link labels hidden inside fenced code examples (backtick or tilde fences) or HTML comments cannot satisfy the gate. Repeated required `##` headings produce `duplicate_required_section` even if the last occurrence contains a plausible link. This prevents a pasted template or two contradictory copies of the Video/Functional demo section from accidentally receiving a green copy result. Place the single real heading and its final URL outside examples or comments. Unresolved placeholders anywhere in the file remain blocking, even inside hidden examples.

## Manual gate after the script passes

1. Confirm the entire final entry describes behavior verified on the exact frozen source commit.
2. Confirm the two different AI mechanisms are described honestly: deterministic evidence extraction and separately executed read-only learned classifier. The final demo instructions should identify both the `/model` page and the supplemental `scripts/judge-ai-proof.mjs` command, with `paymentEvidence: "none"` clearly distinct from PayPal payment acceptance. Do not imply automated licensing approval.
3. Use actual PayPal Sandbox evidence for any statement of a real buyer-paid invoice, authenticated PAID retrieval or signed webhook. Keep simulated payment explicitly labeled if that stronger evidence is not available.
4. Open the separate sanitized public repository while signed out. Check setup instructions and the visible open-source license.
5. Open the final public YouTube video signed out, watch the actual running product demonstration, verify audio and strict runtime under three minutes.
6. Transfer the final copy to Devpost, inspect all required fields and attachments, and submit before the deadline.
7. Preserve the final submitted Devpost URL and confirmation privately. A passing offline preflight, a saved draft or a Devpost preview is not a submitted entry.

## Developer verification

```powershell
node --test scripts/devpost-copy-preflight.test.mjs
```

The test suite includes the intentionally incomplete current draft, a synthetic fully populated copy, Markdown-link variants, private-repository mislinks, invalid video formats, omitted or duplicate required sections, invisible fenced/commented examples, valid copy containing fenced notes, unresolved placeholders and safe CLI failures. It requires no GitHub Actions, cron, account connection, paid API or external network access.
