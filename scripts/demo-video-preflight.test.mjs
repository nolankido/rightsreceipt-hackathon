import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeDemoMp4, inspectDemoMp4 } from './demo-video-preflight.mjs';

function atom(type, payload, extended = false) {
  const h = Buffer.alloc(extended ? 16 : 8);
  h.writeUInt32BE(extended ? 1 : payload.length + 8, 0);
  h.write(type, 4, 'latin1');
  if (extended) h.writeBigUInt64BE(BigInt(payload.length + 16), 8);
  return Buffer.concat([h, payload]);
}

function durationPayload(seconds, version = 0, timeScale = 1000) {
  const b = Buffer.alloc(version === 0 ? 20 : 32);
  b[0] = version;
  if (version === 0) {
    b.writeUInt32BE(timeScale, 12);
    b.writeUInt32BE(Math.round(seconds * timeScale), 16);
  } else {
    b.writeUInt32BE(timeScale, 20);
    b.writeBigUInt64BE(BigInt(Math.round(seconds * timeScale)), 24);
  }
  return b;
}

function tkhd(width, height, version = 0) {
  const b = Buffer.alloc(version === 0 ? 84 : 96);
  b[0] = version;
  b.writeUInt32BE(Math.round(width * 65536), b.length - 8);
  b.writeUInt32BE(Math.round(height * 65536), b.length - 4);
  return atom('tkhd', b);
}

function track(type, seconds, { width = 1920, height = 1080, version = 0 } = {}) {
  const handler = Buffer.alloc(12);
  handler.write(type, 8, 'latin1');
  const mdia = atom('mdia', Buffer.concat([
    atom('mdhd', durationPayload(seconds, version)), atom('hdlr', handler),
  ]));
  return atom('trak', Buffer.concat([tkhd(type === 'vide' ? width : 0,
    type === 'vide' ? height : 0, version), mdia]));
}

function sample({ seconds = 163.8, audio = true, video = true,
  version = 0, width = 1920, height = 1080, trackSeconds,
  mediaPayload = true, extendedMdat = false, zeroMdat = false } = {}) {
  const children = [atom('mvhd', durationPayload(seconds, version))];
  if (video) children.push(track('vide', trackSeconds ?? seconds, { width, height, version }));
  if (audio) children.push(track('soun', trackSeconds ?? seconds, { version }));
  const moov = atom('moov', Buffer.concat(children));
  const ftyp = atom('ftyp', Buffer.from('isom\0\0\0\0isommp42', 'latin1'));
  const data = mediaPayload ? atom('mdat', Buffer.alloc(1024, 17), extendedMdat) : Buffer.alloc(0);
  if (zeroMdat) data.writeUInt32BE(0, 0);
  return Buffer.concat([ftyp, moov, data]);
}

function withVideo(bytes, fn) {
  const folder = mkdtempSync(join(tmpdir(), 'rr-video-'));
  const path = join(folder, 'demo.mp4');
  try { writeFileSync(path, bytes); return fn(path); }
  finally { rmSync(folder, { recursive: true, force: true }); }
}

test('valid 2:43.8 MP4 has mandatory video/audio tracks and no advisories', () => {
  withVideo(sample(), path => {
    const r = inspectDemoMp4(path);
    assert.equal(r.status, 'passed');
    assert.equal(r.durationMs, 163800);
    assert.equal(r.videoTrackCount, 1);
    assert.equal(r.audioTrackCount, 1);
    assert.equal(r.videoWidth, 1920);
    assert.equal(r.videoHeight, 1080);
    assert.deepEqual(r.blockers, []);
    assert.deepEqual(r.advisories, []);
    assert.ok(!JSON.stringify(r).includes(path));
  });
});

test('exactly three minutes and longer are blocked, not rounded down', () => {
  for (const seconds of [180, 180.001, 240]) {
    withVideo(sample({ seconds }), path => {
      const r = inspectDemoMp4(path);
      assert.equal(r.status, 'blocked');
      assert.ok(r.blockers.includes('duration_not_under_three_minutes'));
    });
  }
});

test('a longer media track blocks even when the movie header claims 2:30', () => {
  withVideo(sample({ seconds: 150, trackSeconds: 181 }), path => {
    const r = inspectDemoMp4(path);
    assert.equal(r.durationMs, 181000);
    assert.ok(r.blockers.includes('duration_not_under_three_minutes'));
  });
});

