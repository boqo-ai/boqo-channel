import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { countPosted, pending, runCli, stamp } from "../lib/plan.mjs";

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

test("pending is the newest plan with an open item", () => {
  const home = tmp();
  assert.deepEqual(pending(home), { plan: null, items: [] });
  const older = writeRun(home, "20261114-2113", [item(1), item(2)]);
  const newer = writeRun(home, "20261115-2113", [item(1), item(2), item(3)]);
  writeRun(home, "20261115-2200", []); // an empty plan: nothing to post
  mkdirSync(join(home, "boqo-channel", "runs", "20261116-0900")); // a run that stopped before its plan
  assert.deepEqual(pending(home), { plan: newer, items: [1, 2, 3] });
  stamp(newer, "1", "posted", T1);
  stamp(newer, "3", "skipped", T1);
  assert.deepEqual(pending(home), { plan: newer, items: [2] });
  stamp(newer, "2", "posted", T1);
  assert.deepEqual(pending(home), { plan: older, items: [1, 2] });
  stamp(older, "all", "skipped", T1);
  assert.deepEqual(pending(home), { plan: null, items: [] });
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

test("runCli takes the four commands and nothing else", () => {
  const home = tmp();
  const p = writeRun(home, "20261115-2113", [item(1)]);
  assert.deepEqual(runCli(["pending"], { home }), { plan: p, items: [1] });
  assert.equal(runCli(["posted", p, "1"], { home, now: T1 }).posted, T1.toISOString());
  assert.deepEqual(runCli(["count", "--date", "2026-11-16"], { home }), { date: "2026-11-16", posted: 1 });
  for (const bad of [[], ["posted", p], ["skip"], ["pending", "x"], ["count", "2026-11-16"], ["frob"]]) {
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
  assert.deepEqual(JSON.parse(pend.stdout), { plan: null, items: [] });
  const bad = spawnSync(process.execPath, [TOOL, "posted", p, "9"], { env, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout.trim().split("\n").length, 1);
  assert.match(JSON.parse(bad.stdout).error, /no item/);
});
