// The posting plan of one daily run, <home>/boqo-channel/runs/<run>/plan.json: an array of
// {clip, title, channel, accountIds, handles, when: {date, time}}. Each item ends "posted" (after its post_video) or
// "skipped" (the person said no to it), stamped with an ISO time, so a later yes, a resumed session or a second chat
// never posts it again.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boqoHome } from "./channel.mjs";

export function readPlan(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) {
    throw new Error(e.code === "ENOENT" ? `no plan at ${path}` : `cannot read ${path}: ${e.code ?? e.message}`);
  }
  let items;
  try { items = JSON.parse(text); } catch { throw new Error(`plan is not valid JSON: ${path}`); }
  if (!Array.isArray(items) || items.some((x) => !x || typeof x !== "object" || Array.isArray(x))) {
    throw new Error(`plan must be an array of items: ${path}`);
  }
  return items;
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

function planFiles(home) {
  const runs = join(home, "boqo-channel", "runs");
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse() // <YYYYMMDD-HHMM> names: newest first
    .map((name) => join(runs, name, "plan.json"))
    .filter((p) => existsSync(p));
}

// The newest plan with an item neither posted nor skipped.
export function pending(home = boqoHome()) {
  for (const path of planFiles(home)) {
    const items = readPlan(path);
    const open = items.map((x, i) => (isDone(x) ? 0 : i + 1)).filter(Boolean);
    if (open.length) return { plan: path, items: open };
  }
  return { plan: null, items: [] };
}

// Items posted for a posting day (their when.date), across every run: the auto rule's daily count.
export function countPosted(date, home = boqoHome()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("--date needs YYYY-MM-DD");
  let posted = 0;
  for (const path of planFiles(home)) {
    for (const x of readPlan(path)) if (x.posted && x.when?.date === date) posted++;
  }
  return { date, posted };
}

const USAGE = "usage: plan.mjs posted <plan.json> <n> | plan.mjs skip <plan.json> <n|all> | plan.mjs pending | plan.mjs count --date YYYY-MM-DD";

export function runCli(argv, { home = boqoHome(), now = new Date() } = {}) {
  const [cmd, ...rest] = argv;
  if ((cmd === "posted" || cmd === "skip") && rest.length === 2) {
    return stamp(rest[0], rest[1], cmd === "posted" ? "posted" : "skipped", now);
  }
  if (cmd === "pending" && rest.length === 0) return pending(home);
  if (cmd === "count" && rest.length === 2 && rest[0] === "--date") return countPosted(rest[1], home);
  throw new Error(USAGE);
}
