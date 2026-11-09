#!/usr/bin/env node
/** Offline structural guard for the final Devpost copy. Not a publication check. */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS = resolve(ROOT, 'docs', 'submission');
const DEFAULT_FILE = 'docs/submission/DEVPOST_DRAFT.md';
const SCHEMA = 'rightsreceipt-devpost-copy-preflight-v1';
const REQUIRED = Object.freeze([
  'Project title', 'Tagline', 'Short description', 'Inspiration',
  'What it does', 'How AI is used', 'How PayPal is used', 'How we built it',
  'Challenges', 'Accomplishments', 'What we learned', "What's next",
  'Functional demo', 'Video', 'Tools used',
]);
const LIMITATION = 'Passing checks structure and plausible public-link syntax only. It does not prove application functionality, payment, public URL reachability, media duration, factual accuracy or a submitted Devpost entry.';

/** Remove Markdown content that is not rendered as prose or headings. */
function visibleMarkdown(input) {
  const withoutComments = input.replace(/<!--[\s\S]*?-->|<!--[\s\S]*$/gu,
    comment => comment.replace(/[^\r\n]/gu, ' '));
  let fence = null;
  return withoutComments.split(/\r?\n/u).map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character
        && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) {
        fence = null;
      }
      return '';
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      return '';
    }
    return line;
  }).join('\n');
}

function sectionsOf(input) {
  const sections = new Map();
  const duplicates = new Set();
  const boundaries = [...input.matchAll(/^## ([^\r\n]+)\r?$/gmu)];
  for (let i = 0; i < boundaries.length; i++) {
    const current = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1].index : input.length;
    const name = current[1].trim();
    if (sections.has(name)) duplicates.add(name);
    sections.set(name, input.slice(current.index + current[0].length, end).trim());
  }
  return { sections, duplicates };
}

function declaredValue(body, label) {
  const line = body.split(/\r?\n/u).find(value => value.trim().startsWith(label));
  return line ? line.trim().slice(label.length).trim() : '';
}

function plainUrl(value) {
  if (typeof value !== 'string' || value.length > 350) return null;
  const markdown = /^\[[^\]\r\n]{1,120}\]\((https:\/\/[^()\s]+)\)$/u.exec(value);
  const raw = markdown ? markdown[1] : value;
  if (!/^https:\/\/[^\s]+$/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    return url;
  } catch { return null; }
}

function publicGithub(value) {
  const url = plainUrl(value);
  if (!url || url.hostname !== 'github.com' || url.search) return false;
  const pieces = url.pathname.split('/').filter(Boolean);
  return pieces.length === 2
    && pieces.every(part => /^[A-Za-z0-9_.-]{1,100}$/u.test(part))
    && pieces.join('/').toLowerCase() !== 'nolankido/rightsreceipt'
    && !pieces.some(part => /^(?:owner|repo|placeholder|your[-_]?repo|example)$/iu.test(part));
}

function publicVideo(value) {
  const url = plainUrl(value);
  if (!url) return false;
  if (url.hostname === 'youtu.be') {
    return !url.search && /^\/[A-Za-z0-9_-]{11}$/u.test(url.pathname);
  }
  if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return false;
  const parts = [...url.searchParams.entries()];
  return url.pathname === '/watch' && parts.length === 1 && parts[0][0] === 'v'
    && /^[A-Za-z0-9_-]{11}$/u.test(parts[0][1]);
}

export function evaluateDevpostCopy(input) {
  const blockers = new Set();
  if (typeof input !== 'string' || input.length < 100 || input.length > 65536) {
    blockers.add('copy_invalid');
  }
  const content = typeof input === 'string' ? input : '';
  const { sections, duplicates } = sectionsOf(visibleMarkdown(content));
  for (const name of REQUIRED) {
    if (!sections.get(name) || sections.get(name).length < 4) blockers.add('required_section_missing');
    if (duplicates.has(name)) blockers.add('duplicate_required_section');
  }
  const repo = declaredValue(sections.get('Functional demo') ?? '', '**Required public repository:**');
  const video = declaredValue(sections.get('Video') ?? '', 'YouTube:');
  if (!publicGithub(repo)) blockers.add('public_repository_url_missing_or_invalid');
  if (!publicVideo(video)) blockers.add('public_video_url_missing_or_invalid');
  if (/\[(?:PUBLIC|REPLACE|TBD|TODO)_[^\]\r\n]{0,100}\]|REPLACE_WITH_|YOUR_PUBLIC_RELEASE_REPOSITORY/iu.test(content)) {
    blockers.add('unresolved_placeholders');
  }
  if (!/PayPal/iu.test(sections.get('How PayPal is used') ?? '')
    || !/\bAI\b/u.test(sections.get('How AI is used') ?? '')
    || !/PayPal/iu.test(sections.get('Tools used') ?? '')) {
    blockers.add('platform_and_ai_disclosure_missing');
  }
  return Object.freeze({
    schemaVersion: SCHEMA,
    status: blockers.size ? 'blocked' : 'copy_ready_for_manual_review',
    blockers: [...blockers].sort(),
    checks: {
      requiredSections: REQUIRED.length,
      publicRepositoryUrlPlausible: publicGithub(repo),
      publicVideoUrlPlausible: publicVideo(video),
    },
    limitation: LIMITATION,
  });
}

function safeCopyFile(path) {
  if (typeof path !== 'string' || !path || path.length > 4096) throw new Error();
  const absolute = resolve(ROOT, path);
  const rel = relative(DOCS, absolute);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error();
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 65536) throw new Error();
  const actual = realpathSync(absolute);
  const realDocs = realpathSync(DOCS);
  const realRel = relative(realDocs, actual);
  if (!realRel || realRel === '..' || realRel.startsWith('..' + sep) || isAbsolute(realRel)) throw new Error();
  return readFileSync(absolute, 'utf8');
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/devpost-copy-preflight.mjs [--file docs/submission/DEVPOST_DRAFT.md]\nOffline copy structure and URL syntax checks only; no network, submission or credential use.\n');
    return 0;
  }
  const file = args.length === 0 ? DEFAULT_FILE
    : args.length === 2 && args[0] === '--file' && args[1] && !args[1].startsWith('--')
      ? args[1] : null;
  if (!file) {
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'blocked',
      blockers: ['invalid_arguments'], limitation: LIMITATION }) + '\n');
    return 2;
  }
  try {
    const outcome = evaluateDevpostCopy(safeCopyFile(file));
    process.stdout.write(JSON.stringify(outcome) + '\n');
    return outcome.status === 'blocked' ? 1 : 0;
  } catch {
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'blocked',
      blockers: ['copy_file_unreadable'], limitation: LIMITATION }) + '\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
