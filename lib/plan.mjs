// The posting plan of one daily run, <home>/boqo-channel/runs/<run>/plan.json: an array of
// {clip, title, channel, accountIds, handles, when: {date, time}}. Each item ends "posted" (after its post_video) or
// "skipped" (the person said no to it), stamped with an ISO time, so a later yes, a resumed session or a second chat
// never posts it again. Only the newest plan is ever offered: a newer run's plan replaces an unanswered one.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { boqoHome } from "./channel.mjs";

const DAMAGED = "move it aside to plan.json.bad, and its posts are not made";

export function readPlan(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) {
    throw new Error(e.code === "ENOENT" ? `no plan at ${path}` : `cannot read ${path}: ${e.code ?? e.message}`);
  }
  let items;
  try { items = JSON.parse(text); } catch { throw new Error(`plan is not valid JSON: ${path}; ${DAMAGED}`); }
  if (!Array.isArray(items) || items.some((x) => !x || typeof x !== "object" || Array.isArray(x))) {
    throw new Error(`plan must be an array of items: ${path}; ${DAMAGED}`);
  }
  return items;
}

// Git Bash hands a native program /c/Users/… as C:/Users/… on the command line, but not inside a JSON file.
export function localPath(p, platform = process.platform) {
  const m = platform === "win32" ? /^\/([a-zA-Z])(\/.*)$/.exec(p) : null;
  return m ? `${m[1]}:${m[2]}` : p;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function isDate(s) {
  const m = typeof s === "string" ? DATE.exec(s) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const text = (s) => typeof s === "string" && s.trim() !== "";

// Run right after plan.json is written: every item must post as planned, or the error names each one that would not.
export function validatePlan(path) {
  const items = readPlan(path);
  const errors = [];
  const clips = new Map();
  items.forEach((x, i) => {
    const k = i + 1;
    if (!text(x.clip)) errors.push(`item ${k}: no clip`);
    else if (!isAbsolute(x.clip) && !/^[a-zA-Z]:[\\/]/.test(x.clip)) errors.push(`item ${k}: clip is not a full path: ${x.clip}`);
    else if (!existsSync(localPath(x.clip))) errors.push(`item ${k}: no clip file at ${x.clip}`);
    else if (clips.has(x.clip)) errors.push(`item ${k}: ${basename(x.clip)} is item ${clips.get(x.clip)}'s clip too`);
    else clips.set(x.clip, k);
    if (!text(x.title)) errors.push(`item ${k}: no title`);
    if (!text(x.channel)) errors.push(`item ${k}: no channel`);
    const ids = x.accountIds;
    if (!Array.isArray(ids) || !ids.length || !ids.every(text)) errors.push(`item ${k}: no accountIds`);
    else if (!Array.isArray(x.handles) || x.handles.length !== ids.length || !x.handles.every(text)) {
      errors.push(`item ${k}: handles do not match accountIds`);
    }
    if (!isDate(x.when?.date)) errors.push(`item ${k}: when.date must be YYYY-MM-DD`);
    if (typeof x.when?.time !== "string" || !TIME.test(x.when.time)) errors.push(`item ${k}: when.time must be HH:MM`);
  });
  if (errors.length) throw new Error(`plan ${path}: ${errors.join("; ")}`);
  return { ok: true, items: items.length };
}

function writePlan(path, items) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(items, null, 2) + "\n");
  renameSync(tmp, path);
}

const isDone = (x) => Boolean(x.posted || x.skipped);

