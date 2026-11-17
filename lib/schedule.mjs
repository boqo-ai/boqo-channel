// Posting times for a day that already holds some (a second plan that day: SKILL.md step 5, `plan.mjs day`).
// spreadAround(n, {date, from, to, avoid}) gives n times on `date` inside [from, to], each at least 30 minutes from
// every time in `avoid` and from each other, on 5-minute marks, spread as far apart as the free time allows. With no
// taken time near the window it is engine/schedule.mjs's spreadTimes, same times. A day with no room for n is an error,
// never a time on another day: that day's taken times are not known here.
import { spreadTimes } from "../engine/schedule.mjs";

const GAP = 30; // engine/schedule.mjs's MIN_GAP
const STEP = 5; // and its STEP

function parseTime(s) {
  const m = typeof s === "string" ? /^(\d{2}):(\d{2})$/.exec(s) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`bad time ${JSON.stringify(s)}: want HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

// A free stretch [l, r] of the window. Each end is the window's own edge (a post may sit on it) or an anchor, a taken
// time 30 minutes beyond it (a post keeps its distance from it as from another post).
function stretches(start, end, taken) {
  let free = [[start, end]];
  for (const a of taken) {
    free = free.flatMap(([l, r]) => [
      ...(a - GAP >= l ? [[l, Math.min(r, a - GAP)]] : []),
      ...(a + GAP <= r ? [[Math.max(l, a + GAP), r]] : []),
    ]);
  }
  return free.map(([l, r]) => ({ lo: l === start ? l : l - GAP, loEdge: l === start, hi: r === end ? r : r + GAP, hiEdge: r === end }));
}

// The distance between k posts spread over a stretch, and their places: evenly between its anchors, an edge holding a post.
function spacing(g, k) {
  const span = g.hi - g.lo;
  if (g.loEdge && g.hiEdge) return k === 1 ? Infinity : span / (k - 1);
  return span / (g.loEdge || g.hiEdge ? k : k + 1);
}
function places(g, k) {
  if (g.loEdge && g.hiEdge && k === 1) return [g.lo + (g.hi - g.lo) / 2];
  const s = spacing(g, k);
  const first = g.loEdge ? 0 : 1;
  return Array.from({ length: k }, (_, i) => g.lo + (first + i) * s);
}

export function spreadAround(n, { date, from = "09:00", to = "21:00", avoid = [] } = {}) {
  spreadTimes(0, { date, from, to }); // the engine's own checks of date, from and to
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a whole number of 0 or more");
  const start = parseTime(from);
  const end = parseTime(to);
  const taken = [...new Set(avoid.map(parseTime))].filter((a) => a > start - GAP && a < end + GAP).sort((a, b) => a - b);
  const noRoom = () => new Error(`no room on ${date} for ${n} posts between ${from} and ${to}, 30 minutes from ${avoid.join(", ")} and from each other; plan fewer`);
  if (n === 0) return [];
  if (!taken.length) {
    if (n > Math.floor((end - start) / GAP) + 1) throw noRoom();
    return spreadTimes(n, { date, from, to });
  }

  // Each post goes to the stretch where it keeps the widest distance (the earliest on a tie): the widest spread there
  // is, since a stretch's distance only shrinks as it takes more.
  const free = stretches(start, end, taken);
  const k = free.map(() => 0);
  for (let i = 0; i < n; i++) {
    let best = -1;
    let wide = -Infinity;
    free.forEach((g, j) => {
      const s = spacing(g, k[j] + 1);
      if (s > wide + 1e-9) { best = j; wide = s; }
    });
    if (best === -1 || wide < GAP) throw noRoom();
    k[best]++;
  }

  const times = free
    .flatMap((g, j) => (k[j] ? places(g, k[j]) : []))
    .map((at) => {
      let m = Math.round(at / STEP) * STEP;
      if (m > end) m -= STEP; // a window edge off a 5-minute mark is never overshot, as in the engine
      if (m < start) m += STEP;
      return m;
    })
    .sort((a, b) => a - b);
  // With every time on a 5-minute mark rounding keeps every distance (round(x + 30) is round(x) + 30; the 400 grid cases
  // in tests/schedule.test.mjs); a hand-written time off the marks could cost one, and that is no room.
  const kept = times.every((m, i) => m >= start && m <= end && (i === 0 || m - times[i - 1] >= GAP) && taken.every((a) => Math.abs(m - a) >= GAP));
  if (!kept) throw noRoom();
  return times.map((m) => ({ date, time: fmtTime(m) }));
}
