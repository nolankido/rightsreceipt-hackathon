# Turn 140: block impossible demo-video dimensions

**Date:** November 7, 2026 UTC  
**Priority:** P0 final-video structural readiness  
**Release decision:** NOT READY

## The false-green case

The mandatory public Devpost demo must be a working video shorter than three minutes. The dependency-free MP4 preflight correctly checked for a declared video stream, audio stream, payload and strict runtime, but it did not reject impossible video dimensions. A primary `vide` track with width or height of zero pixels returned `passed_with_advisories` even though there could be no useful picture geometry to judge. A fractional dimension below one full pixel had the same problem.

This is distinct from an otherwise usable smaller frame size, which should remain a resolution advisory.

## Implementation

- In `scripts/demo-video-preflight.mjs`, add the fixed blocker `video_dimensions_invalid` if the first declared video track's width or height is less than one pixel.
- Preserve the existing advisory for positive resolutions below 1280 by 720 and the optional FFmpeg decode check.
- In `scripts/demo-video-preflight.test.mjs`, cover zero width, zero height, both zero, subpixel width and a normal 640 by 360 advisory.
- Update the [video release QA instructions](../submission/VIDEO_RELEASE_QA.md), [submission index](../submission/README.md) and [project status](../../PROJECT_STATUS.md).

The check remains read-only, offline and path-free in its JSON response. It does not create or modify an MP4.

## Verification

The new regression first **failed against the prior source**, which reported `passed_with_advisories` for a zero-width video. After the correction, all impossible-dimension cases return `blocked` with `video_dimensions_invalid`; positive lower-resolution footage still returns `passed_with_advisories`.

Ordinary source test command:

```powershell
node --test scripts/demo-video-preflight.test.mjs
```

On a machine with a working local FFmpeg installation, the optional actual H.264/AAC integration witness can also be enabled. From PowerShell:

```powershell
$env:RIGHTSRECEIPT_FFMPEG_TEST='1'; node --test scripts/demo-video-preflight.test.mjs; Remove-Item Env:RIGHTSRECEIPT_FFMPEG_TEST
```

In this environment, the real FFmpeg fixture was successfully encoded and decoded after the fix. The related offline PayPal evidence tests also passed. The tests were executed on Node 24.22.1, so this is **not** evidence of a complete pinned Node 22 release.

## Still required

The script does not establish that video packets decode unless `--decode-check` is used, that narration is intelligible, that the scenes are truthful, or that YouTube playback is publicly accessible. A genuine finished RightsReceipt demo file was not available here.

Complete the clean Node 22 release and public-source export, obtain genuine separate-buyer PayPal Sandbox PAID and authenticated webhook evidence, make a functional final MP4 and inspect it with this verifier, then upload it and confirm signed-out YouTube playback before Devpost submission. The internal November 9 target and official submission deadline remain unchanged.

**No external publication, payment, API charge, YouTube upload or Devpost submission occurred in this turn.**
