import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { countPosted, dayPosts, localPath, pending, runCli, stamp, validatePlan } from "../lib/plan.mjs";

const TOOL = fileURLToPath(new URL("../tools/plan.mjs", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "boqo channel plan-")); // a space, as in a real home folder
const T1 = new Date("2026-11-15T22:00:00.000Z");
const T2 = new Date("2026-11-16T08:00:00.000Z");
const item = (k, date = "2026-11-16") => ({
  clip: `/x/clip-0${k}.mp4`, title: `Clip ${k}`, channel: "@x", accountIds: ["a"], handles: ["@a"], when: { date, time: "09:00" },
});
function writeRun(home, name, items) {
  const dir = join(home, "boqo-channel", "runs", name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "plan.json");
  writeFileSync(path, JSON.stringify(items, null, 2));
  return path;
}
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

test("posted stamps one item with an ISO time and never stamps it twice", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1), item(2)]);
  assert.deepEqual(stamp(p, "2", "posted", T1), { item: 2, posted: T1.toISOString() });
  assert.equal(read(p)[1].posted, T1.toISOString());
  assert.equal(read(p)[0].posted, undefined);
  // a second yes, a resumed session: the first stamp stands
  assert.deepEqual(stamp(p, "2", "posted", T2), { item: 2, posted: T1.toISOString(), already: true });
  assert.equal(read(p)[1].posted, T1.toISOString());
  // the write is atomic: no temp file is left beside the plan
  assert.deepEqual(readdirSync(join(p, "..")), ["plan.json"]);
});

test("skip stamps one item or every open one, and never unposts", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1), item(2), item(3)]);
  stamp(p, "1", "posted", T1);
  assert.deepEqual(stamp(p, "2", "skipped", T1), { item: 2, skipped: T1.toISOString() });
  assert.deepEqual(stamp(p, "all", "skipped", T2), { skipped: [3], already: [1, 2] });
  const items = read(p);
  assert.equal(items[0].posted, T1.toISOString());
  assert.equal(items[0].skipped, undefined);
  assert.equal(items[2].skipped, T2.toISOString());
  // posting a skipped item later, on the person's ask, replaces the skip
  assert.deepEqual(stamp(p, "3", "posted", T2), { item: 3, posted: T2.toISOString() });
  assert.equal(read(p)[2].skipped, undefined);
});

test("stamp refuses what is not an item of a plan", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  for (const n of ["0", "2", "x", "1.5", "-1"]) assert.throws(() => stamp(p, n, "posted", T1), /no item/);
  assert.throws(() => stamp(p, "all", "posted", T1), /only skip/);
  assert.throws(() => stamp(join(home, "nope.json"), "1", "posted", T1), /no plan/);
  writeFileSync(p, "{not json");
  assert.throws(() => stamp(p, "1", "posted", T1), /not valid JSON/);
  writeFileSync(p, '{"a": 1}');
  assert.throws(() => stamp(p, "1", "posted", T1), /array/);
});

test("pending is the newest plan only: an older plan is never offered again", () => {
  const home = tmp();
  assert.deepEqual(pending(home), { plan: null, items: [], lines: [] });
  const older = writeRun(home, "20261114-2113", [item(1), item(2)]);
  assert.equal(pending(home).plan, older);
  const newer = writeRun(home, "20261115-2113", [item(1), item(2), item(3)]);
  mkdirSync(join(home, "boqo-channel", "runs", "20261116-0900")); // a run that stopped before its plan
  assert.deepEqual(pending(home).plan, newer);
  assert.deepEqual(pending(home).items, [1, 2, 3]);
  stamp(newer, "1", "posted", T1);
  stamp(newer, "3", "skipped", T1);
  assert.deepEqual(pending(home).items, [2]);
  stamp(newer, "2", "posted", T1);
  // the older plan still has open items, but a newer plan replaced it: nothing waits
  assert.deepEqual(pending(home), { plan: null, items: [], lines: [] });
  // an empty newest plan replaces an open one too
  const home2 = tmp();
  writeRun(home2, "20261114-2113", [item(1)]);
  writeRun(home2, "20261115-2113", []);
  assert.deepEqual(pending(home2), { plan: null, items: [], lines: [] });
});

