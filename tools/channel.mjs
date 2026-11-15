#!/usr/bin/env node
// channel.mjs new <channel> [--max 3]   list new long videos, newest first
// channel.mjs mark <channel> <videoId>  remember a video as done
import { runCli } from "../lib/channel.mjs";

try {
  console.log(JSON.stringify(await runCli(process.argv.slice(2))));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