// n is the item's place in the plan, from 1, or "all" (skip only).
export function stamp(path, n, key, now = new Date()) {
  if (key !== "posted" && key !== "skipped") throw new Error(`unknown stamp ${key}`);
  const items = readPlan(path);
  const all = n === "all";
  if (all && key !== "skipped") throw new Error("only skip takes all");
  const k = all ? null : Number(n);
  if (!all && (!/^\d+$/.test(String(n)) || k < 1 || k > items.length)) {
    throw new Error(`no item ${n} in a plan of ${items.length}`);
  }
  const at = now.toISOString();
  const changed = [];
  const already = [];
  for (let i = 0; i < items.length; i++) {
    if (!all && i !== k - 1) continue;
    const x = items[i];
    if (x.posted || (key === "skipped" && x.skipped)) { already.push(i + 1); continue; }
    if (key === "posted") delete x.skipped; // posted on the person's later ask
    x[key] = at;
    changed.push(i + 1);
  }
  if (changed.length) writePlan(path, items);
  if (!all) {
    const x = items[k - 1];
    return { item: k, ...(x.posted ? { posted: x.posted } : { skipped: x.skipped }), ...(already.length ? { already: true } : {}) };
  }
  return { skipped: changed, already };
}

// Each run's plan.json, newest first. With aside, a plan moved aside (plan.json.bad) holds its run's place, as null.
function planFiles(home, { aside = false } = {}) {
  const runs = join(home, "boqo-channel", "runs");
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse() // <YYYYMMDD-HHMM> names: newest first
    .map((name) => join(runs, name, "plan.json"))
    .map((p) => (existsSync(p) ? p : aside && existsSync(`${p}.bad`) ? null : undefined))
    .filter((p) => p !== undefined);
}

const line = (x) => `${x.when?.date ?? "?"} ${x.when?.time ?? "?"} · ${(x.handles ?? []).join(", ")} · ${x.title ?? ""}`;

// The newest plan's items neither posted nor skipped, with a report line for each. Only the newest plan: an older
// one, never answered before a newer run planned again, is never offered, nor one behind a plan moved aside.
export function pending(home = boqoHome()) {
  const [path] = planFiles(home, { aside: true });
  if (path) {
    const items = readPlan(path);
    const open = items.map((x, i) => (isDone(x) ? 0 : i + 1)).filter(Boolean);
    if (open.length) return { plan: path, items: open, lines: open.map((k) => line(items[k - 1])) };
  }
  return { plan: null, items: [], lines: [] };
}

// A plan moved aside (plan.json.bad) after a failed stamp: its posts were made, so they count. It was moved aside
// for being damaged as often as not, so what cannot be read counts for nothing, and never stops the count.
function readAside(path) {
  try { return readPlan(path); } catch { return []; }
}

// Items posted for a posting day (their when.date), across every run, plans moved aside too: the auto rule's daily count.
export function countPosted(date, home = boqoHome()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("--date needs YYYY-MM-DD");
  let posted = 0;
  const count = (items) => { for (const x of items) if (x.posted && x.when?.date === date) posted++; };
  for (const path of planFiles(home)) count(readPlan(path));
  const runs = join(home, "boqo-channel", "runs");
  if (existsSync(runs)) {
    for (const d of readdirSync(runs, { withFileTypes: true })) {
      const bad = join(runs, d.name, "plan.json.bad");
      if (d.isDirectory() && existsSync(bad)) count(readAside(bad));
    }
  }
  return { date, posted };
}

const USAGE = "usage: plan.mjs posted <plan.json> <n> | plan.mjs skip <plan.json> <n|all> | plan.mjs pending | plan.mjs count --date YYYY-MM-DD | plan.mjs validate <plan.json>";

export function runCli(argv, { home = boqoHome(), now = new Date() } = {}) {
  const [cmd, ...rest] = argv;
  if ((cmd === "posted" || cmd === "skip") && rest.length === 2) {
    return stamp(rest[0], rest[1], cmd === "posted" ? "posted" : "skipped", now);
  }
  if (cmd === "validate" && rest.length === 1) return validatePlan(rest[0]);
  if (cmd === "pending" && rest.length === 0) return pending(home);
  if (cmd === "count" && rest.length === 2 && rest[0] === "--date") return countPosted(rest[1], home);
  throw new Error(USAGE);
}