test("a newest plan moved aside to plan.json.bad hides the older plans too", () => {
  const home = tmp();
  writeRun(home, "20261114-2113", [item(1)]); // an older plan with an open item
  const newer = writeRun(home, "20261115-2113", [item(1), item(2)]);
  stamp(newer, "1", "posted", T1); // its stamp then failed for item 2's post: the plan is moved aside
  renameSync(newer, `${newer}.bad`);
  assert.deepEqual(pending(home), { plan: null, items: [], lines: [] });
  // a later run's plan is the newest again
  const later = writeRun(home, "20261116-2113", [item(1)]);
  assert.equal(pending(home).plan, later);
});

test("pending lists its open items in the report's words, to ask about them again", () => {
  const home = tmp();
  const two = { ...item(2), accountIds: ["a", "b"], handles: ["@a", "@b"], when: { date: "2026-11-16", time: "15:00" } };
  const p = writeRun(home, "20261115-2113", [item(1), two, item(3)]);
  stamp(p, "1", "posted", T1);
  assert.deepEqual(pending(home), {
    plan: p,
    items: [2, 3],
    lines: ["2026-11-16 15:00 · @a, @b · Clip 2", "2026-11-16 09:00 · @a · Clip 3"],
  });
});

test("a damaged plan's error says to move it aside, never to delete it", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  for (const text of ["{not json", '{"a": 1}', "[1]"]) {
    writeFileSync(p, text);
    for (const fn of [() => pending(home), () => countPosted("2026-11-16", home), () => stamp(p, "1", "posted", T1)]) {
      assert.throws(fn, (e) => e.message.includes(p) && e.message.includes("move it aside to plan.json.bad") && !/delete it/.test(e.message), text);
    }
  }
});

test("validate passes a well-formed plan, and an empty one", () => {
  const home = tmp();
  const dir = join(home, "boqo-channel", "runs", "20261115-2113", "vid00000001", "out");
  mkdirSync(dir, { recursive: true });
  const clip = (k) => { const f = join(dir, `clip-0${k}.mp4`); writeFileSync(f, "x"); return f; };
  const moment = (k) => ({ video: "vid00000001", start: k * 100, end: k * 100 + 40 });
  const p = writeRun(home, "20261115-2113", [{ ...item(1), clip: clip(1), ...moment(1) }, { ...item(2), clip: clip(2), ...moment(2) }]);
  assert.deepEqual(validatePlan(p), { ok: true, items: 2 });
  const empty = writeRun(home, "20261115-2200", []);
  assert.deepEqual(validatePlan(empty), { ok: true, items: 0 });
});

