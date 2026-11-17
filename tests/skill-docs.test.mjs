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
// A doc's words with its line breaks as spaces, so a re-wrapped paragraph still matches.
const flat = (text) => text.replace(/\s+/g, ' ');

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
  // step 4 holds the video and goes on; step 9, after the report (step 7), asks
  assert.doesNotMatch(skill.slice(skill.indexOf('4. **Each video,**'), skill.indexOf('5. **Plan the posts.**')), /kind: "transcribe"|Yes\?/);
  assert.ok(skill.indexOf('7. **Report,**') < skill.indexOf('9. **Held videos**'));
});

// Final review, Minor 1: a run that waits on a person holds no lock, and the timer is refreshed before the wait.
test('the run releases the lock and refreshes the timer before the held question waits; a held yes takes its own lock', () => {
  const report = skill.indexOf('7. **Report,**');
  const unlock = skill.indexOf('8. **Unlock and the timer.**');
  const held = skill.indexOf('9. **Held videos**');
  assert.ok(report !== -1 && report < unlock && unlock < held && held < skill.indexOf('## Posting the plan'));
  const section = flat(skill.slice(skill.indexOf('## Held videos'), skill.indexOf('## A video with no captions')));
  assert.match(section, /\*\*A yes:\*\* take the lock \(The daily run, step 1/);
  assert.doesNotMatch(section, /when this run does not hold it/);
});

// Final review, Minor 2: a held video's try ends with a `held` line, which is not a failed try; a yes starts a new try.
test('a held video logs `held`, which is not a failed try, and a held yes starts a try of its own', () => {
  const log = flat(skill.slice(skill.indexOf('## The log'), skill.indexOf('## Rules')));
  assert.match(log, /`held` \(step 4\.2\)/);
  const step40 = flat(skill.slice(skill.indexOf('0. **Its earlier tries.**'), skill.indexOf('1. **Info, captions and comments.**')));
  assert.match(step40, /`no captions`, `held` or `limited`, none of which counts as failed/);
  const step42 = flat(skill.slice(skill.indexOf('2. **No captions**'), skill.indexOf('3. **Request.**')));
  assert.match(step42, /append its `held` line/);
  assert.doesNotMatch(step42, /stays open until Held videos ends it/);
  const section = flat(skill.slice(skill.indexOf('## Held videos'), skill.indexOf('## A video with no captions')));
  assert.match(section, /append its `started` line/);
});

// Final review, Important 1: `fetch info` writes the transcript's language (the caption track's) beside the words, and
// select-request reads it; a daily run that deleted it would label every captioned non-English video `en`.
test('step 4.1 removes no file that fetch info writes, and the request takes the language from transcript-language.txt', () => {
  const fetchTool = read(join(root, 'tools', 'fetch.mjs'));
  const infoDoc = fetchTool.slice(fetchTool.indexOf('fetch.mjs info'), fetchTool.indexOf('fetch.mjs comments'));
  const writes = [...new Set([...infoDoc.matchAll(/<d>\/([\w.-]+)/g)].map((m) => m[1]))];
  for (const f of ['info.json', 'words.json', 'segments.json', 'transcript-language.txt']) assert.ok(writes.includes(f), `fetch info writes ${f}`);
  const step41 = skill.slice(skill.indexOf('1. **Info, captions and comments.**'), skill.indexOf('3. **Request.**'));
  assert.ok(step41.includes('fetch.mjs" info'));
  for (const line of step41.split('\n').filter((l) => /\brm\b|-delete\b/.test(l))) {
    for (const f of writes) assert.ok(!line.includes(f), `step 4.1 deletes ${f}, which fetch info writes: ${line.trim()}`);
  }
  const step43 = flat(skill.slice(skill.indexOf('3. **Request.**'), skill.indexOf('4. **Select.**')));
  assert.match(step43, /The language comes from `<video>\/transcript-language\.txt`/);
});

// Final review, Important 3: the redo's new title and hook reach the post, which takes them from the plan item.
test('a redo of the title or hook writes them into the open plan item too, then validates the plan', () => {
  const redo = skill.slice(skill.indexOf('## Redo one clip'));
  const bullet = flat(redo.slice(redo.indexOf('**Another title or hook:**'), redo.indexOf('**Other edges')));
  assert.match(bullet, /`plan\.mjs pending`/);
  assert.match(bullet, /write the new `title` and `hook` into that item, keeping every other key/);
  assert.match(bullet, /node "\$HOME\/\.boqo-channel\/tools\/plan\.mjs" validate "<plan>"/);
});

// Final review, Important 2: a second plan for a posting day takes the first into account.
test('step 5 caps a channel at perDay.max less what the day holds, and schedules around the taken times', () => {
  const step5 = flat(skill.slice(skill.indexOf('5. **Plan the posts.**'), skill.indexOf('6. **Post,**')));
  assert.match(step5, /plan\.mjs" day --date <YYYY-MM-DD>/);
  assert.match(step5, /`perDay\.max` less its `n`/);
  assert.match(step5, /--avoid <HH:MM>,/);
  const retime = flat(skill.slice(skill.indexOf('3. **The times.**'), skill.indexOf('4. **Post them**')));
  assert.match(retime, /--except "<plan>"/);
  assert.match(retime, /--avoid/);
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

// Final review, Minor 12: a doc's command is the tool's own: its subcommand and every flag are ones the tool reads
// (the tool's source, or the lib/ module or boqo-upload-lib it hands its arguments to). A re-sync that renames either
// fails here, not in a person's run.
test('every command a doc gives uses a subcommand and flags its tool reads', () => {
  const sources = (tool) => {
    const code = read(join(root, 'tools', `${tool}.mjs`));
    const libs = [...code.matchAll(/from ["']\.\.\/(lib\/[a-z-]+\.mjs|engine\/boqo-upload-lib\.mjs)["']/g)].map((m) => read(join(root, m[1])));
    return [code, ...libs].join('\n');
  };
  const quoted = (code, word) => code.includes(`'${word}'`) || code.includes(`"${word}"`);
  let subs = 0;
  let flags = 0;
  for (const [f, text] of docs) {
    const joined = text.replace(/\\\n\s*/g, ' ');
    const commands = [
      ...[...joined.matchAll(/node "\$HOME\/\.boqo-channel\/tools\/([a-z-]+)\.mjs"([^\n`]*)/g)].map((m) => [m[1], m[2], m[0]]),
      ...[...joined.matchAll(/`([a-z-]+)\.mjs ([^`\n]*)`/g)].map((m) => [m[1], ` ${m[2]}`, m[0]]),
    ];
    for (const [tool, args, cmd] of commands) {
      assert.ok(existsSync(join(root, 'tools', `${tool}.mjs`)), `${f}: no tool ${tool}.mjs: ${cmd}`);
      const code = sources(tool);
      const first = args.trim().split(/\s+/)[0];
      if (/^[a-z][a-z-]*$/.test(first)) {
        assert.ok(quoted(code, first), `${f}: ${tool}.mjs has no subcommand ${first}: ${cmd}`);
        subs++;
      }
      for (const flag of args.match(/(?<![\w-])--[a-z][a-z-]*/g) ?? []) {
        assert.ok(quoted(code, flag) || quoted(code, flag.slice(2)), `${f}: ${tool}.mjs does not read ${flag}: ${cmd}`);
        flags++;
      }
    }
  }
  assert.ok(subs > 30, `only ${subs} subcommands checked`);
  assert.ok(flags > 40, `only ${flags} flags checked`);
});

test('INSTALL asks once, installs with npm ci --omit=dev --ignore-scripts, then runs the doctor', () => {
  const install = read(join(root, 'INSTALL.md'));
  const ci = install.indexOf('npm ci --omit=dev --ignore-scripts');
  assert.ok(ci !== -1);
  assert.ok(install.includes('258 MB'));
  assert.ok(ci < install.indexOf('doctor.mjs" --whisper optional'));
});

// Final review, Minor 11: an install from before the packages never said yes to them, so an update asks first.
test('INSTALL Updating asks before it installs the packages when an older install has none', () => {
  const upd = flat(install.slice(install.indexOf('## Updating'), install.indexOf('## Removing')));
  assert.doesNotMatch(upd, /covers it/);
  const check = upd.indexOf('ls -d "$HOME/.boqo-channel/node_modules"');
  const ask = upd.search(/no `node_modules` .*ask step 4's question first/);
  assert.ok(check !== -1 && check < ask && ask < upd.indexOf('npm ci'), 'the node_modules check, then the question, then npm ci');
});

// Final review, Minor 9: the step 2 sweep deletes every upload reply a posting or a held video's transcript left (live
// signed URLs). Each reply file the docs write sits at a depth below runs/ given by its folder: <run> is 1 level down,
// <video> (<run>/<video id>) 2; the sweep's depths and its name pattern must take every one of them.
test('the step 2 sweep reaches every upload reply file the docs write', () => {
  const step2 = skill.slice(skill.indexOf('2. **Brand and config.**'), skill.indexOf('3. **New videos.**'));
  const m = /find "<home>\/boqo-channel\/runs" -mindepth (\d+) -maxdepth (\d+) -type f -name '([^']+)' -delete/.exec(step2);
  assert.ok(m, 'step 2 sweeps the runs folder for upload replies');
  const [min, max] = [Number(m[1]), Number(m[2])];
  const glob = new RegExp(`^${m[3].replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`);
  const levels = { '<run>': 1, '<video>': 2 };
  const replies = new Set();
  for (const [, text] of docs) for (const r of text.matchAll(/(<run>|<video>)\/(upload-[^`"\s/]*\.json)/g)) replies.add(`${r[1]}/${r[2]}`);
  assert.ok(replies.has('<run>/upload-<k>.json') && replies.has('<video>/upload-audio.json'), [...replies].join(', '));
  for (const reply of replies) {
    const [folder, name] = reply.split('/');
    const depth = levels[folder] + 1;
    assert.ok(min <= depth && depth <= max, `${reply} sits ${depth} deep; the sweep takes ${min} to ${max}`);
    assert.match(name.replace(/<k>/g, '1'), glob, `${reply} does not match the sweep's '${m[3]}'`);
  }
});
