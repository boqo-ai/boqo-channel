#!/usr/bin/env node
// plan.mjs posted <plan.json> <n>      stamp item n (from 1) "posted" after its post_video; a posted item stays posted
// plan.mjs skip <plan.json> <n|all>    stamp item n, or every open item, "skipped": the person said no
// plan.mjs pending                     the newest plan with items neither posted nor skipped: {"plan","items":[n]}
// plan.mjs count --date YYYY-MM-DD     items posted for that posting day, across every run: {"date","posted"}
import { runCli } from "../lib/plan.mjs";

try {
  console.log(JSON.stringify(runCli(process.argv.slice(2))));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
