import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dayPosts, stamp } from "../lib/plan.mjs";
import { spreadAround } from "../lib/schedule.mjs";

const TOOL = fileURLToPath(new URL("../tools/schedule.mjs", import.meta.url));
const run = (...args) => {
  const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1, `one JSON line, got: ${r.stdout}`);
  return { status: r.status, out: JSON.parse(lines[0]) };
};
const D = "2026-11-20";

test("three posts over the default window", () => {
  const { status, out } = run("3", "--date", D);
  assert.equal(status, 0);
  assert.deepEqual(out, { times: [{ date: D, time: "09:00" }, { date: D, time: "15:00" }, { date: D, time: "21:00" }] });
});

test("--from and --to set the window", () => {
  const { status, out } = run("2", "--date", D, "--from", "15:00", "--to", "21:00");
  assert.equal(status, 0);
  assert.deepEqual(out.times.map((t) => t.time), ["15:00", "21:00"]);
  assert.deepEqual(run("1", "--date", D, "--from", "15:00").out.times, [{ date: D, time: "18:00" }]);
});

test("zero posts is an empty list", () => {
  assert.deepEqual(run("0", "--date", D), { status: 0, out: { times: [] } });
});

test("bad input exits 1 with one error line", () => {
  for (const args of [
    [], ["3"], ["-1", "--date", D], ["2.5", "--date", D], ["x", "--date", D], ["3", "--date", "2026-02-30"],
    ["3", "--date", D, "--from", "9:00"], ["3", "--date", D, "--from", "20:00", "--to", "10:00"],
    ["3", "--date", D, "--when", "x"], ["3", "4", "--date", D], ["3", "--date"],
    ["1", "--date", D, "--avoid"], ["1", "--date", D, "--avoid", "9:00"], ["1", "--date", D, "--avoid", "09:00,24:00"],
    ["1", "--date", D, "--avoid", "09:00;15:00"], ["1", "--date", "2026-02-30", "--avoid", "09:00"],
    ["1", "--date", D, "--from", "20:00", "--to", "10:00", "--avoid", "09:00"],
  ]) {
    const { status, out } = run(...args);
    assert.equal(status, 1, JSON.stringify(args));
    assert.equal(typeof out.error, "string", JSON.stringify(args));
  }
});

test("schedule.mjs, plan.mjs and channel.mjs are this repo's own tools, not part of the vendored engine", () => {
  const engine = JSON.parse(readFileSync(new URL("../engine/ENGINE.json", import.meta.url), "utf8"));
  for (const tool of ["tools/schedule.mjs", "tools/plan.mjs", "tools/channel.mjs"]) assert.ok(!engine.files.includes(tool), tool);
});

// --- --avoid: the times a posting day already holds for the accounts (final review, Important 2) ---------------------

const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const times = (...args) => {
  const r = run(...args);
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out.times.map((t) => { assert.equal(t.date, D); return t.time; });
};

test("--avoid keeps every new time 30 minutes from the taken ones and from each other", () => {
  assert.deepEqual(times("1", "--date", D, "--avoid", "09:00,21:00"), ["15:00"]);
  assert.deepEqual(times("2", "--date", D, "--avoid", "09:00,21:00"), ["13:00", "17:00"]);
  assert.deepEqual(times("2", "--date", D, "--avoid", "15:00"), ["09:00", "21:00"]);
  assert.deepEqual(times("3", "--date", D, "--avoid", "09:00,15:00,21:00"), ["11:00", "13:00", "18:00"]);
  // a taken time just before the window still counts
  const late = times("2", "--date", D, "--from", "12:00", "--avoid", "11:45");
  assert.ok(late.every((t) => mins(t) >= mins("12:15") && mins(t) <= mins("21:00")), late.join());
  assert.ok(mins(late[1]) - mins(late[0]) >= 30, late.join());
  // a taken time far from the window changes nothing
  assert.deepEqual(times("3", "--date", D, "--avoid", "03:00"), ["09:00", "15:00", "21:00"]);
  assert.deepEqual(times("3", "--date", D, "--avoid", ""), ["09:00", "15:00", "21:00"]);
  assert.deepEqual(times("0", "--date", D, "--avoid", "09:00"), []);
});

test("--avoid with no room left on the day is an error, never a time on another day", () => {
  assert.deepEqual(times("2", "--date", D, "--from", "20:00", "--to", "21:00", "--avoid", "20:30"), ["20:00", "21:00"]);
  const { status, out } = run("3", "--date", D, "--from", "20:00", "--to", "21:00", "--avoid", "20:30");
  assert.equal(status, 1);
  assert.match(out.error, /no room on 2026-11-20 for 3 posts/);
});

