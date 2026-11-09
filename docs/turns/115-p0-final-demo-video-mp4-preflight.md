# Turn 115: Block technically invalid final MP4 demos before YouTube upload

**Date:** November 5, 2026 UTC  
**Status:** Implemented and locally tested. No final RightsReceipt video was available for inspection or publication.

## Release risk

The final cutover required a functioning public demo under three minutes, with intelligible sound and readable footage. The storyboard provided a good segment plan but no automated test of the **actual exported MP4**. A blank or audio-only export, a file with no audio track, a malformed container, a duration rounded from 3:00, or a movie-header duration shorter than its audio/video track might otherwise be uploaded at the deadline.

## Improvement

1. Added `scripts/demo-video-preflight.mjs` with `--file` CLI. It operates entirely offline using native Node file reads and does not require FFmpeg, ffprobe, an upload, provider credentials or a paid service.
2. It walks ISO BMFF MP4 box headers without loading media payload, recognizes `ftyp`, `moov`, `mvhd`, `trak`, `tkhd`, `mdia`, `mdhd`, `hdlr` and `mdat`, and reads version-0 and version-1 movie/track durations including extended 64-bit boxes.
3. It enforces a strict duration below 180,000 ms across the movie and all declared audio/video tracks, plus at least one video track, one audio track and nonempty media payload.
4. It reports fixed diagnostic codes instead of filesystem paths. It returns advisories for a runtime close to three minutes, resolution below 720p, unusual landscape aspect ratio, or large uploads.
5. Added the `submission:video:check` and `submission:video:verify` scripts and included video regressions in the broader submission-candidate test chain. The release storyboard, cutover checklist and submission index now link to the practical Windows [video QA runbook](../submission/VIDEO_RELEASE_QA.md).

## Evidence

**11 of 11** focused Node 24.22.1 tests passed. Synthetic fixtures cover a 2:43.8 MP4 with audio/video, exact 3:00 and longer, 2:30 movie metadata with a 3:01 track, missing audio/video/`mdat`, margin/resolution/aspect advisories, 64-bit durations, extended and zero-size atom forms, malformed/truncated files, invalid time scales and CLI redaction. A separate test generated an actual H.264/AAC MP4 locally with FFmpeg and confirmed the standalone parser identified both tracks, dimensions and a valid duration. The production preflight has no FFmpeg dependency; FFmpeg is only an optional test fixture generator.

## Claims this does not support

- No final RightsReceipt export was available, so no real demo can be certified or uploaded from this result.
- The parser reads structure but does not decode media. It cannot prove the soundtrack is audible, frames render, captions are correct, no secrets are visible, the application is actually functional or a PayPal payment was genuine.
- The parser does not contact YouTube, so final **Public** visibility and signed-out playback remain separate manual checks.
- Full clean Node 22 release, real PayPal Sandbox lifecycle, separate sanitized public GitHub source and Devpost submission are still open.
