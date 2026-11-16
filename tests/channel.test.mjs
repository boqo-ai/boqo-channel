import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  channelUrl, channelKey, listArgs, newVideos, statePath, loadState, markSeen, runCli, SEEN_LIMIT,
} from "../lib/channel.mjs";

const TOOL = fileURLToPath(new URL("../tools/channel.mjs", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "boqo-channel-"));

const entry = (id, extra = {}) => ({
  id, title: `Video ${id}`, url: `https://www.youtube.com/watch?v=${id}`, duration: 1800, live_status: "not_live", ...extra,
});

test("channelUrl normalises every accepted form to <channel>/videos", () => {
  const want = "https://www.youtube.com/@lexfridman/videos";
  for (const input of [
    "@lexfridman", "lexfridman", "  @lexfridman ", "youtube.com/@lexfridman", "www.youtube.com/@lexfridman",
    "https://www.youtube.com/@lexfridman", "https://youtube.com/@lexfridman/", "https://m.youtube.com/@lexfridman/videos",
    "https://www.youtube.com/@lexfridman/featured?view=0", "http://www.youtube.com/@lexfridman/videos",
  ]) assert.equal(channelUrl(input), want, input);
  assert.equal(channelUrl("https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA"),
    "https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA/videos");
  assert.equal(channelUrl("UCSHZKyawb77ixDdsGog4iWA"),
    "https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA/videos");
  assert.equal(channelUrl("https://www.youtube.com/c/LexFridman/streams"), "https://www.youtube.com/c/LexFridman/videos");
  assert.equal(channelUrl("youtube.com/user/lexfridman"), "https://www.youtube.com/user/lexfridman/videos");
});

test("channelUrl rejects what is not a YouTube channel", () => {
  for (const bad of ["", "   ", "https://example.com/@x", "https://www.youtube.com/watch?v=abc", "https://www.youtube.com/", "a/b/c"]) {
    assert.throws(() => channelUrl(bad), undefined, JSON.stringify(bad));
  }
});

test("channelKey is filesystem safe and stable across input forms", () => {
  assert.equal(channelKey("@lexfridman"), "at-lexfridman");
  assert.equal(channelKey("https://www.youtube.com/@LexFridman/videos"), "at-lexfridman");
  assert.equal(channelKey("UCSHZKyawb77ixDdsGog4iWA"), "channel-ucshzkyawb77ixddsgog4iwa");
  assert.equal(channelKey("youtube.com/c/LexFridman"), "c-lexfridman");
  for (const k of [channelKey("@lex.fridman_x-1"), channelKey("@日本語チャンネル"), channelKey("@a%20b")]) {
    assert.match(k, /^[a-z0-9._-]+$/);
    assert.ok(!k.includes(":") && !k.includes("/") && !k.includes("\\"));
  }
  assert.notEqual(channelKey("@日本語チャンネル"), channelKey("@日本語チャンネル二"));
});

test("listArgs is the flat-playlist call, no shell", () => {
  assert.deepEqual(listArgs("https://www.youtube.com/@x/videos"),
    ["--flat-playlist", "--playlist-end", "15", "-J", "--js-runtimes", "node", "https://www.youtube.com/@x/videos"]);
  assert.equal(listArgs("u", 40)[2], "40");
});