test("validate names every item that would not post as planned", () => {
  const home = tmp();
  const dir = join(home, "boqo-channel", "runs", "20261115-2113", "vid00000001", "out");
  mkdirSync(dir, { recursive: true });
  const c1 = join(dir, "clip-01.mp4");
  writeFileSync(c1, "x");
  const good = { ...item(1), clip: c1, video: "vid00000001", start: 100, end: 140 };
  const cases = [
    [{ ...good, clip: join(dir, "clip-09.mp4") }, /item 1: no clip file at/],
    [{ ...good, clip: "out/clip-01.mp4" }, /item 1: clip is not a full path/],
    [{ ...good, title: " " }, /item 1: no title/],
    [{ ...good, channel: "" }, /item 1: no channel/],
    [{ ...good, accountIds: [] }, /item 1: no accountIds/],
    [{ ...good, accountIds: ["a", 3] }, /item 1: no accountIds/],
    [{ ...good, handles: ["@a", "@b"] }, /item 1: handles do not match accountIds/],
    [{ ...good, when: { date: "2026-02-30", time: "09:00" } }, /item 1: when\.date/],
    [{ ...good, when: { date: "2026-11-16", time: "9:00" } }, /item 1: when\.time/],
    [{ ...good, when: { date: "2026-11-16", time: "24:00" } }, /item 1: when\.time/],
    [{ ...good, when: undefined }, /item 1: when\.date/],
  ];
  for (const [bad, want] of cases) {
    const p = writeRun(home, "20261115-2113", [bad]);
    assert.throws(() => validatePlan(p), want, JSON.stringify(bad));
  }
  const p = writeRun(home, "20261115-2113", [good, { ...good, title: "Again" }]);
  assert.throws(() => validatePlan(p), /item 2: clip-01\.mp4 is item 1's clip too/);
  const p2 = writeRun(home, "20261115-2113", [{ ...good, title: "" }, { ...good, clip: "x.mp4" }]);
  assert.throws(() => validatePlan(p2), (e) => /item 1: no title/.test(e.message) && /item 2: clip is not a full path/.test(e.message));
});

test("a Git Bash path in a plan is found on Windows", () => {
  assert.equal(localPath("/c/Users/A B/.boqo/x.mp4", "win32"), "c:/Users/A B/.boqo/x.mp4");
  assert.equal(localPath("C:\\Users\\x.mp4", "win32"), "C:\\Users\\x.mp4");
  assert.equal(localPath("/c/Users/x.mp4", "linux"), "/c/Users/x.mp4");
  assert.equal(localPath("/home/a/x.mp4", "darwin"), "/home/a/x.mp4");
});

test("count is the items posted for one posting day, across runs", () => {
  const home = tmp();
  const a = writeRun(home, "20261115-0800", [item(1, "2026-11-15"), item(2, "2026-11-15")]);
  const b = writeRun(home, "20261115-2113", [item(1, "2026-11-16"), item(2, "2026-11-16"), item(3, "2026-11-15")]);
  stamp(a, "1", "posted", T1);
  stamp(b, "3", "posted", T1);
  stamp(b, "1", "posted", T1);
  stamp(b, "2", "skipped", T1);
  assert.deepEqual(countPosted("2026-11-15", home), { date: "2026-11-15", posted: 2 });
  assert.deepEqual(countPosted("2026-11-16", home), { date: "2026-11-16", posted: 1 });
  assert.deepEqual(countPosted("2026-11-17", home), { date: "2026-11-17", posted: 0 });
  assert.throws(() => countPosted("tomorrow", home), /YYYY-MM-DD/);
});

test("count includes posts stamped in a plan moved aside to plan.json.bad", () => {
  // auto, perDay.max 3: a run posted 2 of its plan, then a failed stamp moved the plan aside
  const home = tmp();
  const a = writeRun(home, "20261116-0800", [item(1), item(2), item(3)]);
  stamp(a, "1", "posted", T2);
  stamp(a, "2", "posted", T2);
  renameSync(a, `${a}.bad`);
  const p = countPosted("2026-11-16", home).posted;
  assert.equal(p, 2);
  assert.equal(Math.max(0, 3 - p), 1); // a later run plans at most N - P = 1
  assert.deepEqual(runCli(["count", "--date", "2026-11-16"], { home }), { date: "2026-11-16", posted: 2 });
  // beside a live plan of a later run: both count, once each
  const b = writeRun(home, "20261116-1300", [item(1), item(2)]);
  stamp(b, "1", "posted", T2);
  assert.equal(countPosted("2026-11-16", home).posted, 3);
  // another day's posts in the moved-aside plan are not this day's
  assert.equal(countPosted("2026-11-17", home).posted, 0);
});

test("count ignores a moved-aside plan it cannot read, and a skipped item in one", () => {
  const home = tmp();
  const a = writeRun(home, "20261116-0800", [item(1)]);
  renameSync(a, `${a}.bad`);
  writeFileSync(`${a}.bad`, "{ not json"); // the very damage it was moved aside for
  const b = writeRun(home, "20261116-0900", [item(1), item(2)]);
  stamp(b, "1", "posted", T2);
  stamp(b, "2", "skipped", T2);
  renameSync(b, `${b}.bad`);
  assert.equal(countPosted("2026-11-16", home).posted, 1);
});

test("runCli takes the seven commands and nothing else", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  assert.deepEqual(runCli(["pending"], { home }), { plan: p, items: [1], lines: ["2026-11-16 09:00 · @a · Clip 1"] });
  assert.equal(runCli(["posted", p, "1"], { home, now: T1 }).posted, T1.toISOString());
  assert.deepEqual(runCli(["count", "--date", "2026-11-16"], { home }), { date: "2026-11-16", posted: 1 });
  assert.throws(() => runCli(["validate", p], { home }), /no clip file/);
  for (const bad of [[], ["posted", p], ["skip"], ["pending", "x"], ["count", "2026-11-16"], ["validate"], ["frob"]]) {
    assert.throws(() => runCli(bad, { home }), /usage/, JSON.stringify(bad));
  }
});

