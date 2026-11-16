---
name: boqo-channel
description: "Use when the person wants a YouTube channel clipped automatically every day, or runs /boqo-channel: once a day it lists each followed channel's new long videos, makes branded vertical 9:16 clips with captions and their logo on their own machine (yt-dlp, ffmpeg) with the moments picked by you, and spreads the posts across the day through boqo only on their rule."
argument-hint: "[setup]"
---

# /boqo-channel

## Overview

You follow the person's YouTube channels and clip each one's new long videos once a day, in their brand: 1080×1920,
burned captions in their style, their logo. Everything runs on this machine: yt-dlp lists each channel and reads a
new video's captions, you pick the moments (`select.md`), yt-dlp downloads only the picked sections, ffmpeg renders.
boqo's servers are touched only to post, spread across the day, and only on the person's rule (`post.md`).

**A daily run, not a session.** `/boqo-channel` clips what is new, plans the posts, reports, and ends. It is meant to
run once a day (Trigger).

- **Tools:** `node "$HOME/.boqo-channel/tools/<tool>.mjs"`, always by that path. Commands are for a POSIX shell
  (macOS, Linux, and on Windows Git Bash or WSL).
- **`<home>`:** `$BOQO_HOME`, or `~/.boqo` when it is unset; `echo "${BOQO_HOME:-$HOME/.boqo}"` prints it. Brand kits
  live in `<home>/brands/` and are shared by every boqo skill. This skill's own files, in `<home>/boqo-channel/`:
  `config.json` (below), `state/` (each channel's videos already done, written only by `channel.mjs`), `runs.md`
  (the log, below) and `lock` (while a run or a posting is going).
- **`<run>`:** `<home>/boqo-channel/runs/<YYYYMMDD-HHMM>`, one folder per daily run, holding `plan.json` (the posts).
  **`<video>`:** `<run>/<video id>`, one folder per video; its clips land in `<video>/out/`.
- **`<channel>`:** a channel exactly as the person first entered it and as `config.json` keeps it (`@lexfridman`, a
  channel link, a `UC…` id). Pass that same string to every `channel.mjs` call, and never rewrite it: the channel's
  state is filed under the form it was given, and another form can start an empty state.
- **Paths in commands:** write `<home>`, `<run>`, `<video>` and every other path out in full, as the absolute path,
  inside double quotes, in every command: `"/Users/ana/.boqo/boqo-channel/runs/20261115-2113/y1-9yeYLJUo/picks.json"`.
  A shell variable set in one command is gone in the next (Claude Code runs each command in a new shell), and a home
  folder can hold a space.

## The config

`<home>/boqo-channel/config.json`, written by `setup.md`:

```json
{
  "channels": [
    { "channel": "@lexfridman", "accounts": [{ "id": "<account id>", "handle": "@name" }], "perDay": { "max": 3 } }
  ],
  "runAt": "21:13",
  "posting": "ask",
  "maxVideosPerRun": 3
}
```

- `accounts`: boqo accounts from `list_accounts` that post this channel's clips; `[]` clips it and posts nothing.
- `perDay.max`: at most this many of the channel's clips a day, each to all of its accounts.
- `runAt`: when the daily run starts, on this computer's clock.
- `posting`: `"ask"` (the default: the report shows the plan, and nothing posts without the person's yes) or
  `{"auto": N}` (the plan posts with no question, at most N clips a posting day in all, across runs).
- `maxVideosPerRun`: new videos clipped per channel in one run.
- `timer`: `"yes"` or `"no"`, the person's answer about the daily timer (Trigger); missing until then.

## The log

`<home>/boqo-channel/runs.md`, a line per event, appended as it happens and never edited:
`<YYYY-MM-DD HH:MM> | <channel> | <video id> | <event>`. A video's events: `started` (step 4.0), `no captions` (step
4.2), `failed: <the error's words>` (an error, step 4), `limited` (YouTube's limit, Rules), and `<n> clips |
<video>/out` or `given up` (step 4.8). A posting adds `<YYYY-MM-DD HH:MM> | posting | <plan> | posted <m>, skipped
<s>`. The time is what `date '+%Y-%m-%d %H:%M'` prints at that moment, never written from memory. Append each line
with a quoted heredoc, so the shell reads none of its words:
```sh
cat >> "<home>/boqo-channel/runs.md" <<'EOF'
2026-11-15 21:14 | @lexfridman | y1-9yeYLJUo | started
EOF
```

## Rules

- **Every tool prints one JSON line** on stdout and exits 0, or exits 1 with `{"error": "..."}`; hints go to stderr.
  A tool's error stops that video or that channel, never the whole run: note it in the error's words for the report
  and go on with the next. Do not work around a tool with your own ffmpeg or yt-dlp commands, except the ones these
  files give. A `plan.mjs` error that calls a plan damaged (`move it aside`): `mv "<plan>" "<plan>.bad"`, never
  delete it; say its posts are not made, and go on. A plan you have just written that fails `validate` is not moved
  aside: write it again, and validate again (step 5).
- **Never post without the rule** in `config.json`. With `ask` (the default), the posts wait for the person's yes.
- **One at a time:** the lock (The daily run, step 1) is taken before a run and before posting a plan, and released
  on every way out of either. A clip is posted once: `plan.json` stamps each post, and `post_video` goes once per item,
  never again after an unclear reply (Posting the plan, step 4).
- **One yt-dlp call at a time,** listings included. YouTube rate-limits parallel requests. An error saying `HTTP Error
  429` or `Sign in to confirm you're not a bot` means YouTube is limiting this machine: start no further videos or
  channels this run, and finish with what is done. It is no failure of the video: its line is `limited`, never
  `failed` (step 4), and it is tried again tomorrow.
- **No whisper in a daily run.** A video with no captions is noted for the report, which offers local transcription
  (A video with no captions).
- **The person's language.** Answer in the language the person writes in. Titles and hooks are in the video's
  language. Files stay in English.
- **Short messages:** one line as each video starts (its title, its length, the number of clips), and the report at
  the end (step 7), at most 150 words plus one line per post. No tour of the tools unless asked.
- **Long steps run in the background:** sections and whisper always, render when the picks add up to more than 4
  minutes. Each writes its one line to a file in `<video>`, and is done when that file holds the line. In Claude Code
  use the shell tool's background mode, which tells you when the command ends; elsewhere end the command with ` &`
  and look at the file about once a minute. Never wait with a foreground `sleep`. Any other command gets up to 10
  minutes (Claude Code: the shell tool's `timeout` of 600000).
- **Times.** `runAt` is this computer's clock; post times are the accounts' own clock, which boqo's `when` uses. They
  are taken to be the same. When the person says their accounts live in another time zone, shift the posting window
  (step 5) by the difference.
- Install nothing without the person's yes; never run `npm install`. An error naming ffmpeg, ffprobe or yt-dlp: run
  `node "$HOME/.boqo-channel/tools/doctor.mjs" --whisper optional` and give the person its `hints`.

## Setup

`/boqo-channel` with no brand kit (`node "$HOME/.boqo-channel/tools/brand.mjs" list` shows none) or no
`<home>/boqo-channel/config.json`: run `onboarding.md` (the brand kit and the boqo connection, skipping what is done),
then `setup.md` (the channels, their accounts and posts a day, the run time, the posting rule), then the daily run.

`/boqo-channel setup`, or "add a channel", "2 posts a day", "post them automatically": `setup.md`, changing only
what the person names.

## The daily run

`/boqo-channel`.

1. **Lock.**
   ```sh
   mkdir -p "<home>/boqo-channel"
   find "<home>/boqo-channel" -maxdepth 1 -name lock -mmin +360 -delete
   (set -C; date > "<home>/boqo-channel/lock") && echo locked
   ```
   `locked`: go on. `file exists` (or `cannot overwrite`) instead: another run, or a posting, started at the time
   `cat "<home>/boqo-channel/lock"` prints; say so in one line, and stop without touching the lock. The `find` line
   clears a lock older than 6 hours, which a run that died left behind.

   From here on, every way out of the run (the end, an error that stops it, the person's stop) releases the lock:
   `rm -f "<home>/boqo-channel/lock"`.
2. **Brand and config.** `node "$HOME/.boqo-channel/tools/brand.mjs" show` (the default kit) and `config.json`. No kit
   or no config: release the lock and go to Setup. Keep the kit's `name` for `--brand`, then `mkdir -p "<run>"`, and
   delete the upload replies a posting that died left (they hold live signed URLs; no posting runs while this run
   holds the lock):
   ```sh
   find "<home>/boqo-channel/runs" -mindepth 2 -maxdepth 2 -type f -name 'upload-*.json' -delete
   ```
3. **New videos.** For each channel in `config.json`, in order:
   ```sh
   node "$HOME/.boqo-channel/tools/channel.mjs" new "<channel>" --max <maxVideosPerRun> --first
   ```
   gives `{"channel", "first", "newest", "videos": [{id, title, url, duration}]}`, newest first, long videos only.
   - **`"first": true`:** the channel's first run. `videos` holds only its newest long video, never the backlog, and
     the tool has marked every other video it listed as done (`marked`, for the report).
   - `"videos": []`: nothing new on this channel.
   - An error: note it for the report, and go on with the next channel.
4. **Each video,** channel by channel, newest first. `mkdir -p "<video>"`.
   0. **Its earlier tries.** `grep -F "| <video id> |" "<home>/boqo-channel/runs.md"` prints its lines in the log
      (none, or no file: its first try). Each `started` line begins a try, and the video's next line says how it
      ended: `failed: …`; `no captions` or `limited`, neither of which counts as failed; or none at all (the run
      stopped there, which counts as failed). Two failed tries already: mark it (step 4.8), note "failed twice" for the report, and go on
      with the next video. Otherwise append its `started` line (The log).
   1. **Info.** `node "$HOME/.boqo-channel/tools/fetch.mjs" info "<url>" --dir "<video>"` gives `{id, title,
      duration, captions, chunks}`, with no video download. With captions it writes `<video>/words.json` and
      `<video>/transcript.md`; `chunks` is how many parts the transcript has, read in order (step 4.3). Tell the
      person, in one line, the title, the length and how many clips you will pick (`select.md` → How many).
   2. **No captions** (`"captions": "none"`): YouTube may not have made them yet. Append its `no captions` line. When
      step 4.0 showed a `no captions` line dated before today, it still has none a day later: mark it (step 4.8). A
      line from today (a rerun) does not count. Otherwise
      leave it unmarked, and tomorrow's run looks again. Note it for the report either way, and go on with the next
      video. Its `info.json` stays, for A video with no captions.
   3. **Pick.** Read `select.md` (once a run), then `<video>/transcript.md` one part at a time (`grep -n '^## Part'
      "<video>/transcript.md"` gives each part's first line), and write `<video>/picks.json`. Every edge is set on a
      quoted phrase (`select.md` → How to read):
      ```sh
      node "$HOME/.boqo-channel/tools/transcript.mjs" --words "<video>/words.json" --find "<3 to 6 words>" --near <seconds>
      ```
      gives `{"s", "e", "match", "score"}`: the seconds of the phrase's first word's start and last word's end on the
      video's timeline, found within 60 s of `--near` (its line's stamp, `[12:34]` is 754), and the words it matched.
      `{"error": "phrase not found near …"}`: read the words near that time,
      ```sh
      node "$HOME/.boqo-channel/tools/transcript.mjs" --words "<video>/words.json" --around <seconds>
      ```
      (`{"lines": ["[m:ss] text (s-e)", …]}` for 30 s either side), and quote again from them. Then check the returned
      `s` or `e` lies within a few seconds of the line's `[m:ss]` stamp you meant: a far exact repeat of the phrase can
      beat a near mis-captioned one, and then the edge is on the wrong line.
   4. **Check.**
      ```sh
      node "$HOME/.boqo-channel/tools/picks-check.mjs" "<video>/picks.json" --duration <duration> \
        --words "<video>/words.json" --min 20 --max 60 --count-min 1 --count-max 10 > "<video>/checked.json"
      ```
      `<duration>` is step 4.1's. Read `<video>/checked.json`.
      - `"ok": false`: fix each pick its `errors` name in `picks.json`, and check again.
      - `"ok": true`: every pick is snapped to whole words and carries `moved: {s, e}`, how far each edge moved. An
        edge set from `--find` moves 0.05 s. One that moved more than 0.1 s either way (`|moved.s|` or `|moved.e|`)
        landed somewhere you did not choose: find its phrase again (step 4.3), set that edge in `picks.json`, and check
        again, once.
      - `--count-min 1`: `select.md` → How many sets the count, and fewer picks are right when fewer moments pass.
   5. **Sections**, in the background (Rules):
      ```sh
      node "$HOME/.boqo-channel/tools/fetch.mjs" sections "<url>" --picks "<video>/checked.json" --dir "<video>" \
        > "<video>/sections.json"
      ```
      Done when `<video>/sections.json` holds `{"files": […]}`, or an error. It downloads only the picked seconds;
      when one comes back short it downloads the whole video once and cuts locally (a stderr line says so), which is
      the fallback working, not a failure, and takes longer.
   6. **Render**, in the background when the picks add up to more than 4 minutes (Rules):
      ```sh
      node "$HOME/.boqo-channel/tools/render.mjs" --sections "<video>/sections.json" --picks "<video>/checked.json" \
        --words "<video>/words.json" --brand "<name>" --out "<video>/out" > "<video>/render.json"
      ```
      `<video>/render.json` gets `{"clips": [{file, s, e, title}]}`, `clip-01` the strongest. A render takes about
      as long as the clips run, and longer on a laptop.
   7. **Clean up** what the video downloaded or no longer needs, with `<video>` written out in full (never empty,
      never relative: `find` would then start in the current folder). `find`, because zsh stops a whole `rm` on a
      pattern that matches nothing:
      ```sh
      find "<video>" -maxdepth 1 -type f \( -name 'sec-*' -o -name 'whole.*' -o -name 'audio.*' -o -name '*.part' \
        -o -name '*.part-*' -o -name '*.ytdl' -o -name 'captions.*.json3' -o -name info.json -o -name sections.json \
        -o -name asr.json -o -name render.json \) -delete
      ```
      Keep `out/` and the small text files (`picks.json`, `checked.json`, `words.json`, `transcript.md`).
   8. **Mark** it done, only now that its clips are rendered (or step 4.0, step 4.2 or an error gives it up):
      ```sh
      node "$HOME/.boqo-channel/tools/channel.mjs" mark "<channel>" "<video id>"
      ```
      Then its line: `<n> clips | <video>/out` after a render, `given up` otherwise. A run that stops before the
      mark leaves the video new, and the next run tries it again.

   **An error in steps 4.1, 4.5 or 4.6:** note it for the report, delete what the video made so far, with `<video>`
   written out in full (`rm -rf "<video>/out"`, then step 4.7), append its `failed: <the error's words>` line, and go
   on with the next video. Leave it unmarked, so tomorrow tries it again; when step 4.0 showed one failed try
   already, mark it instead: it failed twice and is not tried again. YouTube's limit is no error of the video
   (Rules): the same clean-up, its `limited` line, unmarked, and no further video or channel this run (step 5).
5. **Plan the posts.** A plan covers one day, the posting day, and only channels with `accounts`.
   - **An unanswered plan,** under `ask`: `node "$HOME/.boqo-channel/tools/plan.mjs" pending`. A `plan` it names is
     an earlier run's that nobody answered: `node "$HOME/.boqo-channel/tools/plan.mjs" skip "<that plan>" all`, and
     the report says so (step 7). Only the newest plan is ever posted, so an old one never goes out days late.
   - **The day:** when it is before 15:00 now (`date '+%H:%M'`), today, from the next full hour from now (09:00 at the
     earliest) to 21:00; otherwise tomorrow, 09:00 to 21:00.
   - **A channel's posts:** the clips of its videos marked done in this run after a render (step 4.8), never a clip
     from an earlier run or from a video left unmarked. Best first (each video's `clip-01`, newest video first, then
     each video's `clip-02`, and so on), at most `perDay.max`. The clips not planned stay on disk. A clip's title is
     its pick's `title` in `<video>/checked.json`: pick 1 is `clip-01.mp4`, pick 2 `clip-02.mp4`, and so on.
   - **`{"auto": N}`:** first the posts already made for that day,
     `node "$HOME/.boqo-channel/tools/plan.mjs" count --date <YYYY-MM-DD>` (`{"posted": P}`); then at most N − P
     clips in all: every channel's first, then every channel's second, until N − P.
   - **The times,** one call per channel, `<k>` its number of posts:
     ```sh
     node "$HOME/.boqo-channel/tools/schedule.mjs" <k> --date <YYYY-MM-DD> [--from <HH>:00]
     ```
     gives `{"times": [{date, time}]}`, in order: the first time goes to its first post. Two channels that post to
     the same account share one call, their posts taking turns.

   Write `<run>/plan.json`, one item per post:
   `{"clip": "<video>/out/clip-01.mp4", "title": "<its title>", "channel": "<channel>", "accountIds": ["<id>"],
   "handles": ["@name"], "when": {"date": "YYYY-MM-DD", "time": "HH:MM"}}`. Nothing to post: `[]`. Then check it:
   ```sh
   node "$HOME/.boqo-channel/tools/plan.mjs" validate "<run>/plan.json"
   ```
   `{"ok": true}`, or an error naming each item that would not post as planned: fix those in the file, and validate
   again.

   A run that stops after marking a video and before writing `plan.json` leaves that video's clips on disk, never
   posted: a lost post, never a double one.
6. **Post,** by the rule. An empty plan, or no boqo tools (`list_accounts` not among yours, a deferred one counting):
   nothing to post.
   - `ask`: post nothing now. The report shows the plan and asks (step 7).
   - `{"auto": N}`: Posting the plan, now; this run already holds the lock.
7. **Report,** at most 150 words plus one line per post, in the person's language:
   - each channel in a line: the videos clipped (title, number of clips), any skipped with why (no captions yet,
     tried again tomorrow; no captions a day later; an error in its words; failed twice; YouTube's limit), and on its
     first run how many older videos were left alone (step 3's `marked`);
   - an unanswered plan skipped in step 5: one line, its number of posts dropped, their clips still on disk;
   - the posts: one line each, `<date> <time> · <handles> · <title>`, then, under `auto`, posted or the refusal;
     under `ask`, the one question: "Post these?";
   - the clips' folder, `<run>`, and what all runs take on disk, `du -sh "<home>/boqo-channel/runs"`. When
     `find "<home>/boqo-channel/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14` lists any run, add: "Runs older
     than 14 days can go: say 'delete old runs'." On that ask only, with `<home>` written out in full:
     ```sh
     find "<home>/boqo-channel/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
     ```
8. **Unlock and the timer.** `rm -f "<home>/boqo-channel/lock"`, then Trigger (its question waits when the report asked
   "Post these?").

## Posting the plan

From step 6 under `auto`, or when the person answers the report's question, in this chat or a later one.

1. **The lock.** Under `auto` the run holds it. Otherwise take it as step 1 does; `file exists`: say a run or a
   posting started at the time `cat "<home>/boqo-channel/lock"` prints, and to say yes again once it is done, and
   stop (one that died is cleared after 6 hours). Release it at the end, and on every way out.
2. **The plan.** Under `auto`, `<plan>` is this run's `<run>/plan.json`, and its open items are all of them (numbered
   from 1). After a question:
   ```sh
   node "$HOME/.boqo-channel/tools/plan.mjs" pending
   ```
   gives `{"plan": "<path>", "items": [n, …], "lines": […]}`: the newest plan, its items (numbered from 1) neither
   posted nor skipped, and a report line for each. `"plan": null`: nothing waits; say so, and stop. Every command
   below writes `<plan>` out in full.
   - **Not the plan this chat just reported** (a later chat, or another path than the `<run>/plan.json` you wrote):
     the yes was to another question. Show its `lines`, ask "Post these?" again, release the lock, and stop: the
     answer to that starts Posting the plan again.
   - A no, or no answer: `node "$HOME/.boqo-channel/tools/plan.mjs" skip "<plan>" all`, its `posting` line (The
     log), release the lock, and stop: the clips stay on disk. Then the timer question, when it is still to come
     (Trigger). A `skip` that fails: A failed stamp (step 4).
   - A yes to some ("not the second one"): `plan.mjs skip "<plan>" <n>` for each one left out (one that fails: A
     failed stamp, step 4).
3. **The times.** When the first open item's time has already passed (the yes came late), plan the open items again
   (step 5, from now), write the new times into their `when`, keeping every other key, and say the new times.
4. **Post them** by `post.md`: Before the first clip, once; then Each clip, for every open item in plan order. What
   `post_video` answers decides the item, before anything else:
   - **A clear answer,** the post made and its time: stamp it.
     ```sh
     node "$HOME/.boqo-channel/tools/plan.mjs" posted "<plan>" <n>
     ```
     A stamped item is never posted again, by a later yes, a resumed session or a second chat; `"already": true`
     means it was posted before.
   - **A refusal,** boqo's own sentence (post.md → Refusals): no stamp, as post.md says.
   - **Anything else** (a timeout, a lost connection, an empty or cut-off reply, an error that is not boqo's
     sentence): the post may have gone through. Never call `post_video` again for this item. Call
     `list_schedule {accountId}` for each of its accounts: a post whose `clipTitle` is the item's title (or the
     reworded one post.md step 2 gave), within a day of its `when` (`scheduledAt` is UTC), means it went: stamp it
     posted. None: `plan.mjs skip "<plan>" <n>`, so no later yes posts it, and tell the person this clip's post is
     unclear and not in boqo's schedule; they can post it again by asking. Then the next clip.

   **A failed stamp** (`plan.mjs posted` or `skip` gives an error, in any case above or in step 2): run it once more.
   When it fails again, stop posting this plan and move it aside, `mv "<plan>" "<plan>.bad"`: no later yes finds it
   then. Tell the person which clips went and that the rest are not posted, with the error's words. When the `mv`
   fails too, tell them plainly never to answer yes to this plan again, and name the clips that went. Never go on
   posting with a plan that cannot record what went.
5. Its `posting` line goes into `runs.md` (The log), one line tells the person what went where and when, and the lock
   is released. Then the timer question, when it is still to come (Trigger).

**A skipped item, later:** only on "post <title> anyway", for that item alone: the lock, a fresh `post_video` by
`post.md`, then `plan.mjs posted "<plan>" <n>`, `<plan>` the plan that holds it (posted replaces the skip). A bare yes
never posts a skipped item.

## Trigger

The run happens once a day, at `runAt`.

**One question at a time.** The timer question is never asked beside "Post these?": it ends the report only when the
report asks nothing else, and otherwise comes right after the person's answer about the posts (Posting the plan, the
no in step 2 or step 5). When both are open anyway (a plan from another chat still waits), a bare "yes" or "no"
answers neither: ask "Which one: posting these, or the daily timer?"

- **Claude Code:** a timer in this session. With no `timer` in `config.json`, ask once: "Run this every day at
  <runAt>? It runs only while this Claude Code session stays open, and it may stop to ask your permission for a
  step: approve each one once, or keep this session open where you can see it." Write the answer as `"timer": "yes"`
  or `"no"`. No `CronCreate` among your tools (a deferred one counting): do as any other agent does (below). On the
  yes, and at the end of every run after it:
  1. `CronList`, and `CronDelete` the job whose prompt is `/boqo-channel`, if there is one;
  2. `CronCreate {cron: "<mm> <hh> * * *", prompt: "/boqo-channel", recurring: true}`, `<hh>:<mm>` being `runAt`
     (`21:13` is `13 21 * * *`).

  A recurring job expires after 7 days, so creating it again each run keeps it alive. The job lives in this session
  only: when the person opens a new session, the first `/boqo-channel` there creates it again (`timer` is `yes`).
- **Any other agent:** with no `timer` in `config.json`, end the report with "Run /boqo-channel each day, at
  <runAt>.", and write `"timer": "no"`, so it is said once.

## A video with no captions

The report names it. When the person asks to clip it, transcribe it here. It is marked done once its clips render
(step 5 below), so no run clips it again.
1. Run `node "$HOME/.boqo-channel/tools/doctor.mjs" --whisper optional`. When its `whisper` or `whisper-model` check
   fails, give that check's hint, and stop. Otherwise say how long it takes, about 13 s per minute of audio on an
   8-core CPU with the small model, more on fewer cores, and wait for a yes. When `plan.mjs pending` names a plan
   the person has not answered, say too that this video's plan replaces it (step 5) unless they answer it first.
   After the yes, take the lock (The daily run, step 1; `file exists`: say a run or a posting is going, and to ask
   again once it is done), and release it at the end and on every way out.
2. The audio only, then `ls "<video>"` for its name (`audio.m4a`, or `audio.webm`):
   ```sh
   yt-dlp -q --js-runtimes node --no-playlist -f "ba[ext=m4a]/ba" -o "<video>/audio.%(ext)s" "<url>"
   ```
3. Whisper, in the background (Rules):
   ```sh
   node "$HOME/.boqo-channel/tools/asr.mjs" "<video>/audio.<ext>" --out "<video>/words.json" > "<video>/asr.json"
   ```
   `{"words": N, …}` in `<video>/asr.json` is done; `{"error": …}` stops it. `"englishOnly": true` is a model that
   hears every video as English: when this one is not in English (`<video>/info.json`'s `language`, the title, the
   person), say so, and offer the multilingual model (about 150 MB). On a yes:
   ```sh
   mkdir -p "<home>/models" && curl -L -o "<home>/models/ggml-base.bin" \
     "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
   ```
   then run whisper again with the video's language, `--lang <code>` (`--lang ru`) before `--out`: with a language
   other than English it takes a multilingual model.
4. The transcript, with the most-replayed marks (`--heat`) when `<video>/info.json` is there:
   ```sh
   node "$HOME/.boqo-channel/tools/transcript.mjs" --words "<video>/words.json" --out "<video>/transcript.md" \
     --heat "<video>/info.json"
   ```
   `the words file has no words`: whisper heard no speech. Tell the person, and stop. Known limit: whisper can hear a
   word that is not there ("Oh") in silence at a multiple of 30 s, its window edge; never set an edge on one.
5. Steps 4.3 to 4.8 of the daily run, then steps 5 to 7 for its clips alone, the plan going into a new `<run>` folder
   named for now.

## Redo one clip

"Clip 2 should start earlier", "another title". Take the lock first (The daily run, step 1; `file exists`: say a run
or a posting is going, and to ask again once it is done), and release it at the end and on every way out.

Change only that pick in `<video>/picks.json` (a new edge by step 4.3's `--find`) and check the whole set again (step
4.4). Write that one checked pick, as a one-item array, to `<video>/redo-picks.json`. Run step 4.5 with
`--picks "<video>/redo-picks.json"` and its line going to `<video>/redo-sections.json`, then step 4.6 with
`--sections "<video>/redo-sections.json" --picks "<video>/redo-picks.json" --out "<video>/redo"`. Move
`<video>/redo/clip-01.mp4` over `<video>/out/clip-<k>.mp4` (`k` with two digits: `02`). Then delete
`<video>/redo-picks.json`, `<video>/redo-sections.json` and the `<video>/redo` folder, and run step 4.7's cleanup. A
clip already posted stays posted as it was.

A new title goes into the plan too: when the newest plan (`plan.mjs pending`) has this clip in an open item (its
`clip` is `<video>/out/clip-<k>.mp4`), write the new title into that item's `title`, keeping every other key, then
`node "$HOME/.boqo-channel/tools/plan.mjs" validate "<plan>"`.

## Red flags

| Thought | Reality |
|---|---|
| "A new channel: I'll clip its last few videos to start" | `--first`: a first run clips only the newest, and marks the rest done |
| "The lock is there, but it's surely left over" | Under 6 hours old it is another run's: stop. The `find` line clears an old one |
| "I'll mark the video now, before the render" | Mark only after its clips render: a crash then retries it tomorrow |
| "Yesterday's clips are on disk, I'll add them to the plan" | Only clips of videos marked in this run |
| "The person said yes again, so I'll post the plan again" | `plan.mjs pending`: a stamped item is never posted twice |
| "A yes in a new chat: I'll post what `pending` gives" | That yes answered another chat. Show its `lines` and ask again |
| "`youtube.com/@x` and `@x` are the same: I'll tidy the config" | Pass the channel exactly as entered |
| "`@x` and its `UC…` id: two channels to follow" | The same `newest` is one channel: "already followed as …" (setup.md) |
| "The person said 'nice', so I'll post them" | Only the rule posts. With `ask`, the plan needs a yes |
| "One message: post these, and the daily timer?" | One question at a time: the timer comes after the posting answer |
| "Ten clips, three a day: I'll schedule the rest for later days" | At most `perDay.max` a run; the rest stay on disk |
| "No captions: I'll download the audio and run whisper" | Not in a daily run. The report offers it |
| "No captions today, so it never will have" | YouTube can be late: unmarked the first time, marked when a day later has none |
| "A 429 on this video: that's its failed try" | `limited`, not `failed`: YouTube's limit is not the video's fault |
| "429 on one video, I'll try the next one at once" | YouTube is limiting: start nothing more this run |
| "The opening is mid-line, I'll estimate where it falls" | Quote its first words and `--find` them |
| "picks-check moved an edge 0.4 s, close enough" | More than 0.1 s either way (`\|moved.s\|` or `\|moved.e\|`): find its phrase again and set it |
| "The tool failed, I'll write my own ffmpeg line" | Note the error, and go on with the next video |
| "`post_video` timed out, I'll call it again" | It may have posted. `list_schedule` decides; never a second `post_video` |
| "`RUN=…` once, then `$RUN` in every command" | The variable is gone in the next command. Write the path out |
