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
const install = read(join(root, 'INSTALL.md'));

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

test('with transcript "boqo" an attended run asks once for all the held videos, after the plan and the report', () => {
  const held = skill.slice(skill.indexOf('## Held videos'), skill.indexOf('## A video with no captions'));
  assert.match(held, /Ask once, for all the held videos together/);
  assert.match(held, /minutes in all, <C> credits/);
  assert.match(held, /1 for each started 10 minutes, at least 1 a video/);
  assert.match(skill, /"transcript": "boqo"/);
  // A16b's review: get_transcript's {not_found: true} is final; the run stops polling and falls back in one line.
  assert.match(held, /\{not_found: true\}` is final, so stop polling/);
  // step 4 holds the video and goes on; step 8, after the report (step 7), asks
  assert.doesNotMatch(skill.slice(skill.indexOf('4. **Each video,**'), skill.indexOf('5. **Plan the posts.**')), /kind: "transcribe"|Yes\?/);
  assert.ok(skill.indexOf('7. **Report,**') < skill.indexOf('8. **Held videos**'));
  assert.ok(skill.indexOf('8. **Held videos**') < skill.indexOf('9. **Unlock and the timer.**'));
});

test('an unattended run (the timer\'s own prompt) never waits for the question', () => {
  assert.match(skill, /\/boqo-channel timer` is the daily timer's own prompt/);
  assert.match(skill, /prompt: "\/boqo-channel timer"/);
  assert.match(skill, /An\s+unattended run holds nothing and never asks/);
  assert.match(skill, /argument-hint: "\[setup \| timer\]"/);
  assert.match(install, /`\/boqo-channel timer`/);
});

test('the plan items carry the hook, and post.md posts it through the caption command, with its copy header', () => {
  const post = read(join(skillDir, 'post.md'));
  const synced = JSON.parse(read(join(root, 'engine', 'ENGINE.json'))).commit.slice(0, 7);
  assert.equal(post.split('\n')[0], `<!-- copied from boqo-ai/boqo-clips skills/boqo-clips/post.md @ ${synced}; keep in step -->`);
  assert.match(post, /boqo-upload\.mjs" caption --title/);
  assert.match(post, /Captions written by the agent/);
  assert.match(skill, /"hook": "<its hook, or null>"/);
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
