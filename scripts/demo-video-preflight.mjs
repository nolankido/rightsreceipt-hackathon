#!/usr/bin/env node
/** Read-only, dependency-free MP4 metadata gate for the sub-three-minute judge demo. */
import { closeSync, lstatSync, openSync, readSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'rightsreceipt-demo-video-preflight-v1';
const LIMIT_MS = 180000;
const MAX_BOXES = 10000;
const LIMITATION = 'MP4 structural metadata only. This does not establish that frames/audio decode, narration is audible, rights are accurate, private details are absent, or YouTube playback is public.';
const DECODE_LIMITATION = 'FFmpeg decoding verifies video frames and mapped audio processing, not whether audio is audible, scenes are readable, claims are true, private details are absent or YouTube playback is public.';

class VideoError extends Error {
  constructor(code) { super('Demo video metadata validation failed.'); this.code = code; }
}

function requireBytes(fd, position, length) {
  const buffer = Buffer.alloc(length);
  for (let offset = 0; offset < length;) {
    const read = readSync(fd, buffer, offset, length - offset, position + offset);
    if (!read) throw new VideoError('invalid_mp4_structure');
    offset += read;
  }
  return buffer;
}

function readBox(fd, position, parentEnd) {
  if (parentEnd - position < 8) throw new VideoError('invalid_mp4_structure');
  const first = requireBytes(fd, position, 8);
  const type = first.toString('latin1', 4, 8);
  const shortSize = first.readUInt32BE(0);
  let size = shortSize, header = 8;
  if (shortSize === 1) {
    if (parentEnd - position < 16) throw new VideoError('invalid_mp4_structure');
    const extended = requireBytes(fd, position + 8, 8).readBigUInt64BE();
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new VideoError('invalid_mp4_structure');
    size = Number(extended);
    header = 16;
  } else if (shortSize === 0) {
    size = parentEnd - position;
  }
  if (size < header || size > parentEnd - position) throw new VideoError('invalid_mp4_structure');
  return { type, start: position, payload: position + header, end: position + size };
}

function walk(fd, start, end, context, visitor) {
  let position = start;
  while (position < end) {
    if (++context.boxes > MAX_BOXES) throw new VideoError('invalid_mp4_structure');
    const box = readBox(fd, position, end);
    visitor(box);
    position = box.end;
  }
}

function durationOf(fd, box) {
  const version = requireBytes(fd, box.payload, 1)[0];
  if (version !== 0 && version !== 1) throw new VideoError('invalid_mp4_structure');
  const minimum = version === 0 ? 20 : 32;
  if (box.end - box.payload < minimum) throw new VideoError('invalid_mp4_structure');
  const data = requireBytes(fd, box.payload, minimum);
  const scale = data.readUInt32BE(version === 0 ? 12 : 20);
  const ticks = version === 0 ? BigInt(data.readUInt32BE(16)) : data.readBigUInt64BE(24);
  if (!scale || !ticks || ticks === 0xffffffffn || ticks === 0xffffffffffffffffn) {
    throw new VideoError('invalid_mp4_structure');
  }
  const milliseconds = (ticks * 1000n + BigInt(scale) - 1n) / BigInt(scale);
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw new VideoError('invalid_mp4_structure');
  return Number(milliseconds);
}

function handlerOf(fd, box) {
  if (box.end - box.payload < 12) throw new VideoError('invalid_mp4_structure');
  return requireBytes(fd, box.payload + 8, 4).toString('latin1');
}

function dimensionsOf(fd, box) {
  if (box.end - box.payload < 84) throw new VideoError('invalid_mp4_structure');
  const version = requireBytes(fd, box.payload, 1)[0];
  if (version > 1 || box.end - box.payload < (version === 1 ? 96 : 84)) {
    throw new VideoError('invalid_mp4_structure');
  }
  const data = requireBytes(fd, box.end - 8, 8);
  return { width: data.readUInt32BE(0) / 65536, height: data.readUInt32BE(4) / 65536 };
}

function parseTrack(fd, box, context) {
  let dimensions = null, durationMs = null, handler = null;
  walk(fd, box.payload, box.end, context, child => {
    if (child.type === 'tkhd') {
      if (dimensions) throw new VideoError('invalid_mp4_structure');
      dimensions = dimensionsOf(fd, child);
    }
    if (child.type !== 'mdia') return;
    walk(fd, child.payload, child.end, context, item => {
      if (item.type === 'mdhd') {
        if (durationMs !== null) throw new VideoError('invalid_mp4_structure');
        durationMs = durationOf(fd, item);
      }
      if (item.type === 'hdlr') {
        if (handler !== null) throw new VideoError('invalid_mp4_structure');
        handler = handlerOf(fd, item);
      }
    });
  });
  if (handler === 'vide' || handler === 'soun') {
    if (durationMs === null || dimensions === null) throw new VideoError('invalid_mp4_structure');
    return { type: handler, durationMs, dimensions };
  }
  return null;
}

function parseMovie(fd, box, context) {
  let movieDurationMs = null;
  const tracks = [];
  walk(fd, box.payload, box.end, context, child => {
    if (child.type === 'mvhd') {
      if (movieDurationMs !== null) throw new VideoError('invalid_mp4_structure');
      movieDurationMs = durationOf(fd, child);
    }
    if (child.type === 'trak') {
      const track = parseTrack(fd, child, context);
      if (track) tracks.push(track);
    }
  });
  if (movieDurationMs === null) throw new VideoError('movie_header_missing');
  return { movieDurationMs, tracks };
}

/** Scan only box headers and a few timing/track records; skip media payload entirely. */
export function inspectDemoMp4(file) {
  let fd;
  try {
    if (typeof file !== 'string' || !file || file.length > 4096) throw new Error();
    const stat = lstatSync(resolve(file));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 32
      || !Number.isSafeInteger(stat.size)) throw new Error();
    fd = openSync(resolve(file), 'r');
    const context = { boxes: 0 };
    let foundFtyp = false, movie = null, hasPayload = false;
    walk(fd, 0, stat.size, context, box => {
      if (box.type === 'ftyp') {
        if (foundFtyp || box.end - box.payload < 8) throw new VideoError('invalid_mp4_structure');
        foundFtyp = true;
      }
      if (box.type === 'moov') {
        if (movie) throw new VideoError('invalid_mp4_structure');
        movie = parseMovie(fd, box, context);
      }
      if (box.type === 'mdat' && box.end - box.payload > 0) hasPayload = true;
    });
    if (!foundFtyp || !movie) throw new VideoError('movie_header_missing');
    const videoTracks = movie.tracks.filter(track => track.type === 'vide');
    const audioTracks = movie.tracks.filter(track => track.type === 'soun');
    const durationMs = Math.max(movie.movieDurationMs,
      ...movie.tracks.map(track => track.durationMs));
    const width = videoTracks[0]?.dimensions.width ?? 0;
    const height = videoTracks[0]?.dimensions.height ?? 0;
    const blockers = [];
    if (!videoTracks.length) blockers.push('video_track_missing');
    if (!audioTracks.length) blockers.push('audio_track_missing');
    if (!hasPayload) blockers.push('media_payload_missing');
    // A declared video handler without a full pixel of frame dimensions is
    // not an actionable judge demo. Lower but positive resolutions are advisories.
    if (videoTracks.length && (width < 1 || height < 1)) blockers.push('video_dimensions_invalid');
    if (durationMs >= LIMIT_MS) blockers.push('duration_not_under_three_minutes');
    const advisories = [];
    if (durationMs >= 170000 && durationMs < LIMIT_MS) advisories.push('little_duration_margin');
    if (videoTracks.length && (width < 1280 || height < 720)) advisories.push('video_resolution_below_720p');
    if (videoTracks.length && height > 0 && (width / height < 1.4 || width / height > 2.1)) {
      advisories.push('unusual_landscape_aspect_ratio');
    }
    if (stat.size > 500 * 1024 * 1024) advisories.push('large_video_upload');
    return Object.freeze({ schemaVersion: SCHEMA,
      status: blockers.length ? 'blocked' : advisories.length ? 'passed_with_advisories' : 'passed',
      durationMs, fileBytes: stat.size, videoTrackCount: videoTracks.length,
      audioTrackCount: audioTracks.length, videoWidth: width, videoHeight: height,
      blockers: blockers.sort(), advisories: advisories.sort(), limitation: LIMITATION });
  } catch (error) {
    if (error instanceof VideoError) throw error;
    throw new VideoError('video_file_unreadable');
  } finally { if (fd !== undefined) closeSync(fd); }
}

