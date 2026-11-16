// Channel listing and "seen" state for boqo-channel. Pure helpers plus a thin yt-dlp runner.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SEEN_LIMIT = 500;
// A first run lists this deep and marks it all, and a later run lists at most --max × 5 ≤ FIRST_DEPTH, so no old
// video below the first run's listing can ever come back as new.
export const FIRST_DEPTH = 100;
export const MAX_MAX = FIRST_DEPTH / 5;
const MIN_SECONDS = 90; // anything shorter is a Short
const OK_LIVE = [null, undefined, "not_live", "was_live"];
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

// Split any accepted channel input into [kind, name]: ["@", "handle"], ["channel", "UC..."], ["c", "x"], ["user", "x"].
function parseChannel(input) {
  const s = String(input ?? "").trim();
  if (!s) throw new Error("channel is empty: give @handle, a channel URL or a UC… id");
  let path;
  if (/^(https?:\/\/|(www\.|m\.)?youtube\.com(\/|$))/i.test(s)) {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!HOSTS.has(u.hostname.toLowerCase())) throw new Error(`not a YouTube channel: ${input}`);
    path = u.pathname;
  } else if (/^UC[\w-]{22}$/.test(s)) {
    path = `channel/${s}`;
  } else if (/[/\s]/.test(s)) {
    throw new Error(`not a YouTube channel: ${input}`);
  } else {
    path = s.startsWith("@") ? s : `@${s}`;
  }
  const parts = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (parts[0]?.startsWith("@") && parts[0].length > 1) return ["@", parts[0].slice(1)];
  if (["channel", "c", "user"].includes(parts[0]) && parts[1]) return [parts[0], parts[1]];
  throw new Error(`not a YouTube channel: ${input}`);
}

// @handle, handle, youtube.com/@x[/tab], /channel/UC…, UC… , /c/x, /user/x  ->  https://www.youtube.com/<…>/videos
export function channelUrl(input) {
  const [kind, name] = parseChannel(input);
  const path = kind === "@" ? `@${encodeURIComponent(name)}` : `${kind}/${encodeURIComponent(name)}`;
  return `https://www.youtube.com/${path}/videos`;
}

// Lowercase filesystem-safe key: @lexfridman -> at-lexfridman, channel/UCxxxx -> channel-ucxxxx, c/x -> c-x.
// Characters outside [a-z0-9._-] become "_" and a short hash of the original keeps such keys apart.
export function channelKey(input) {
  const [kind, name] = parseChannel(input);
  const raw = `${kind === "@" ? "at" : kind}-${name}`.toLowerCase();
  const safe = raw.replace(/[^a-z0-9._-]/g, "_");
  return safe === raw ? safe : `${safe}-${createHash("sha256").update(raw).digest("hex").slice(0, 8)}`;
}

export function listArgs(url, n = 15) {
  return ["--flat-playlist", "--playlist-end", String(n), "-J", "--js-runtimes", "node", url];
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// flat is yt-dlp's flat playlist of /videos, newest first. Keeps that order.
export function newVideos(flat, state, max = 3) {
  const seen = new Set(state?.seen ?? []);
  const out = [];
  for (const e of flat?.entries ?? []) {
    if (out.length >= max) break;
    if (!e || typeof e !== "object" || !e.id || seen.has(e.id)) continue;
    const url = e.url || e.webpage_url || watchUrl(e.id);
    const duration = e.duration ?? null;
    if (duration !== null && duration < MIN_SECONDS) continue;
    if (/\/shorts\//.test(url)) continue;
    if (!OK_LIVE.includes(e.live_status)) continue;
    seen.add(e.id); // a repeated id in one list is listed once
    out.push({ id: e.id, title: e.title ?? "", url: /^https?:/.test(url) ? url : watchUrl(e.id), duration });
  }
  return out;
}

// A channel's first run (no state yet): only the newest long video is to be clipped, and every other id the
// listing holds is the backlog, marked seen at once, so no later run offers it. Entries that are live or not out
// yet (upcoming, post_live) are left unmarked: they become new videos later.
export function firstRun(flat, state) {
  const videos = newVideos(flat, state, 1);
  const newest = videos[0]?.id;
  const backlog = [];
  for (const e of flat?.entries ?? []) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !/^[\w-]+$/.test(e.id)) continue;
    if (e.id === newest || backlog.includes(e.id) || !OK_LIVE.includes(e.live_status)) continue;
    backlog.push(e.id);
  }
  return { videos, state: backlog.reduce(markSeen, state ?? { seen: [] }), marked: backlog.length };
}