test("CLI prints one JSON line, and one error line with exit 1", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  const env = { ...process.env, BOQO_HOME: home };
  const ok = spawnSync(process.execPath, [TOOL, "posted", p, "1"], { env, encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim().split("\n").length, 1);
  assert.equal(typeof JSON.parse(ok.stdout).posted, "string");
  const pend = spawnSync(process.execPath, [TOOL, "pending"], { env, encoding: "utf8" });
  assert.deepEqual(JSON.parse(pend.stdout), { plan: null, items: [], lines: [] });
  const val = spawnSync(process.execPath, [TOOL, "validate", p], { env, encoding: "utf8" });
  assert.equal(val.status, 1);
  assert.equal(val.stdout.trim().split("\n").length, 1);
  assert.match(JSON.parse(val.stdout).error, /no clip file/);
  const bad = spawnSync(process.execPath, [TOOL, "posted", p, "9"], { env, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout.trim().split("\n").length, 1);
  assert.match(JSON.parse(bad.stdout).error, /no item/);
});

// --- the plan takes its clips in the final order from each video's clips.json (rendered ones only) -------------------

// A clips.json row as boqo-clips' tools leave it: n in final order after `clips.mjs order`, file and thumb relative to
// the video folder, a judgment once the stranger has read it.
const row = (n, score, extra = {}) => ({
  n, start: n * 100, end: n * 100 + 40, title: `Clip ${n}`, hook: n % 2 ? `Hook ${n}` : null, score,
  replay: null, standalone: null, judgment: null, rendered: false, ...extra,
});
const renderedRow = (n, score, extra = {}) => row(n, score, { rendered: true, file: `out/clip-${String(n).padStart(2, "0")}.mp4`, thumb: `out/clip-${String(n).padStart(2, "0")}.jpg`, ...extra });
function writeVideo(home, id, clips) {
  const dir = join(home, "boqo-channel", "runs", "20261115-2113", id);
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(join(dir, "clips.json"), JSON.stringify({ clips }, null, 2));
  return dir;
}

test("12 kept, 10 rendered, perDay.max 3: the plan takes the first 3 rendered clips in final order", () => {
  const home = tmp();
  // Ten rendered, two kept but not rendered (the best scores of all: they are not eligible, and sort after the
  // rendered ones). The array is reversed and its `n` is the pre-render order: the stranger gave clip 7 a 5, which
  // outweighs any score, so the final order is 7, then by score 2 (95), 9 (85), 4 (80), ... and 6 (50) last.
  const clips = [
    renderedRow(1, 70), renderedRow(2, 95, { judgment: { overall: 1, why: "w" } }), renderedRow(3, 60), renderedRow(4, 80),
    renderedRow(5, 55), renderedRow(6, 50), renderedRow(7, 65, { judgment: { overall: 5, why: "w" } }), renderedRow(8, 52),
    renderedRow(9, 85), renderedRow(10, 51), row(11, 99), row(12, 98),
  ].reverse();
  const video = writeVideo(home, "vid1", clips);
  const r = runCli(["clips", video, "--max", "3"], { home });
  assert.deepEqual(r.clips.map((c) => c.title), ["Clip 7", "Clip 2", "Clip 9"]);
  assert.deepEqual(r.clips.map((c) => c.file), [7, 2, 9].map((n) => resolve(video, `out/clip-0${n}.mp4`)));
  assert.equal(r.kept, 12);
  assert.equal(r.rendered, 10);
  assert.deepEqual(r.clips.map((c) => c.hook), ["Hook 7", null, "Hook 9"]);
  // no --max: every rendered clip, still in that order, and never an unrendered one
  const all = runCli(["clips", video], { home });
  assert.equal(all.clips.length, 10);
  assert.deepEqual(all.clips.slice(0, 4).map((c) => c.title), ["Clip 7", "Clip 2", "Clip 9", "Clip 4"]);
  assert.equal(all.clips.at(-1).title, "Clip 6");
  assert.ok(!all.clips.some((c) => c.title === "Clip 11" || c.title === "Clip 12"));
});

test("a clip that fails the stand-alone test goes last, whatever its score", () => {
  const home = tmp();
  const video = writeVideo(home, "vid1", [renderedRow(1, 90, { standalone: { v: 1, outcome: "fails", claim: "c", bridgeFromSec: null, contextLine: null, sha: null } }), renderedRow(2, 60), renderedRow(3, 70)]);
  assert.deepEqual(runCli(["clips", video, "--max", "2"], { home }).clips.map((c) => c.title), ["Clip 3", "Clip 2"]);
});

test("several videos take turns, each in its own final order, the first video first", () => {
  const home = tmp();
  const a = writeVideo(home, "newer", [renderedRow(1, 90), renderedRow(2, 80), renderedRow(3, 70)]);
  const b = writeVideo(home, "older", [renderedRow(1, 99), renderedRow(2, 60)]);
  const titles = (r) => r.clips.map((c) => `${c.id}:${c.title}`);
  assert.deepEqual(titles(runCli(["clips", a, b, "--max", "4"], { home })), ["newer:Clip 1", "older:Clip 1", "newer:Clip 2", "older:Clip 2"]);
  assert.deepEqual(titles(runCli(["clips", a, b], { home })), ["newer:Clip 1", "older:Clip 1", "newer:Clip 2", "older:Clip 2", "newer:Clip 3"]);
});

test("a video with nothing rendered gives no clips, and a clips.json that cannot be read is an error naming it", () => {
  const home = tmp();
  const none = writeVideo(home, "none", [row(1, 80)]);
  assert.deepEqual(runCli(["clips", none], { home }), { clips: [], kept: 1, rendered: 0, excluded: 0 });
  const missing = join(home, "boqo-channel", "runs", "x", "gone");
  assert.throws(() => runCli(["clips", missing], { home }), /no clips\.json at .*gone/);
  const bad = writeVideo(home, "bad", []);
  writeFileSync(join(bad, "clips.json"), "{nope");
  assert.throws(() => runCli(["clips", bad], { home }), /clips\.json is not valid JSON/);
  assert.throws(() => runCli(["clips", none, "--max", "0"], { home }), /--max/);
  assert.throws(() => runCli(["clips"], { home }), /usage/);
});

test("a rendered row with no file is an error, not a clip the plan cannot post", () => {
  const home = tmp();
  const video = writeVideo(home, "v", [renderedRow(1, 80, { file: undefined })]);
  assert.throws(() => runCli(["clips", video], { home }), /clip 1 is rendered but has no file/);
});

test("the clips command prints one JSON line from the CLI, and its error ends with exit 1", () => {
  const home = tmp();
  const video = writeVideo(home, "v", [renderedRow(1, 80), renderedRow(2, 90)]);
  const env = { ...process.env, BOQO_HOME: home };
  const ok = spawnSync(process.execPath, [TOOL, "clips", video, "--max", "1"], { env, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim().split("\n").length, 1);
  assert.deepEqual(JSON.parse(ok.stdout).clips.map((c) => c.title), ["Clip 2"]);
  const bad = spawnSync(process.execPath, [TOOL, "clips", join(home, "nope")], { env, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stdout).error, /no clips\.json/);
});

// --- a clip already posted is never offered again (a redo of a video's edges re-renders every clip) ------------------

const postedItem = (video, start, end, extra = {}) => ({ ...item(1), video, start, end, posted: T1.toISOString(), ...extra });

test("clips leaves out a moment already posted, even when a redo renamed its file and gave it new edges", () => {
  const home = tmp();
  // Clip 1 starts at 100, clip 2 at 200, clip 3 at 300 (each 40 s). Clip 2's moment was posted before the redo, when its
  // edges were 195-238 (a different file, a different title): 38 of the new clip's 40 s lie inside it, over 25% of the shorter.
  writeRun(home, "20261115-2113", [postedItem("vid1", 195, 238, { title: "Old title", clip: "/x/old.mp4" })]);
  const video = writeVideo(home, "vid1", [renderedRow(1, 90), renderedRow(2, 80), renderedRow(3, 70)]);
  const r = runCli(["clips", video], { home });
  assert.deepEqual(r.clips.map((c) => c.title), ["Clip 1", "Clip 3"]);
  assert.equal(r.excluded, 1);
  // --max counts only what is left: the best two unposted
  assert.deepEqual(runCli(["clips", video, "--max", "2"], { home }).clips.map((c) => c.title), ["Clip 1", "Clip 3"]);
});

test("a skipped item, a small overlap, another video and an old plan with no moment do not hide a clip", () => {
  const home = tmp();
  writeRun(home, "20261115-2113", [
    postedItem("vid1", 100, 140, { posted: undefined, skipped: T1.toISOString() }),   // skipped, not posted
    postedItem("vid1", 330, 370),                                                      // 10 of 40 s: 25% is not more than 25%
    postedItem("other", 200, 240),                                                     // another video
    { ...item(2), posted: T1.toISOString() },                                          // a plan from before this field
  ]);
  const video = writeVideo(home, "vid1", [renderedRow(1, 90), renderedRow(2, 80), renderedRow(3, 70)]);
  const r = runCli(["clips", video], { home });
  assert.deepEqual(r.clips.map((c) => c.title), ["Clip 1", "Clip 2", "Clip 3"]);
  assert.equal(r.excluded, 0);
});

test("a posted item in a plan moved aside to plan.json.bad still hides its clip", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [postedItem("vid1", 100, 140)]);
  renameSync(p, `${p}.bad`);
  const video = writeVideo(home, "vid1", [renderedRow(1, 90), renderedRow(2, 80)]);
  assert.deepEqual(runCli(["clips", video], { home }).clips.map((c) => c.title), ["Clip 2"]);
});

