<!-- copied from boqo-ai/boqo-clips skills/boqo-clips/post.md @ 620305e; keep in step -->
# Posting through boqo

Runs from SKILL.md → Posting the plan, for the items of `<plan>` still open. It posts only through boqo's tools, and
only by the rule in `<home>/boqo-channel/config.json`. Posting the clip as it is costs no credits. Paths go into
commands written out in full, in double quotes (SKILL.md → Overview).

## Before the first clip

1. **No boqo tools** (no `list_accounts`, onboarding.md → 2): stop here. Posting is not offered unless the person
   asks; then give the one line for this agent from onboarding.md → 2.
2. **The plan.** `get_account`. Its `planKey` `none` (the plan "Free"): say "Autoposting comes with the 7-day trial
   or Starter from $12", and stop. Do not call `billing_link`; give a link only when the person asks how to start.
3. **The rule.**
   - `ask`, or no config file: the report asked "Post these?" (SKILL.md → The daily run, step 7), and only the items
     the person said yes to are open. A no, or no answer: nothing is posted; the files stay where they are.
   - `{"auto": N}`: the plan already holds at most N posts for its day, best first, with no question. The person is
     told what went (step 7).
4. **The accounts.** `list_accounts`, the ones with status `active`. Each item's `accountIds` are its channel's
   accounts in the config; never add or choose others. An account that is no longer active: leave it out of every
   `post_video` below, and say it needs reconnecting in boqo, under Accounts. An item with no active account left:
   `node "$HOME/.boqo-channel/tools/plan.mjs" skip "<plan>" <k>`, `<k>` its number in the plan.

## Each clip

One clip at a time: each open item of the plan, in order. `<file>` is its `clip`, `<k>` its number in the plan, and
`<run>` the plan's folder.
1. `node "$HOME/.boqo-channel/tools/boqo-upload.mjs" probe "<file>"` gives `sizeBytes`, `contentType` and `passthrough`.
   `passthrough: false`: say its `reasons` and skip the clip.
2. `node "$HOME/.boqo-channel/tools/boqo-upload.mjs" name "<the clip's title>"` gives `filename`. An error (a `-`, `_` or `/`,
   a single word): reword the title without it, and use the new title from here on.
   `node "$HOME/.boqo-channel/tools/boqo-upload.mjs" caption --title "<the clip's title>" --hook "<the clip's hook>"`
   gives the words boqo's own Clips page writes for a post, `{tiktok, instagram, youtube}` (The caption). The hook is
   the item's `hook` in the plan; leave `--hook` out when it is `null` or the item has none. Add `--tags a,b` only for
   hashtags the person named.
3. `create_upload {filename, contentType: "video/mp4", sizeBytes, kind: "post"}`. Write its reply, exactly as it came,
   to `<run>/upload-<k>.json`. It holds signed upload URLs: never print them, quote them or put them in `runs.md`.
4. `node "$HOME/.boqo-channel/tools/boqo-upload.mjs" put "<file>" --reply "<run>/upload-<k>.json"` gives
   `{"ok": true, "projectId", …}`: delete `<run>/upload-<k>.json`. `"ok": false` or an error: say which part failed,
   and offer one retry, `put` again with the same reply file (its URLs live 48 hours). Once the person stops, delete
   `<run>/upload-<k>.json`: it still holds live signed URLs.
5. `complete_upload {projectId}`. A link in its reply (a daily credit cap on this connection): give it to the person,
   and stop this clip.
6. `post_video {items: [{source: "<projectId>", accountIds: ["<id>", …], when: {date: "YYYY-MM-DD", time: "HH:MM"}}]}`,
   once for this item, with its active `accountIds` and its `when`. It takes a Post project that is not ready yet, and
   boqo makes the post once the file is ready, so there is no need to wait first. The time is on the account's own
   clock. `caption` only as The caption says, and no `uniqueize`. A clear answer, the post made and its time: stamp the item
   before anything else, `node "$HOME/.boqo-channel/tools/plan.mjs" posted "<plan>" <k>`. A refusal: no stamp
   (Refusals).
   An unclear reply (a timeout, a dropped connection, an empty or cut-off reply, an error that is not boqo's own
   sentence): never call `post_video` again for this item; it may have gone through. `list_schedule {accountId}` for
   each of its accounts: a post whose `clipTitle` is this item's title (or step 2's reworded one), within a day of its
   `when` (`scheduledAt` is UTC), counts as posted: stamp it as above. None:
   `node "$HOME/.boqo-channel/tools/plan.mjs" skip "<plan>" <k>`, so no later yes posts it, and tell the person it may
   not have gone out (SKILL.md → Posting the plan, step 4).
7. One line: the clip, the accounts, and when it goes out.

**After the last clip,** delete any reply file left, `find "<run>" -maxdepth 1 -type f -name 'upload-*.json' -delete`,
then `get_project {projectId}` for each one posted. `queued`, `processing` or `ready` is fine.
`failed`: tell the person which clip, with its `error` (the text inside its `<data kind="project_error">` tag); that
clip will not be posted. To look again later without a foreground `sleep` (Claude Code refuses one), run
`sleep 20` in the background and check when it ends.

## The caption

Boqo writes a post's words from the file name: the clip's title, plus the account's default tags. Hosted's own
Clips page writes more: the clip's hook, then its title, then the tags, each after a blank line (the `caption`
command in step 2; YouTube's title is the clip's title, its description the hook and the tags). Those words need
"Captions written by the agent" switched on in boqo (Accounts, the account, Defaults).
- **Not on, or not known:** leave `caption` out. The post says the title and the account's tags. The first time, say
  this one sentence and no more: "These posts carry only each clip's title and the account's tags; switch on
  'Captions written by the agent' in boqo (Accounts, the account, Defaults) and they carry the hook too."
- **On** (the person says so): pass `caption` in step 6, one for the item: the `text` of `youtube` when every chosen
  account is on YouTube, else the `text` of `instagram` (it fits TikTok and YouTube too). Show the words in the
  one line of step 7. A caption written this way carries only the tags you gave `--tags`: boqo adds none of the
  account's own.
A refusal naming that setting: post again without `caption`.

## Refusals

A refusal from boqo is its own sentence: say it as it came, keep the files, stop that clip. A plan refusal stops them
all, with the plan line, "Autoposting comes with the 7-day trial or Starter from $12": "Accounts and scheduling are
on paid plans." from `create_upload`, or "Publishing needs a paid plan." from `post_video`.

What was posted and skipped goes into the plan's `posting` line in `runs.md` (SKILL.md → Posting the plan, step 5).
