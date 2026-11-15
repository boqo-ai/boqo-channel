import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  ]) {
    const { status, out } = run(...args);
    assert.equal(status, 1, JSON.stringify(args));
    assert.equal(typeof out.error, "string", JSON.stringify(args));
  }
});

test("schedule.mjs is this repo's own tool, not part of the vendored engine", () => {
  const engine = JSON.parse(readFileSync(new URL("../engine/ENGINE.json", import.meta.url), "utf8"));
  assert.ok(!engine.files.includes("tools/schedule.mjs"));
});
