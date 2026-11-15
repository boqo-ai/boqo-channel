#!/usr/bin/env node
// schedule.mjs <n> --date YYYY-MM-DD [--from 09:00] [--to 21:00]
//   n posting times spread across the day, for post_video's `when {date, time}`, on the accounts' own clock.
//   Prints {"times":[{"date","time"}]}. Not part of the vendored engine: it only wraps engine/schedule.mjs.
import { spreadTimes } from "../engine/schedule.mjs";

const USAGE = "usage: schedule.mjs <n> --date YYYY-MM-DD [--from 09:00] [--to 21:00]";

function parse(argv) {
  const pos = [];
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--date" || a === "--from" || a === "--to") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value. ${USAGE}`);
      o[a.slice(2)] = v;
    } else if (a.startsWith("--")) {
      throw new Error(`unknown flag ${a}. ${USAGE}`);
    } else pos.push(a);
  }
  if (pos.length !== 1 || !/^\d+$/.test(pos[0])) throw new Error(`n must be a whole number of 0 or more. ${USAGE}`);
  if (!o.date) throw new Error(`--date is required. ${USAGE}`);
  return { n: Number(pos[0]), ...o };
}

try {
  const { n, ...when } = parse(process.argv.slice(2));
  console.log(JSON.stringify({ times: spreadTimes(n, when) }));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