test('no audio, no video, or no media payload is blocked by fixed safe codes', () => {
  for (const [options, code] of [
    [{ audio: false }, 'audio_track_missing'],
    [{ video: false }, 'video_track_missing'],
    [{ mediaPayload: false }, 'media_payload_missing'],
  ]) {
    withVideo(sample(options), path => {
      assert.ok(inspectDemoMp4(path).blockers.includes(code));
    });
  }
});

test('video track with zero or subpixel dimensions cannot pass as merely low resolution', () => {
  for (const [width, height] of [[0, 1080], [1920, 0], [0, 0], [0.5, 1080]]) {
    withVideo(sample({ width, height }), path => {
      const result = inspectDemoMp4(path);
      assert.equal(result.status, 'blocked');
      assert.ok(result.blockers.includes('video_dimensions_invalid'));
    });
  }
});

test('a lower but positive frame resolution remains advisory rather than blocked', () => {
  withVideo(sample({ width: 640, height: 360 }), path => {
    const result = inspectDemoMp4(path);
    assert.equal(result.status, 'passed_with_advisories');
    assert.deepEqual(result.blockers, []);
    assert.ok(result.advisories.includes('video_resolution_below_720p'));
  });
});

test('target-length, lower-resolution and unusual aspect footage produce advisories', () => {
  withVideo(sample({ seconds: 175, width: 1024, height: 768 }), path => {
    const r = inspectDemoMp4(path);
    assert.equal(r.status, 'passed_with_advisories');
    assert.deepEqual(r.advisories, [
      'little_duration_margin', 'unusual_landscape_aspect_ratio',
      'video_resolution_below_720p',
    ]);
  });
});

test('version-one 64-bit media durations and extended box sizes remain parseable', () => {
  withVideo(sample({ seconds: 162.2, version: 1, extendedMdat: true }), path => {
    const r = inspectDemoMp4(path);
    assert.equal(r.status, 'passed');
    assert.equal(r.durationMs, 162200);
  });
});

test('zero-size terminal mdat box correctly means through EOF', () => {
  withVideo(sample({ zeroMdat: true }), path => {
    assert.equal(inspectDemoMp4(path).status, 'passed');
  });
});

test('malformed, truncated and absent MP4 structures fail without reading media bytes', () => {
  const invalid = [
    Buffer.from('not an mp4'),
    Buffer.alloc(100),
    sample().subarray(0, 75),
    (() => { const b = Buffer.from(sample()); b.writeUInt32BE(0x7fffffff, 0); return b; })(),
    (() => { const b = Buffer.from(sample()); b.writeUInt32BE(2, 0); return b; })(),
    (() => { const b = Buffer.from(sample()); b.write('xxxx', 4); return b; })(),
    (() => { const b = Buffer.from(sample()); b.writeBigUInt64BE(0xffffffffffffffffn, 8); b.writeUInt32BE(1, 0); return b; })(),
  ];
  for (const bytes of invalid) {
    withVideo(bytes, path => {
      assert.throws(() => inspectDemoMp4(path), { name: 'Error' });
    });
  }
});

test('zero time scale and unknown duration sentinels cannot pass', () => {
  const b = sample();
  const mvhd = b.indexOf(Buffer.from('mvhd')) + 4;
  assert.ok(mvhd > 4);
  for (const mutation of [bytes => bytes.writeUInt32BE(0, mvhd + 12),
    bytes => bytes.writeUInt32BE(0xffffffff, mvhd + 16)]) {
    const bytes = Buffer.from(b);
    mutation(bytes);
    withVideo(bytes, path => assert.throws(() => inspectDemoMp4(path), { code: 'invalid_mp4_structure' }));
  }
});