test("newVideos keeps newest-first order and the output shape", () => {
  const flat = { entries: [entry("aaaaaaaaaaa", { duration: 2400 }), entry("bbbbbbbbbbb"), entry("ccccccccccc")] };
  const got = newVideos(flat, { seen: [] });
  assert.deepEqual(got.map((v) => v.id), ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
  assert.deepEqual(got[0], {
    id: "aaaaaaaaaaa", title: "Video aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", duration: 2400,
  });
});

test("newVideos honours max (default 3)", () => {
  const flat = { entries: ["a", "b", "c", "d", "e"].map((c) => entry(c.repeat(11))) };
  assert.equal(newVideos(flat, { seen: [] }).length, 3);
  assert.equal(newVideos(flat, { seen: [] }, 2).length, 2);
  assert.equal(newVideos(flat, { seen: [] }, 10).length, 5);
});

test("newVideos skips seen ids and fills up from older ones", () => {
  const flat = { entries: ["a", "b", "c", "d"].map((c) => entry(c.repeat(11))) };
  const got = newVideos(flat, { seen: ["a".repeat(11), "c".repeat(11)] }, 3);
  assert.deepEqual(got.map((v) => v.id), ["b".repeat(11), "d".repeat(11)]);
});

test("newVideos skips Shorts: duration under 90 or a /shorts/ url", () => {
  const flat = { entries: [
    entry("short000001", { duration: 59 }),
    entry("short000002", { duration: 89 }),
    entry("short000003", { duration: 600, url: "https://www.youtube.com/shorts/short000003" }),
    entry("edge0000090", { duration: 90 }),
    entry("long0000001", { duration: 3600 }),
  ] };
  assert.deepEqual(newVideos(flat, { seen: [] }, 10).map((v) => v.id), ["edge0000090", "long0000001"]);
});

test("newVideos skips live and upcoming, keeps not_live, was_live, null and missing", () => {
  const flat = { entries: [
    entry("live0000001", { live_status: "is_live" }),
    entry("upcoming001", { live_status: "is_upcoming" }),
    entry("postlive001", { live_status: "post_live" }),
    entry("notlive0001", { live_status: "not_live" }),
    entry("waslive0001", { live_status: "was_live" }),
    entry("nullstat001", { live_status: null }),
    (() => { const e = entry("nostatus001"); delete e.live_status; return e; })(),
  ] };
  assert.deepEqual(newVideos(flat, { seen: [] }, 10).map((v) => v.id),
    ["notlive0001", "waslive0001", "nullstat001", "nostatus001"]);
});

test("newVideos keeps an entry with no duration (flat lists omit it)", () => {
  const e = entry("noduration1"); delete e.duration;
  const got = newVideos({ entries: [e, entry("nulldur0001", { duration: null })] }, { seen: [] }, 5);
  assert.deepEqual(got.map((v) => v.id), ["noduration1", "nulldur0001"]);
  assert.equal(got[0].duration, null);
});

test("newVideos builds a watch url when the entry has none, drops entries with no id, tolerates junk", () => {
  const e = entry("nourl000001"); delete e.url;
  const got = newVideos({ entries: [e, { title: "no id" }, null, entry("dup00000001"), entry("dup00000001")] }, { seen: [] }, 10);
  assert.deepEqual(got.map((v) => v.id), ["nourl000001", "dup00000001"]);
  assert.equal(got[0].url, "https://www.youtube.com/watch?v=nourl000001");
  assert.deepEqual(newVideos({}, { seen: [] }), []);
  assert.deepEqual(newVideos({ entries: [entry("a".repeat(11))] }, {}), [{ id: "a".repeat(11), title: `Video ${"a".repeat(11)}`, url: `https://www.youtube.com/watch?v=${"a".repeat(11)}`, duration: 1800 }]);
});

test("markSeen appends newest last, moves a repeat to the end, caps at 500", () => {
  let s = { seen: [] };
  s = markSeen(s, "a"); s = markSeen(s, "b"); s = markSeen(s, "a");
  assert.deepEqual(s.seen, ["b", "a"]);
  let big = { seen: Array.from({ length: SEEN_LIMIT }, (_, i) => `id${i}`) };
  big = markSeen(big, "fresh");
  assert.equal(big.seen.length, 500);
  assert.equal(big.seen.at(-1), "fresh");
  assert.equal(big.seen[0], "id1");
});

test("state lives at $BOQO_HOME/boqo-channel/state/<channelKey>.json", () => {
  const home = tmp();
  assert.equal(statePath("@LexFridman", home), join(home, "boqo-channel", "state", "at-lexfridman.json"));
  assert.deepEqual(loadState(statePath("@x", home)), { seen: [] });
});

test("loadState refuses a corrupt file instead of resetting it", () => {
  const home = tmp();
  const p = statePath("@x", home);
  mkdirSync(join(home, "boqo-channel", "state"), { recursive: true });
  writeFileSync(p, "{not json");
  assert.throws(() => loadState(p), /state/i);
});

test("runCli new: lists, marks nothing, honours max and state", async () => {
  const home = tmp();
  const flat = { entries: ["a", "b", "c", "d"].map((c) => entry(c.repeat(11))) };
  const calls = [];
  const fetchFlat = async (args) => { calls.push(args); return flat; };
  const out = await runCli(["new", "@LexFridman", "--max", "2"], { home, fetchFlat });
  assert.equal(out.channel, "https://www.youtube.com/@LexFridman/videos");
  assert.equal(out.first, true, "no state yet: the channel's first run");
  assert.deepEqual(out.videos.map((v) => v.id), ["a".repeat(11), "b".repeat(11)]);
  assert.deepEqual(Object.keys(out.videos[0]), ["id", "title", "url", "duration"]);
  assert.ok(calls[0].includes("--js-runtimes") && calls[0].at(-1) === out.channel);
  // listing alone never writes state
  assert.ok(!existsSync(statePath("@LexFridman", home)));
  await runCli(["mark", "@LexFridman", "a".repeat(11)], { home, fetchFlat });
  const again = await runCli(["new", "@LexFridman"], { home, fetchFlat });
  assert.equal(again.first, false);
  assert.deepEqual(again.videos.map((v) => v.id), ["b", "c", "d"].map((c) => c.repeat(11)));
});

test("runCli new --first: a first run returns only the newest long video and marks the rest of the listing", async () => {
  const home = tmp();
  const ids = Array.from({ length: 20 }, (_, i) => `v${String(i).padStart(10, "0")}`);
  const entries = [
    entry("short000001", { duration: 40 }), // a Short is newest: not clipped, still marked
    entry("upcoming001", { live_status: "is_upcoming", duration: null }), // not out yet: never marked
    entry("islive00001", { live_status: "is_live", duration: null }),
    ...ids.map((id) => entry(id)),
  ];
  const calls = [];
  const fetchFlat = async (args) => { calls.push(args); return { entries }; };
  const out = await runCli(["new", "@x", "--max", "3", "--first"], { home, fetchFlat });
  assert.equal(out.first, true);
  assert.deepEqual(out.videos.map((v) => v.id), [ids[0]]);
  assert.equal(out.marked, 20); // the Short and v1…v19, not the newest, not live or upcoming
  assert.equal(calls.length, 1, "one listing only");
  assert.equal(calls[0][calls[0].indexOf("--playlist-end") + 1], "100", "a first run lists deep");
  const seen = loadState(statePath("@x", home)).seen;
  assert.ok(!seen.includes(ids[0]) && !seen.includes("upcoming001") && !seen.includes("islive00001"));
  for (const id of ["short000001", ...ids.slice(1)]) assert.ok(seen.includes(id), id);
  // the next run: no longer first, and only the newest (still not done) comes back
  const again = await runCli(["new", "@x", "--max", "3", "--first"], { home, fetchFlat });
  assert.equal(again.first, false);
  assert.equal(calls[1][calls[1].indexOf("--playlist-end") + 1], "15");
  assert.equal(again.marked, undefined);
  assert.deepEqual(again.videos.map((v) => v.id), [ids[0]]);
});

test("runCli new --first on a first run with no long video still marks the listing", async () => {
  const home = tmp();
  const fetchFlat = async () => ({ entries: [entry("short000001", { duration: 30 }), entry("short000002", { duration: 50 })] });
  const out = await runCli(["new", "@x", "--first"], { home, fetchFlat });
  assert.deepEqual(out, { channel: "https://www.youtube.com/@x/videos", first: true, newest: null, videos: [], marked: 2 });
  assert.equal((await runCli(["new", "@x", "--first"], { home, fetchFlat })).first, false);
});

test("runCli new --first: a state file with an empty seen list is still a first run", async () => {
  const home = tmp();
  const p = statePath("@x", home);
  mkdirSync(join(home, "boqo-channel", "state"), { recursive: true });
  writeFileSync(p, JSON.stringify({ seen: [] }));
  const ids = ["a", "b", "c", "d"].map((c) => c.repeat(11));
  const fetchFlat = async () => ({ entries: ids.map((id) => entry(id)) });
  const out = await runCli(["new", "@x", "--max", "3", "--first"], { home, fetchFlat });
  assert.equal(out.first, true);
  assert.deepEqual(out.videos.map((v) => v.id), [ids[0]], "only the newest, never the backlog");
  assert.equal(out.marked, 3);
  assert.deepEqual(loadState(p).seen, ids.slice(1));
});

test("runCli new --first: an empty listing saves no state, so the next run is still first", async () => {
  const home = tmp();
  const p = statePath("@x", home);
  const empty = await runCli(["new", "@x", "--first"], { home, fetchFlat: async () => ({ entries: [] }) });
  assert.deepEqual(empty, { channel: "https://www.youtube.com/@x/videos", first: true, newest: null, videos: [], marked: 0 });
  assert.ok(!existsSync(p), "nothing listed: nothing saved");
  // a listing of only what is not out yet marks nothing either
  await runCli(["new", "@x", "--first"], { home, fetchFlat: async () => ({ entries: [entry("upcoming001", { live_status: "is_upcoming" })] }) });
  assert.ok(!existsSync(p));
  const ids = ["a", "b", "c"].map((c) => c.repeat(11));
  const out = await runCli(["new", "@x", "--first"], { home, fetchFlat: async () => ({ entries: ids.map((id) => entry(id)) }) });
  assert.equal(out.first, true);
  assert.deepEqual(out.videos.map((v) => v.id), [ids[0]]);
  assert.equal(out.marked, 2);
});

test("a broken state file names its way out: delete it and the next run clips only the newest", () => {
  const home = tmp();
  const p = statePath("@x", home);
  mkdirSync(join(home, "boqo-channel", "state"), { recursive: true });
  for (const text of ["{not json", '{"seen": "x"}', "null"]) {
    writeFileSync(p, text);
    assert.throws(() => loadState(p), (e) => e.message.includes(p) && /delete it: the next run then clips only the newest video/.test(e.message), text);
  }
});

test("runCli new without --first marks nothing on a first run", async () => {
  const home = tmp();
  const fetchFlat = async () => ({ entries: ["a", "b"].map((c) => entry(c.repeat(11))) });
  const out = await runCli(["new", "@x"], { home, fetchFlat });
  assert.equal(out.first, true);
  assert.equal(out.videos.length, 2);
  assert.ok(!existsSync(statePath("@x", home)));
});

test("runCli new gives the newest long video's id, seen or not, to tell one channel under two forms", async () => {
  const home = tmp();
  const entries = [entry("short000001", { duration: 30 }), entry("upcoming001", { live_status: "is_upcoming" }), entry("a".repeat(11)), entry("b".repeat(11))];
  const fetchFlat = async () => ({ entries });
  const out = await runCli(["new", "@x", "--max", "1"], { home, fetchFlat });
  assert.equal(out.newest, "a".repeat(11));
  await runCli(["mark", "@x", "a".repeat(11)], { home });
  const again = await runCli(["new", "@x", "--max", "1"], { home, fetchFlat });
  assert.equal(again.newest, "a".repeat(11), "seen or not");
  assert.deepEqual(again.videos.map((v) => v.id), ["b".repeat(11)]);
  // the same channel under another form: another state, the same newest
  const other = await runCli(["new", "UCSHZKyawb77ixDdsGog4iWA", "--max", "1"], { home, fetchFlat });
  assert.equal(other.newest, out.newest);
  assert.equal((await runCli(["new", "@y"], { home, fetchFlat: async () => ({ entries: [entry("short000001", { duration: 30 })] }) })).newest, null);
});

test("runCli mark: writes state and reports the count", async () => {
  const home = tmp();
  const a = await runCli(["mark", "@x", "vid00000001"], { home });
  assert.deepEqual(a, { marked: "vid00000001", seen: 1 });
  const b = await runCli(["mark", "https://www.youtube.com/@X/videos", "vid00000002"], { home });
  assert.deepEqual(b, { marked: "vid00000002", seen: 2 });
  assert.deepEqual(JSON.parse(readFileSync(statePath("@x", home), "utf8")), { seen: ["vid00000001", "vid00000002"] });
});

test("runCli rejects bad arguments", async () => {
  const home = tmp();
  await assert.rejects(runCli([], { home }), /usage/i);
  await assert.rejects(runCli(["new"], { home }), /channel/i);
  await assert.rejects(runCli(["new", "@x", "--max", "0"], { home }), /max/i);
  await assert.rejects(runCli(["new", "@x", "--max", "abc"], { home }), /max/i);
  await assert.rejects(runCli(["new", "@x", "--max", "21"], { home }), /1 to 20/); // deeper than a first run marks
  await assert.rejects(runCli(["mark", "@x"], { home }), /video/i);
  await assert.rejects(runCli(["frobnicate", "@x"], { home }), /usage|unknown/i);
});

test("CLI: mark prints one JSON line, errors print one JSON error line and exit 1", () => {
  const home = tmp();
  const env = { ...process.env, BOQO_HOME: home };
  const ok = spawnSync(process.execPath, [TOOL, "mark", "@x", "vid00000001"], { env, encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(ok.stdout), { marked: "vid00000001", seen: 1 });
  assert.equal(ok.stdout.trim().split("\n").length, 1);
  const bad = spawnSync(process.execPath, [TOOL, "mark", "https://example.com/x", "vid00000001"], { env, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout.trim().split("\n").length, 1);
  assert.equal(typeof JSON.parse(bad.stdout).error, "string");
});
