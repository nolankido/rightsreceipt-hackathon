# Turn 116: Make final video decoding optional and keep the release gate portable

**Date:** November 5, 2026 UTC  
**Status:** Implemented and tested locally. No final RightsReceipt MP4 was available.

## Concrete release blocker prevented

The first version of `scripts/demo-video-preflight.test.mjs` automatically ran an FFmpeg-generated H.264/AAC witness whenever an `ffmpeg` executable existed. This conflated **FFmpeg installed** with **FFmpeg supports the particular video and audio encoders**. A partially installed or limited-codec Windows FFmpeg could therefore make the complete `pnpm verify` gate fail even though the video preflight itself requires only Node.

The external codec integration witness now runs only with explicit `RIGHTSRECEIPT_FFMPEG_TEST=1`. Default source verification always exercises pure Node structural and deterministic decoder-error tests and does not spawn FFmpeg at all.

## Additional capability

`scripts/demo-video-preflight.mjs` now accepts `--decode-check` after the final MP4 path. The first step remains the existing offline Node-only timing and track preflight. If it passes, the optional step invokes FFmpeg with:

- `-nostdin` and a six-minute timeout to prevent interactive or indefinite processing;
- `-protocol_whitelist file,pipe` so the input cannot open HTTP, HTTPS or other network protocols;
- explicit first-video and first-audio stream mapping;
- `-xerror`, null media output and final progress/frame verification;
- a minimal child environment without PayPal, GitHub, AI tokens, FFREPORT or `NODE_OPTIONS`;
- sanitized fixed error codes for absent FFmpeg, decode failure, timeout or zero frames.

The command does not replace or transcode the source file, contact a provider, upload anything, or write an output video. Successful decoding is not proof of audible narration, good color, viewer satisfaction, rights/privacy safety, genuine payment or anonymous YouTube availability.

## Verification and limits

- Default suite: **13 passed, 1 optional real-FFmpeg witness skipped**, zero failed.
- Explicit `RIGHTSRECEIPT_FFMPEG_TEST=1` suite: **14/14 passed**, including an actual locally encoded H.264/AAC MP4 and its full decode.
- Synthetic tests exercise exact decoder arguments, stream maps, local-only protocol allowlist, stripped sensitive environment variables, absent decoder, timeout, nonzero result, zero video frames, missing completion and unchanged no-dependency default CLI.
- Script syntax and package JSON checks passed on Node 24.22.1. The exact pinned Node 22 private release remains unrun here.

## Next external gates

Nolan still needs to execute the exact clean release on the complete Node 22 checkout, obtain genuine separate-buyer PayPal Sandbox paid and signed webhook evidence, publish the sanitized one-commit source, record a functioning public video shorter than three minutes and complete Devpost submission. Do not imply these gates were fulfilled by a codec test.