test('CLI refuses invalid inputs and does not reveal private paths', () => {
  const command = fileURLToPath(new URL('./demo-video-preflight.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [command, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /no dependencies or network/u);
  const bad = spawnSync(process.execPath, [command, '--file', '/secrets/private-not-real.mp4'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).code, 'video_file_unreadable');
  assert.ok(!bad.stdout.includes('/secrets'));
  const argumentsInvalid = spawnSync(process.execPath, [command], { encoding: 'utf8', timeout: 5000 });
  assert.equal(argumentsInvalid.status, 2);
  assert.equal(JSON.parse(argumentsInvalid.stdout).code, 'invalid_arguments');
  const duplicate = spawnSync(process.execPath,
    [command, '--file', '/private/file.mp4', '--decode-check', '--decode-check'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(duplicate.status, 2);
  assert.equal(JSON.parse(duplicate.stdout).code, 'invalid_arguments');
});

test('optional decode check maps exactly the first video and audio with no network protocols', () => {
  withVideo(sample(), path => {
    let invoked = 0;
    const result = decodeDemoMp4(path, {
      environment: { PATH: '/tools', PAYPAL_SANDBOX_CLIENT_SECRET: 'synthetic-secret-not-forwarded',
        FFREPORT: 'must-not-write-report', NODE_OPTIONS: '--inspect', SystemRoot: 'C:\\Windows' },
      spawn: (executable, args, options) => {
        invoked++;
        assert.equal(executable, 'ffmpeg');
        assert.ok(args.includes('-nostdin'));
        assert.ok(args.includes('-xerror'));
        assert.ok(args.includes('-protocol_whitelist'));
        assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file,pipe');
        assert.deepEqual(args.filter((part, i) => args[i - 1] === '-map'), ['0:v:0', '0:a:0']);
        assert.equal(args[args.indexOf('-i') + 1], path);
        assert.deepEqual(options.env, { PATH: '/tools', SystemRoot: 'C:\\Windows' });
        assert.equal(options.input, '');
        return { status: 0, stdout: 'frame=  42\nprogress=end\n', stderr: '' };
      },
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.decodedVideoFrames, 42);
    assert.equal(invoked, 1);
  });
});

test('decode gate treats missing FFmpeg, timeout, corrupt streams and zero frames as blockers', () => {
  const attempts = [
    [{ error: { code: 'ENOENT' } }, 'ffmpeg_not_installed'],
    [{ error: { code: 'ETIMEDOUT' } }, 'decode_check_timed_out'],
    [{ status: 1, stdout: 'frame=5\nprogress=continue\n' }, 'decode_check_failed'],
    [{ status: 0, stdout: 'frame=0\nprogress=end\n' }, 'decode_check_no_frames'],
    [{ status: 0, stdout: 'frame=99\nprogress=continue\n' }, 'decode_check_no_frames'],
  ];
  for (const [response, code] of attempts) {
    assert.throws(() => decodeDemoMp4('/any/private/video.mp4', { spawn: () => response }), { code });
  }
});

test('default video CLI is structural-only even when an FFmpeg decoder is available', () => {
  withVideo(sample(), path => {
    const command = fileURLToPath(new URL('./demo-video-preflight.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [command, '--file', path],
      { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, 'passed');
    assert.equal(body.decoder.status, 'not_requested');
    assert.ok(!result.stdout.includes(path));
  });
});

const realFfmpegRequested = process.env.RIGHTSRECEIPT_FFMPEG_TEST === '1';
const ffmpegAvailable = realFfmpegRequested && spawnSync('ffmpeg', ['-version'],
  { stdio: 'ignore', timeout: 5000 }).status === 0;

test('an actual FFmpeg-muxed H.264/AAC MP4 passes the dependency-free parser',
  { skip: !ffmpegAvailable }, () => {
    const folder = mkdtempSync(join(tmpdir(), 'rr-real-video-'));
    const file = join(folder, 'real.mp4');
    try {
      const run = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=24',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
        '-t', '1.0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
        '-movflags', '+faststart', '-y', file,
      ], { encoding: 'utf8', timeout: 30000 });
      assert.equal(run.status, 0, run.stderr);
      const result = inspectDemoMp4(file);
      assert.equal(result.status, 'passed');
      assert.equal(result.videoWidth, 1280);
      assert.equal(result.videoHeight, 720);
      assert.equal(result.videoTrackCount, 1);
      assert.equal(result.audioTrackCount, 1);
      assert.ok(result.durationMs > 0 && result.durationMs < 3000);
      const decoded = decodeDemoMp4(file);
      assert.equal(decoded.status, 'passed');
      assert.ok(decoded.decodedVideoFrames > 0);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
