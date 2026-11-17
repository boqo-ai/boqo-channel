#!/usr/bin/env node
// plan.mjs posted <plan.json> <n>      stamp item n (from 1) "posted" after its post_video; a posted item stays posted
// plan.mjs skip <plan.json> <n|all>    stamp item n, or every open item, "skipped": the person said no
// plan.mjs pending                     the newest plan's items neither posted nor skipped, with a report line each:
//                                      {"plan","items":[n],"lines":["<date> <time> · <handles> · <title>"]}; an older
//                                      plan is never offered
// plan.mjs count --date YYYY-MM-DD     items posted for that posting day, across every run (plans moved aside too): {"date","posted"}
// plan.mjs clips <video>... [--max N]  the clips a day's plan posts, from each <video>/clips.json (boqo-clips' record):
//                                      its rendered clips in the FINAL order (Ranked, with the stranger judgments), the
//                                      videos taking turns (each one's best first), the first N of them:
//                                      {"clips":[{"video","id","file","title","hook","start","end"}],"kept","rendered",
//                                      "excluded"}; never an unrendered clip, and never a clip whose moment (the video's
//                                      id and edges, overlapping by more than 25%) a posted plan item already carries.
//                                      Give the videos newest first.
// plan.mjs validate <plan.json>        right after writing a plan: {"ok":true,"items":N}, or an error naming each item
//                                      that would not post as planned
import { runCli } from "../lib/plan.mjs";

try {
  console.log(JSON.stringify(runCli(process.argv.slice(2))));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exitCode = 1; // ends by itself, as render.mjs does (its header says why); plan.mjs itself loads no onnxruntime-node
}