test("each clip carries its video id and edges, for the plan item that will record them", () => {
  const home = tmp();
  const video = writeVideo(home, "vid9", [renderedRow(1, 90)]);
  assert.deepEqual(runCli(["clips", video], { home }).clips.map((c) => [c.id, c.start, c.end]), [["vid9", 100, 140]]);
});

test("validate accepts a hook that is a string or null, and the clip's moment; it refuses the rest", () => {
  const home = tmp();
  const file = join(writeVideo(home, "vid1", []), "out", "clip-01.mp4");
  writeFileSync(file, "x");
  const ok = { ...item(1), clip: file, hook: "A hook", video: "vid1", start: 100, end: 140 };
  assert.deepEqual(validatePlan(writeRun(home, "20261115-2113", [ok])), { ok: true, items: 1 });
  assert.deepEqual(validatePlan(writeRun(home, "20261115-2114", [{ ...ok, hook: null }])), { ok: true, items: 1 });
  const bad = (extra) => { const p = writeRun(home, "20261115-2200", [{ ...ok, ...extra }]); return () => validatePlan(p); };
  assert.throws(bad({ hook: 5 }), /item 1: hook must be text or null/);
  assert.throws(bad({ start: "x" }), /item 1: start and end must be seconds/);
  assert.throws(bad({ end: 90 }), /item 1: start and end must be seconds/);
  assert.throws(bad({ video: "" }), /item 1: no video/);
});