export function markSeen(state, id) {
  const seen = (state?.seen ?? []).filter((x) => x !== id);
  seen.push(id);
  return { ...state, seen: seen.slice(-SEEN_LIMIT) };
}

export const boqoHome = (env = process.env) => env.BOQO_HOME || join(homedir(), ".boqo");

export function statePath(channel, home = boqoHome()) {
  return join(home, "boqo-channel", "state", `${channelKey(channel)}.json`);
}

export function loadState(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) {
    if (e.code === "ENOENT") return { seen: [] };
    throw e;
  }
  const way = "fix it, or delete it: the next run then clips only the newest video";
  let state;
  try { state = JSON.parse(text); } catch { throw new Error(`state file is not valid JSON: ${path}; ${way}`); }
  if (!state || !Array.isArray(state.seen)) throw new Error(`state file has no "seen" list: ${path}; ${way}`);
  return state;
}

export function saveState(path, state) {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
}

export function ytdlpFlat(args) {
  return new Promise((resolve, reject) => {
    execFile("yt-dlp", args, { maxBuffer: 256 * 1024 * 1024, timeout: 180_000 }, (err, stdout, stderr) => {
      if (err) {
        const why = err.code === "ENOENT" ? "yt-dlp is not installed or not on PATH" : (stderr || err.message).trim().split("\n").pop();
        return reject(new Error(why));
      }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("yt-dlp did not return JSON")); }
    });
  });
}

const USAGE = "usage: channel.mjs new <channel> [--max 3] [--first] | channel.mjs mark <channel> <videoId>";

// Returns the object to print. Throws Error for anything that should become {"error": ...}.
export async function runCli(argv, { home = boqoHome(), fetchFlat = ytdlpFlat } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === "new") {
    let max = 3;
    let firstRule = false;
    const pos = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--first") firstRule = true;
      else if (rest[i] === "--max") {
        const v = rest[++i];
        if (!/^\d+$/.test(v ?? "") || Number(v) < 1 || Number(v) > MAX_MAX) {
          throw new Error(`--max needs a whole number from 1 to ${MAX_MAX}`);
        }
        max = Number(v);
      } else pos.push(rest[i]);
    }
    if (pos.length !== 1) throw new Error(`new needs a channel. ${USAGE}`);
    const url = channelUrl(pos[0]);
    const path = statePath(pos[0], home);
    const state = loadState(path);
    // No state yet, or one that remembers nothing: this channel's first run.
    const first = !existsSync(path) || state.seen.length === 0;
    const useFirst = first && firstRule;
    const flat = await fetchFlat(listArgs(url, useFirst ? FIRST_DEPTH : Math.max(15, max * 5)));
    // The newest long video, done or not: one channel entered in two forms gives the same id.
    const newest = newVideos(flat, { seen: [] }, 1)[0]?.id ?? null;
    if (useFirst) {
      const run = firstRun(flat, state);
      if (run.marked > 0) saveState(path, run.state); // an empty listing saves nothing: the next run is first again
      return { channel: url, first, newest, videos: run.videos, marked: run.marked };
    }
    return { channel: url, first, newest, videos: newVideos(flat, state, max) };
  }
  if (cmd === "mark") {
    if (rest.length !== 2 || !/^[\w-]+$/.test(rest[1])) throw new Error(`mark needs a channel and a videoId. ${USAGE}`);
    const path = statePath(rest[0], home);
    const next = markSeen(loadState(path), rest[1]);
    saveState(path, next);
    return { marked: rest[1], seen: next.seen.length };
  }
  throw new Error(USAGE);
}
