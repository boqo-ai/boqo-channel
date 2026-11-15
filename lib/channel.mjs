// Channel listing and "seen" state for boqo-channel. Pure helpers plus a thin yt-dlp runner.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SEEN_LIMIT = 500;
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
  let state;
  try { state = JSON.parse(text); } catch { throw new Error(`state file is not valid JSON, fix or delete it: ${path}`); }
  if (!state || !Array.isArray(state.seen)) throw new Error(`state file has no "seen" list, fix or delete it: ${path}`);
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

const USAGE = "usage: channel.mjs new <channel> [--max 3] | channel.mjs mark <channel> <videoId>";

// Returns the object to print. Throws Error for anything that should become {"error": ...}.
export async function runCli(argv, { home = boqoHome(), fetchFlat = ytdlpFlat } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === "new") {
    let max = 3;
    const pos = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--max") {
        const v = rest[++i];
        if (!/^\d+$/.test(v ?? "") || Number(v) < 1) throw new Error("--max needs a whole number of 1 or more");
        max = Number(v);
      } else pos.push(rest[i]);
    }
    if (pos.length !== 1) throw new Error(`new needs a channel. ${USAGE}`);
    const url = channelUrl(pos[0]);
    const state = loadState(statePath(pos[0], home));
    const flat = await fetchFlat(listArgs(url, Math.max(15, max * 5)));
    return { channel: url, videos: newVideos(flat, state, max) };
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