function decoderEnvironment(environment) {
  const allow = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']);
  return Object.fromEntries(Object.entries(environment).filter(([key]) => allow.has(key.toUpperCase())));
}

/** Optional real decoder pass; never executes without explicit --decode-check. */
export function decodeDemoMp4(file, { spawn = spawnSync, environment = process.env } = {}) {
  const path = resolve(file);
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror',
    '-protocol_whitelist', 'file,pipe', '-i', path,
    '-map', '0:v:0', '-map', '0:a:0',
    '-stats_period', '10', '-progress', 'pipe:1', '-f', 'null', '-',
  ];
  const result = spawn('ffmpeg', args, { encoding: 'utf8', windowsHide: true,
    timeout: 6 * 60 * 1000, maxBuffer: 1024 * 1024,
    env: decoderEnvironment(environment), input: '',
  });
  if (result?.error?.code === 'ENOENT') throw new VideoError('ffmpeg_not_installed');
  if (result?.error?.code === 'ETIMEDOUT') throw new VideoError('decode_check_timed_out');
  if (result?.error || result?.status !== 0 || typeof result.stdout !== 'string') {
    throw new VideoError('decode_check_failed');
  }
  // An exit code of zero is insufficient if no decodable video frames were emitted.
  const frameCounts = [...result.stdout.matchAll(/^frame=\s*(\d+)\s*$/gmu)];
  const lastFrames = frameCounts.length ? Number(frameCounts.at(-1)[1]) : 0;
  if (!result.stdout.includes('progress=end') || !Number.isSafeInteger(lastFrames) || lastFrames < 1) {
    throw new VideoError('decode_check_no_frames');
  }
  return Object.freeze({ status: 'passed', decodedVideoFrames: lastFrames });
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/demo-video-preflight.mjs --file PATH_TO_FINAL_MP4 [--decode-check]\nDefault: read-only ISO BMFF timing/track/size check, no dependencies or network. Optional --decode-check requires local FFmpeg and checks actual video decoding without network access or uploads.\n');
    return 0;
  }
  const decodeRequested = args.length === 3 && args[2] === '--decode-check';
  if ((!decodeRequested && args.length !== 2) || args[0] !== '--file'
    || !args[1] || args[1].startsWith('--') || (args.length === 3 && !decodeRequested)) {
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'blocked', code: 'invalid_arguments', limitation: LIMITATION }) + '\n');
    return 2;
  }
  try {
    const result = inspectDemoMp4(args[1]);
    let decoder = { status: 'not_requested' };
    if (decodeRequested && result.status !== 'blocked') decoder = decodeDemoMp4(args[1]);
    process.stdout.write(JSON.stringify({ ...result, decoder, limitation: decodeRequested ? DECODE_LIMITATION : LIMITATION }) + '\n');
    return result.status === 'blocked' ? 1 : 0;
  } catch (error) {
    const code = error instanceof VideoError ? error.code : 'video_preflight_failed';
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'blocked', code, limitation: LIMITATION }) + '\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
