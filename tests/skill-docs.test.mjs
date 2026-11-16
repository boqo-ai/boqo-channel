// The skill's docs are read by an agent that runs what they say: every tool they name must exist here, none may
// still describe the v0.1 picks flow, and the three files copied from boqo-clips must say where they came from.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(root, 'skills', 'boqo-channel');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const docs = readdirSync(skillDir).filter((f) => f.endsWith('.md')).map((f) => [f, read(join(skillDir, f))]);
docs.push(['INSTALL.md', read(join(root, 'INSTALL.md'))]);
const skill = read(join(skillDir, 'SKILL.md'));

test('every tool a doc runs exists in tools/', () => {
  let seen = 0;
  for (const [f, text] of docs) {
    for (const m of text.matchAll(/node "\$HOME\/\.boqo-channel\/tools\/([a-z-]+\.mjs)"/g)) {
      seen++;
      assert.ok(existsSync(join(root, 'tools', m[1])), `${f} runs tools/${m[1]}, which does not exist`);
    }
  }
  assert.ok(seen > 20);
  for (const tool of ['select-request', 'select-check', 'clips', 'stranger', 'panels', 'transcript-boqo', 'plan']) {
    assert.ok(docs.some(([, t]) => t.includes(`tools/${tool}.mjs"`)), `no doc runs ${tool}.mjs`);
  }
});

test('no doc names boqo-clips paths or the v0.1 picks flow', () => {
  for (const [f, text] of docs) {
    const body = text.replace(/^<!-- copied from boqo-ai\/boqo-clips .*-->\n/, '');
    assert.doesNotMatch(body, /\.boqo-clips/, `${f} names ~/.boqo-clips`);
    assert.doesNotMatch(body, /picks\.json|checked\.json|picks-check|--picks|--sections|transcript\.md|redo-picks/, `${f} still describes the picks flow`);
  }
});

test('select.md, stranger.md and panels.md carry their copy header first, then their port headers', () => {
  for (const f of ['select.md', 'stranger.md', 'panels.md']) {
    const lines = read(join(skillDir, f)).split('\n');
    assert.match(lines[0], new RegExp(`^<!-- copied from boqo-ai/boqo-clips skills/boqo-clips/${f.replace('.', '\\.')} @ [0-9a-f]{7,}; keep in step -->$`), f);
    assert.match(lines[1], /^<!-- ported from boqo-ai\/boqo .* @ [0-9a-f]{9}; keep in step -->$/, f);
  }
});

test('with transcript "boqo" the run asks once for all the day\'s videos, naming minutes and credits', () => {
  assert.match(skill, /ask once, for all of them\s+together/);
  assert.match(skill, /minutes in all, <C> credits/);
  assert.match(skill, /1 for each started 10 minutes, at least 1 a\s+video/);
  assert.match(skill, /"transcript": "boqo"/);
  // A16b's review: get_transcript's {not_found: true} is final; the run stops polling and falls back in one line.
  assert.match(skill, /\{not_found: true\}` is final, so stop polling/);
});

test('the plan is taken from clips.json in final order, rendered clips only', () => {
  assert.match(skill, /plan\.mjs" clips /);
  assert.match(skill, /never a clip that was\s+kept but not rendered/);
});

test('INSTALL asks once, installs with npm ci --omit=dev --ignore-scripts, then runs the doctor', () => {
  const install = read(join(root, 'INSTALL.md'));
  const ci = install.indexOf('npm ci --omit=dev --ignore-scripts');
  assert.ok(ci !== -1);
  assert.ok(install.includes('258 MB'));
  assert.ok(ci < install.indexOf('doctor.mjs" --whisper optional'));
});
