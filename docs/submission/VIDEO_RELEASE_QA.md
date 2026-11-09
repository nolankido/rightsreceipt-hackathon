# RightsReceipt: final demo video release QA

**Added:** November 5, 2026  
**Status:** Structural MP4 preflight available. A final RightsReceipt video has not been exported or tested here.

The PayPal Hackathon video must be a publicly visible working demonstration shorter than three minutes. The [storyboard](VIDEO_STORYBOARD.md) targets 2:35 to 2:50. The final file should be checked before YouTube upload so a missing audio track, wrong video file, or 3:00 runtime does not become a last-minute submission failure.

## One-command Windows preflight

From the private RightsReceipt repository root, with Node 22 installed:

```powershell
node .\scripts\demo-video-preflight.mjs --file 'C:\PASTE\ACTUAL\FINAL\RightsReceipt_demo.mp4'
```

Equivalent package invocation:

```powershell
corepack pnpm submission:video:check -- --file 'C:\PASTE\ACTUAL\FINAL\RightsReceipt_demo.mp4'
```

The command is fully offline, read-only, dependency-free, and outputs one JSON object. It does not need FFmpeg, ffprobe, package installation, provider credentials or a YouTube account. The output never repeats the input filename or parent directories.

### Optional stronger media decode check

If you already have the open-source FFmpeg executable installed on the machine, add `--decode-check` to the same command:

```powershell
node .\scripts\demo-video-preflight.mjs --file 'C:\PASTE\ACTUAL\FINAL\RightsReceipt_demo.mp4' --decode-check
```

This optional step performs the structural preflight first, then decodes the first video and audio tracks into FFmpeg's null output. It requires a successful decoder exit and at least one decoded video frame. The child process is restricted to local `file,pipe` protocols, receives only minimal non-secret environment variables, does not produce a new video and has a six-minute deadline. Provider credentials, private file paths and FFmpeg error bodies are not printed.

Possible errors include `ffmpeg_not_installed`, `decode_check_timed_out`, `decode_check_failed` and `decode_check_no_frames`. These block the optional decode check, but do not change the dependency-free default mode. Installing FFmpeg is **not** a prerequisite for running the standard submission tests or creating the initial release.

The standard regression suite deliberately skips the optional real-FFmpeg integration witness so a Windows machine that happens to have an incomplete FFmpeg installation cannot fail its entire source release for that reason. Developers can run that extra witness deliberately with `RIGHTSRECEIPT_FFMPEG_TEST=1` in their environment.

## What it checks automatically

| Field | Passing requirement | Reason |
| --- | --- | --- |
| File | Real, readable, non-symlink regular file | Avoid a missing or accidental shortcut target |
| Container | MP4 ISO BMFF `ftyp` and `moov` structure, with a nonempty `mdat` | Reject obvious wrong or truncated files |
| Duration | Movie duration **and every recognized audio/video track** strictly below 180,000 ms | Avoid relying on rounded player timestamps or a shorter container header |
| Video | At least one real declared video track (`vide`) | Detect audio-only or wrongly exported files |
| Primary video dimensions | Both declared width and height at least one full pixel | Block a nominal video track with impossible zero/subpixel geometry |
| Audio | At least one real declared audio track (`soun`) | Detect a missing sound track, not silence within a track |
| Internal consistency | Valid box lengths, movie/media time bases and nonzero known durations | Reject malformed or misleading metadata |

MP4 variant support includes version-0 and version-1 timing records, 64-bit extended atom sizes and a zero-length terminal atom extending to EOF. The parser seeks across media payload rather than reading the entire video into memory.

Possible status values:

- `passed`: structural timing and tracks satisfy the gate.
- `passed_with_advisories`: required checks pass but there is limited runtime margin, positive resolution below 1280 by 720, unusual landscape aspect ratio, or an especially large upload.
- `blocked`: missing audio/video/mdat, primary video dimensions below one pixel (`video_dimensions_invalid`), duration of 3:00 or longer, invalid file or malformed structural metadata. Fix the export before upload.

The recommended duration remains 2:35 to 2:50 to leave a comfortable margin for edits and transcodes. A file at exactly 3:00 is **blocked**, not rounded down.

## Manual publication review remains mandatory

**The default script does not decode frames or audio.** Optional `--decode-check` verifies that FFmpeg can decode mapped media and produce video frames, but it still does not establish intelligible narration, correct volume, visible content or absence of silence. A passing local MP4 does not establish that YouTube accepts it or that judges can watch it anonymously.

After the script passes:

1. Watch the **exact final export** from beginning to end with sound on and at normal speed. Confirm clear narration, readable text and smooth, non-black video.
2. Recheck the factual distinction between the locally trained read-only AI model, human licensing consent, deterministic pricing, simulated payment and genuinely verified Sandbox payment. Do not claim a real Sandbox payment if only injected fixtures were filmed.
3. Check every frame for private emails, browser tabs, capability URLs, access tokens, notifications, secrets, account identifiers and unnecessary personal information.
4. Ensure captions are accurate, any music is licensed, the final length remains under three minutes, and the story demonstrates a working product rather than static slides.
5. Upload the exact checked file to YouTube. Set visibility to **Public**, confirm it is processed, and check playback and runtime in a signed-out window. Unlisted or an authenticated preview is not a substitute.
6. Copy the verified public URL into Devpost, repeat the signed-out check and retain the final Devpost submission confirmation.

Do not record a genuinely private provider callback or merchant token in the video. Sanitized test footage and an accurately labeled simulation are preferable to leaking a real capability.

## Test evidence and limitations

The source verifier has synthetic fixtures for exact-length boundaries, 64-bit durations, missing media tracks/payload, impossible video dimensions, corrupted atoms, malformed time scales, suspicious container-versus-track duration mismatches, advisories, and optional decoder failures. An actual locally generated H.264/AAC MP4 was successfully inspected in Turn 115, decoded with the explicit FFmpeg witness in Turn 116, and rerun after the geometry fix in Turn 140. No actual RightsReceipt video was provided or watched in these turns.

The default parser is an MP4 structural release gate, **not** a comprehensive decoder, malware scanner, rights/privacy review or public YouTube availability proof. The optional decoder checks codec-level processing, not viewer satisfaction or financial claims. Unsupported or exotic fragmented/trackless media should be exported to a conventional H.264/AAC MP4 and independently watched before submission.

Decoder behavior is based on the upstream [FFmpeg command-line reference](https://ffmpeg.org/ffmpeg.html) and [protocol restrictions documentation](https://ffmpeg.org/ffmpeg-protocols.html). The actual checked release should be validated with its installed FFmpeg version before relying on the optional result.
