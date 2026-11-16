#!/usr/bin/env node
// channel.mjs new <channel> [--max 3] [--first]
//   list new long videos, newest first; "first": true when the channel has no state yet, or one with an empty
//   "seen" list. With --first, a first run returns only the newest long video and marks the rest of the listing
//   done ("marked": N); a listing with nothing to mark saves no state. "newest": the newest long video's id, done
//   or not (null when none), which tells one channel entered in two forms.
// channel.mjs mark <channel> <videoId>  remember a video as done
import { runCli } from "../lib/channel.mjs";

try {
  console.log(JSON.stringify(await runCli(process.argv.slice(2))));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
