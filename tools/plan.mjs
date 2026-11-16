#!/usr/bin/env node
// plan.mjs posted <plan.json> <n>      stamp item n (from 1) "posted" after its post_video; a posted item stays posted
// plan.mjs skip <plan.json> <n|all>    stamp item n, or every open item, "skipped": the person said no
// plan.mjs pending                     the newest plan's items neither posted nor skipped, with a report line each:
//                                      {"plan","items":[n],"lines":["<date> <time> · <handles> · <title>"]}; an older
//                                      plan is never offered
// plan.mjs count --date YYYY-MM-DD     items posted for that posting day, across every run (plans moved aside too): {"date","posted"}
// plan.mjs validate <plan.json>        right after writing a plan: {"ok":true,"items":N}, or an error naming each item
//                                      that would not post as planned
import { runCli } from "../lib/plan.mjs";

try {
  console.log(JSON.stringify(runCli(process.argv.slice(2))));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