// --- the plan item's video is the id plan.mjs clips prints: a path, or no moment at all, would turn the never-re-offer
// rule off without a word (final review, Important 4) ----------------------------------------------------------------

test("validate requires the clip's moment, and a video that is the id plan.mjs clips gives, never its folder", () => {
  const home = tmp();
  const video = writeVideo(home, "y1-9yeYLJUo", [renderedRow(1, 90)]);
  writeFileSync(join(video, "out", "clip-01.mp4"), "x");
  const [c] = runCli(["clips", video], { home }).clips;
  const planned = { ...item(1), clip: c.file, title: c.title, hook: c.hook, video: c.id, start: c.start, end: c.end };
  assert.deepEqual(validatePlan(writeRun(home, "20261115-2200", [planned])), { ok: true, items: 1 });
  const bad = (extra, drop = []) => {
    const x = { ...planned, ...extra };
    for (const k of drop) delete x[k];
    const p = writeRun(home, "20261115-2200", [x]);
    return () => validatePlan(p);
  };
  assert.throws(bad({}, ["video"]), /item 1: no video/);
  assert.throws(bad({ video: video }), /item 1: video must be "y1-9yeYLJUo", the id plan\.mjs clips gives/);
  assert.throws(bad({ video: `${video}/` }), /item 1: video must be "y1-9yeYLJUo"/);
  assert.throws(bad({ video: "another1234" }), /item 1: video must be "y1-9yeYLJUo"/);
  assert.throws(bad({}, ["start"]), /item 1: start and end must be seconds/);
  assert.throws(bad({}, ["end"]), /item 1: start and end must be seconds/);
  assert.throws(bad({}, ["start", "end"]), /item 1: start and end must be seconds/);
});

test("clips gives each clip's id and file, and no folder path a plan item could take for its video", () => {
  const home = tmp();
  const video = writeVideo(home, "vid1", [renderedRow(1, 90)]);
  const [c] = runCli(["clips", video], { home }).clips;
  assert.deepEqual(Object.keys(c).sort(), ["end", "file", "hook", "id", "start", "title"]);
});