// Every taken set on a 5-minute grid, small enough to check by hand: a time set exists exactly when the leftmost greedy
// pick (optimal on a line) finds n slots, and then every time spreadAround gives keeps every distance.
test("spreadAround finds room whenever the day has it, and keeps every gap", () => {
  let seed = 7;
  const rand = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (let c = 0; c < 400; c++) {
    const from = 540 + 5 * rand(12);
    const to = from + 5 * rand(48);
    const avoid = Array.from({ length: rand(5) }, () => 480 + 5 * rand(84));
    const n = 1 + rand(6);
    let room = 0;
    for (let m = from, last = -Infinity; m <= to; m += 5) {
      if (m - last >= 30 && avoid.every((a) => Math.abs(m - a) >= 30)) { room++; last = m; }
    }
    const args = { date: D, from: fmt(from), to: fmt(to), avoid: avoid.map(fmt) };
    if (room < n) {
      assert.throws(() => spreadAround(n, args), /no room/, JSON.stringify({ n, ...args }));
      continue;
    }
    const got = spreadAround(n, args).map((t) => mins(t.time));
    assert.equal(got.length, n, JSON.stringify({ n, ...args }));
    for (let i = 0; i < n; i++) {
      assert.ok(got[i] >= from && got[i] <= to && got[i] % 5 === 0, JSON.stringify({ n, ...args, got }));
      assert.ok(avoid.every((a) => Math.abs(got[i] - a) >= 30), JSON.stringify({ n, ...args, got }));
      if (i > 0) assert.ok(got[i] - got[i - 1] >= 30, JSON.stringify({ n, ...args, got }));
    }
  }
});

// Two plans for one posting day, as SKILL.md step 5 makes them: `plan.mjs day` for what the day holds, a channel's
// posts capped at perDay.max less its count, and `schedule.mjs --avoid` with the times of the accounts it posts to.
test("two plans for one posting day: the second keeps perDay.max and never takes a time the first holds", () => {
  const home = mkdtempSync(join(tmpdir(), "boqo channel day-"));
  const perDay = { "@x": 2, "@y": 2 };
  const plan = (name, items) => {
    const dir = join(home, "boqo-channel", "runs", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan.json"), JSON.stringify(items));
    return join(dir, "plan.json");
  };
  const item = (channel, k, time) => ({ clip: `/x/${channel}-${k}.mp4`, title: `${channel} ${k}`, channel, accountIds: ["a"], handles: ["@a"], when: { date: D, time } });
  // Each plan: both channels post to account a, so they share one schedule call, their posts taking turns.
  const planDay = (name, clips) => {
    const day = dayPosts(D, { home });
    const k = Object.fromEntries(Object.keys(perDay).map((c) => [c, Math.max(0, Math.min(clips, perDay[c] - (day.channels[c] ?? 0)))]));
    const n = k["@x"] + k["@y"];
    const avoid = day.accounts.a ?? [];
    const at = times(String(n), "--date", D, ...(avoid.length ? ["--avoid", avoid.join(",")] : []));
    const turns = [];
    for (let i = 0; turns.length < n; i++) for (const c of ["@x", "@y"]) if (i < k[c]) turns.push(c);
    return plan(name, turns.map((c, i) => item(c, i + 1, at[i])));
  };

  // The run at 21:13: one clip a channel, both said yes to.
  const first = planDay("20261119-2113", 1);
  assert.deepEqual(JSON.parse(readFileSync(first, "utf8")).map((x) => `${x.channel} ${x.when.time}`), ["@x 09:00", "@y 21:00"]);
  stamp(first, "1", "posted");
  stamp(first, "2", "posted");
  // Without --avoid, the same call gives the first plan's times again: the collision the final review measured.
  assert.deepEqual(times("2", "--date", D), ["09:00", "21:00"]);

  // Held videos' yes, the same posting day: each channel has room for one more, at times of its own.
  const second = planDay("20261119-2140", 3);
  assert.deepEqual(JSON.parse(readFileSync(second, "utf8")).map((x) => `${x.channel} ${x.when.time}`), ["@x 13:00", "@y 17:00"]);
  stamp(second, "1", "posted");
  stamp(second, "2", "posted");

  // A third plan that day: every channel is at perDay.max, so it plans nothing.
  assert.deepEqual(JSON.parse(readFileSync(planDay("20261119-2200", 3), "utf8")), []);

  // Across every plan: at most perDay.max a channel, and the account's times all 30 minutes apart.
  const all = readdirSync(join(home, "boqo-channel", "runs")).flatMap((r) => JSON.parse(readFileSync(join(home, "boqo-channel", "runs", r, "plan.json"), "utf8")));
  for (const c of Object.keys(perDay)) assert.ok(all.filter((x) => x.channel === c).length <= perDay[c], c);
  const t = all.map((x) => mins(x.when.time)).sort((a, b) => a - b);
  assert.equal(t.length, 4);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 30, t.join());
});