test("a posted item from an older plan whose video is the folder's path still hides its clip", () => {
  const home = tmp();
  const video = writeVideo(home, "vid1", [renderedRow(1, 90), renderedRow(2, 80)]);
  writeRun(home, "20261114-2113", [postedItem(video, 100, 140), postedItem(`${video}/`, 200, 240)]);
  const r = runCli(["clips", video], { home });
  assert.deepEqual(r.clips.map((c) => c.title), []);
  assert.equal(r.excluded, 2);
});

// --- a second plan for one posting day: what the day already holds (final review, Important 2) ----------------------

const at = (k, date, time, channel, accountIds, extra = {}) => ({
  ...item(k, date), channel, accountIds, handles: accountIds.map((a) => `@${a}`), when: { date, time }, ...extra,
});

test("day counts a posting day's posts per channel, and their times per account: posted anywhere, open in the newest plan", () => {
  const home = tmp();
  const D = "2026-11-16";
  const posted = { posted: T1.toISOString() };
  const skipped = { skipped: T1.toISOString() };
  writeRun(home, "20261115-0800", [
    at(1, D, "09:00", "@x", ["a"], posted),
    at(2, D, "15:00", "@x", ["a"]),            // open in an older plan: never offered again, so it holds nothing
    at(3, D, "12:00", "@x", ["a"], skipped),
  ]);
  const aside = writeRun(home, "20261115-1200", [at(1, D, "12:00", "@y", ["b"], posted), at(2, D, "13:00", "@y", ["b"])]);
  renameSync(aside, `${aside}.bad`);           // moved aside: its posts went, its open item never will
  const newest = writeRun(home, "20261115-2113", [
    at(1, D, "21:00", "@x", ["a", "b"], posted),
    at(2, D, "18:00", "@y", ["b"]),             // open in the newest plan: a yes can still post it
    at(3, D, "10:00", "@y", ["b"], skipped),
    at(4, "2026-11-17", "09:00", "@x", ["a"], posted),
  ]);
  assert.deepEqual(dayPosts(D, { home }), {
    date: D,
    channels: { "@x": 2, "@y": 2 },
    accounts: { a: ["09:00", "21:00"], b: ["12:00", "18:00", "21:00"] },
  });
  // re-timing the newest plan's own open items (a late yes): they are what is being planned, so they hold nothing
  assert.deepEqual(dayPosts(D, { home, except: newest }), {
    date: D,
    channels: { "@x": 2, "@y": 1 },
    accounts: { a: ["09:00", "21:00"], b: ["12:00", "21:00"] },
  });
  assert.deepEqual(runCli(["day", "--date", D, "--except", newest], { home }), dayPosts(D, { home, except: newest }));
  assert.deepEqual(dayPosts("2026-11-18", { home }), { date: "2026-11-18", channels: {}, accounts: {} });
});

test("day refuses a bad date, an --except that names no plan, and a damaged live plan", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  for (const bad of [["day"], ["day", "--date"], ["day", "2026-11-16"], ["day", "--date", "2026-11-16", "x"], ["day", "--date", "2026-11-16", "--except"]]) {
    assert.throws(() => runCli(bad, { home }), /usage/, JSON.stringify(bad));
  }
  assert.throws(() => runCli(["day", "--date", "2026-02-30"], { home }), /YYYY-MM-DD/);
  assert.throws(() => runCli(["day", "--date", "2026-11-16", "--except", join(home, "nope.json")], { home }), /no plan at/);
  writeFileSync(p, "{not json");
  assert.throws(() => runCli(["day", "--date", "2026-11-16"], { home }), /move it aside to plan\.json\.bad/);
});

test("the day command prints one JSON line from the CLI", () => {
  const home = tmp();
  writeRun(home, "20261115-2113", [at(1, "2026-11-16", "09:00", "@x", ["a"], { posted: T1.toISOString() })]);
  const r = spawnSync(process.execPath, [TOOL, "day", "--date", "2026-11-16"], { env: { ...process.env, BOQO_HOME: home }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.deepEqual(JSON.parse(r.stdout), { date: "2026-11-16", channels: { "@x": 1 }, accounts: { a: ["09:00"] } });
});
