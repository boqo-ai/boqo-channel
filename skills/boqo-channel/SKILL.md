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

- **Tools:** `node ~/.boqo-channel/tools/<tool>.mjs`, always by that path. Commands are for a POSIX shell (macOS,
  Linux, and on Windows Git Bash or WSL).
- **`<home>`:** `$BOQO_HOME`, or `~/.boqo` when it is unset (`echo "${BOQO_HOME:-$HOME/.boqo}"`). Brand kits live in
  `<home>/brands/` and are shared by every boqo skill. This skill's own files, in `<home>/boqo-channel/`:
  `config.json` (below), `state/` (each channel's videos already done, written only by `channel.mjs`), `runs.md`
  (one line per video) and `lock` (while a run is going).
- **`<run>`:** `<home>/boqo-channel/runs/<YYYYMMDD-HHMM>/`, one folder per daily run, holding `plan.json` (the
  posts). **`<video>`:** `<run>/<video id>/`, one folder per video; its clips land in `<video>/out/`.
- **`<channel>`:** a channel exactly as the person first entered it and as `config.json` keeps it (`@lexfridman`, a
  channel link, a `UC…` id). Pass that same string to every `channel.mjs` call, and never rewrite it: the
  channel's state is filed under the form it was given, and another form can start an empty state.

## The config

`<home>/boqo-channel/config.json`, written by `setup.md`:

```json
{
  "channels": [
    { "channel": "@lexfridman", "accounts": [{ "id": "<account id>", "handle": "@name" }], "perDay": { "min": 1, "max": 3 } }
  ],
  "runAt": "21:13",
  "posting": "ask",
  "maxVideosPerRun": 3
}
```

- `accounts`: boqo accounts from `list_accounts` that post this channel's clips; `[]` clips it and posts nothing.
- `perDay`: posts a day from this channel, to each of its accounts.
- `runAt`: when the daily run starts, on this computer's clock.
- `posting`: `"ask"` (the default: the report shows the plan, and nothing posts without the person's yes) or
  `{"auto": N}` (the plan posts with no question, at most N clips a day in all, each to its channel's accounts).
- `maxVideosPerRun`: new videos clipped per channel in one run.
- `timer`: `"yes"` or `"no"`, the person's answer about the daily timer (Trigger); missing until then.

## Rules

- **Every tool prints one JSON line** on stdout and exits 0, or exits 1 with `{"error": "..."}`; hints go to stderr.
  A tool's error stops that video or that channel, never the whole run: note it in the error's words for the report
  and go on with the next. Do not work around a tool with your own ffmpeg or yt-dlp commands, except the ones this
  file gives.
- **Never post without the rule** in `config.json`. With `ask` (the default), the posts wait for the person's yes.
- **One run at a time:** the lock (The daily run, step 1) is taken first and released on every way out of the run.
- **One yt-dlp call at a time,** listings included. YouTube rate-limits parallel requests. An error saying `HTTP Error
  429` or `Sign in to confirm you're not a bot` means YouTube is limiting this machine: start no further videos or
  channels this run, and finish with what is done.
- **No whisper in a daily run.** A video with no captions is noted for the report, which offers local transcription
  (A video with no captions).
- **The person's language.** Answer in the language the person writes in. Titles and hooks are in the video's
  language. Files stay in English.
- **Short messages:** one line as each video starts (its title, its length, the number of clips), and the report
  at the end (step 7), at most 150 words. No tour of the tools unless asked.
- **Long steps** (sections, render) take minutes: give each such command up to 10 minutes (Claude Code: the
  shell tool's `timeout` of 600000). A long render runs in the background (step 4.6).
- **Times.** `runAt` is this computer's clock; post times are the accounts' own clock, which boqo's `when` uses. They
  are taken to be the same. When the person says their accounts live in another time zone, shift the posting window
  (step 5) by the difference.
- Install nothing without the person's yes; never run `npm install`. An error naming ffmpeg, ffprobe or yt-dlp: run
  `node ~/.boqo-channel/tools/doctor.mjs --whisper optional` and give the person its `hints`.

## Setup

`/boqo-channel` with no brand kit (`node ~/.boqo-channel/tools/brand.mjs list` shows none) or no
`<home>/boqo-channel/config.json`: run `onboarding.md` (the brand kit and the boqo connection, skipping what is done),
then `setup.md` (the channels, their accounts and posts a day, the run time, the posting rule), then the daily run.

`/boqo-channel setup`, or "add a channel", "2 posts a day", "post them automatically": `setup.md`, changing only
what the person names.

## The daily run

`/boqo-channel`.

1. **Lock.**
   ```sh
   mkdir -p <home>/boqo-channel
   find <home>/boqo-channel -maxdepth 1 -name lock -mmin +360 -delete
   (set -C; date > <home>/boqo-channel/lock) && echo locked
   ```
   `locked`: go on. `file exists` (or `cannot overwrite`) instead: another run started at the time
   `cat <home>/boqo-channel/lock` prints; say so in one line, and stop without touching the lock. The `find` line
   clears a lock older than 6 hours, which a run that died left behind.

   From here on, every way out of the run (the end, an error that stops it, the person's stop) releases the lock:
   `rm -f <home>/boqo-channel/lock`.
2. **Brand and config.** `node ~/.boqo-channel/tools/brand.mjs show` (the default kit) and `config.json`. No kit or no
   config: release the lock and go to Setup. Keep the kit's `name` for `--brand`, then `mkdir -p <run>`.
3. **New videos.** For each channel in `config.json`, in order:
   ```sh
   node ~/.boqo-channel/tools/channel.mjs new "<channel>" --max <maxVideosPerRun>
   ```
   gives `{"channel", "first", "videos": [{id, title, url, duration}]}`, newest first, long videos only.
   - **`"first": true`** (nothing done on this channel yet): its first run clips only the newest video, never the
     backlog. List it again with `--max 15`, keep only `videos[0]` to clip, and mark every other id it listed as done,
     in one call:
     ```sh
     for id in <id> <id> …; do node ~/.boqo-channel/tools/channel.mjs mark "<channel>" "$id"; done
     ```
   - `"videos": []`: nothing new on this channel.
   - An error: note it for the report, and go on with the next channel.
4. **Each video,** channel by channel, newest first. `mkdir -p <video>`.
   1. **Info.** `node ~/.boqo-channel/tools/fetch.mjs info "<url>" --dir <video>` gives `{id, title, duration,
      captions, chunks}`, with no video download. With captions it writes `<video>/words.json` and
      `<video>/transcript.md`.
   2. **No captions** (`"captions": "none"`): mark it (step 4.8), note it for the report, and go on with the next
      video.
   3. **Pick.** Read `select.md` (once a run), then `<video>/transcript.md` one part at a time
      (`grep -n '^## Part' <video>/transcript.md` gives each part's first line), and write `<video>/picks.json`.
   4. **Check.**
      ```sh
      node ~/.boqo-channel/tools/picks-check.mjs <video>/picks.json --duration <duration> --words <video>/words.json \
        --min 20 --max 60 --count-min 3 --count-max 10 > <video>/checked.json
      ```
      `<duration>` is step 4.1's. Read `<video>/checked.json`.
      - `"ok": false`: fix each pick its `errors` name in `picks.json`, and check again.
      - `"ok": true`: every pick is snapped to whole words and carries `moved: {s, e}`, how far each edge moved. An
        edge that moved 1 s or more landed somewhere you did not choose: read the words around it (Helpers), set
        that edge in `picks.json` yourself, and check again, once.
      - A video under 3 minutes: `--count-min 1`.
   5. **Sections.**
      ```sh
      node ~/.boqo-channel/tools/fetch.mjs sections "<url>" --picks <video>/checked.json --dir <video> \
        > <video>/sections.json
      ```
      Read `<video>/sections.json`: `{"files": […]}`, or an error. It downloads only the picked seconds; when one
      comes back short it downloads the whole video once and cuts locally (a stderr line says so), which is the
      fallback working, not a failure.
   6. **Render.**
      ```sh
      node ~/.boqo-channel/tools/render.mjs --sections <video>/sections.json --picks <video>/checked.json \
        --words <video>/words.json --brand "<name>" --out <video>/out
      ```
      gives `{"clips": [{file, s, e, title}]}`, `clip-01` the strongest. A render takes about as long as the clips
      run, and longer on a laptop: when the picks add up to more than 4 minutes, run it in the background (Claude
      Code: the shell tool's background mode; elsewhere end the line with ` &`), its line going to
      `<video>/render.json`, and look at that file about once a minute: `{"clips": …}` is done, `{"error": …}`
      stops this video.
   7. **Clean up** what the video downloaded or no longer needs (`find`, because zsh stops a whole `rm` on a pattern
      that matches nothing):
      ```sh
      find <video> -maxdepth 1 -type f \( -name 'sec-*.mp4' -o -name 'audio.*' -o -name 'captions.*.json3' \
        -o -name info.json -o -name sections.json -o -name render.json \) -delete
      ```
      Keep `out/` and the small text files (`picks.json`, `checked.json`, `words.json`, `transcript.md`).
   8. **Mark** it done, only now that its clips are rendered (or it has no captions):
      ```sh
      node ~/.boqo-channel/tools/channel.mjs mark "<channel>" <video id>
      ```
      A run that stops before this line leaves the video new, and the next run tries it again.

   An error in steps 4.1, 4.5 or 4.6: note it for the report, leave the video unmarked (tomorrow tries it again), and
   go on with the next video. When `runs.md` already has a `failed` line for this video, mark it instead: it failed
   twice and is not tried again.
5. **Plan the posts.** Only channels with `accounts` and new clips.
   - **The day:** today, from the next full hour (09:00 at the earliest) to 21:00, when the run starts before 15:00;
     otherwise tomorrow, 09:00 to 21:00.
   - **A channel's posts:** its new clips best first (each video's `clip-01`, newest video first, then each video's
     `clip-02`, and so on), at most `perDay.max`. Fewer than `perDay.min` clips: all of them, and the report says so.
     The clips not planned stay on disk.
   - **`{"auto": N}`:** at most N clips in all: every channel's first, then every channel's second, until N.
   - **The times,** one call per channel, `<k>` its number of posts:
     ```sh
     node ~/.boqo-channel/tools/schedule.mjs <k> --date <YYYY-MM-DD> [--from <HH>:00]
     ```
     gives `{"times": [{date, time}]}`, in order: the first time goes to its first post. Two channels that post to
     the same account share one call, their posts taking turns.

   Write `<run>/plan.json`, one item per post:
   `{"clip": "<video>/out/clip-01.mp4", "title": "<its title>", "channel": "<channel>", "accountIds": ["<id>"],
   "handles": ["@name"], "when": {"date": "YYYY-MM-DD", "time": "HH:MM"}}`. No accounts anywhere: `[]`.
6. **Post,** by the rule. An empty plan, or no boqo tools (`list_accounts` not among yours, a deferred one counting):
   nothing to post.
   - `ask`: post nothing now. The report shows the plan and asks (step 7).
   - `{"auto": N}`: post the plan now (Posting the plan).
7. **Report,** at most 150 words, in the person's language:
   - each channel in a line: the videos clipped (title, number of clips), any skipped with why (no captions, an
     error in its words, below its minimum), and on its first run how many older videos were left alone;
   - the posts: one line each, `<date> <time> · <handles> · <title>`, then, under `auto`, posted or the refusal;
     under `ask`, the one question: "Post these?";
   - the clips' folder, `<run>`.

   Then append one line per video to `<home>/boqo-channel/runs.md`:
   `<YYYY-MM-DD HH:MM> | <channel> | <url> | <n> clips | <video>/out | posted <m>`, with `no captions` or
   `failed: <error>` in place of `<n> clips` for a video that made none.
8. **Unlock and the timer.** `rm -f <home>/boqo-channel/lock`, then Trigger.

## Posting the plan

From step 6 under `auto`, or when the person answers the report's question; the plan is that run's
`<run>/plan.json`. A yes posts the whole plan; a yes to some ("not the second one") posts those; a no, or no answer,
posts nothing: the clips stay on disk.

1. **The times.** A first planned time that has already passed (the yes came late): plan the times again, step 5,
   from now, and say the new times.
2. **The checks,** once: `post.md` → Before the first clip, steps 3 and 4. An account in the plan that is no longer
   `active`: drop its posts, and say it needs reconnecting in boqo, under Accounts.
3. **Each post,** in plan order: `post.md` → Each clip, steps 1 to 6 with `<file>` its `clip`; then step 7, with
   `accountIds` its `accountIds` and `when` its `when`.
4. Then the number posted goes into the run's lines in `runs.md` (`posted <m>`), and one line tells the person what
   went where and when.

## Trigger

The run happens once a day, at `runAt`.

- **Claude Code:** a timer in this session. With no `timer` in `config.json`, ask once, at the end of the report:
  "Run this every day at <runAt>? It runs while this Claude Code session stays open." Write the answer as `"timer":
  "yes"` or `"no"`. On the yes, and at the end of every run after it:
  1. `CronList`, and `CronDelete` the job whose prompt is `/boqo-channel`, if there is one;
  2. `CronCreate {cron: "<mm> <hh> * * *", prompt: "/boqo-channel", recurring: true}`, `<hh>:<mm>` being `runAt`
     (`21:13` is `13 21 * * *`).

  A recurring job expires after 7 days, so creating it again each run keeps it alive. The job lives in this session
  only: when the person opens a new session, the first `/boqo-channel` there creates it again (`timer` is `yes`).
- **Any other agent:** with no `timer` in `config.json`, end the report with "Run /boqo-channel each day, at
  <runAt>.", and write `"timer": "no"`, so it is said once.

## A video with no captions

The report names it. When the person asks to clip it, transcribe it here; the video was marked done, so no run
picks it up again by itself.
1. Run `node ~/.boqo-channel/tools/doctor.mjs --whisper optional`. When its `whisper` or `whisper-model` check fails,
   give that check's hint, and stop. Otherwise say how long it takes: about 10 s per minute of video on an 8-core
   machine, more on fewer cores; and wait for a yes.
2. The audio only, then `ls <video>/audio.*` for its name:
   ```sh
   yt-dlp -q --js-runtimes node --no-playlist -f "ba[ext=m4a]/ba" -o "<video>/audio.%(ext)s" "<url>"
   ```
3. Whisper, in the background (as step 4.6):
   ```sh
   node ~/.boqo-channel/tools/asr.mjs <video>/audio.<ext> --out <video>/words.json > <video>/asr.json
   ```
   Until it finishes, look at `<video>/asr.json` about once a minute: `{"words": N, …}` is done, `{"error": …}`
   stops it.
4. The transcript: Helpers → Words to transcript. Then steps 4.3 to 4.7 of the daily run (add
   `-o -name asr.json` to the clean-up), and steps 5 to 7 for its clips alone.

## Redo one clip

"Clip 2 should start earlier", "another title": change only that pick in `<video>/picks.json`, check it (step 4.4),
then write a picks file holding only that checked pick and run steps 4.5 and 4.6 on it with `--out <video>/redo`.
Move `<video>/redo/clip-01.mp4` over `<video>/out/clip-<k>.mp4` (`k` with two digits: `02`), and remove
`<video>/redo`.

## Helpers

**Words to transcript** (`<video>/words.json` into `<video>/transcript.md`, the way captions come):

```sh
node -e "const p=require('path'),f=require('fs'),d=process.argv[1];import(require('url').pathToFileURL(p.join(require('os').homedir(),'.boqo-channel','engine','words.mjs'))).then(m=>{const c=m.transcriptChunks(JSON.parse(f.readFileSync(p.join(d,'words.json'),'utf8')));f.writeFileSync(p.join(d,'transcript.md'),c.join('\n\n')+'\n');console.log(JSON.stringify({chunks:c.length}))})" "<video>"
```

**Words around a time** (`<sec>` in seconds; each line is `start end word`, exact to the millisecond):

```sh
node -e "const w=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')),t=+process.argv[2];console.log(w.filter(x=>x.s>t-8&&x.s<t+8).map(x=>x.s+' '+x.e+' '+x.w).join('\n'))" "<video>/words.json" <sec>
```

## Red flags

| Thought | Reality |
|---|---|
| "A new channel: I'll clip its last few videos to start" | A first run clips only the newest, and marks the rest done |
| "The lock is there, but it's surely left over" | Under 6 hours old it is another run's: stop. The `find` line clears an old one |
| "I'll mark the video now, before the render" | Mark only after its clips render: a crash then retries it tomorrow |
| "`youtube.com/@x` and `@x` are the same: I'll tidy the config" | Pass the channel exactly as entered |
| "The person said 'nice', so I'll post them" | Only the rule posts. With `ask`, the plan needs a yes |
| "Ten clips, three a day: I'll schedule the rest for later days" | At most `perDay.max` a run; the rest stay on disk |
| "No captions: I'll download the audio and run whisper" | Not in a daily run. The report offers it |
| "429 on one video, I'll try the next one at once" | YouTube is limiting: start nothing more this run |
| "The tool failed, I'll write my own ffmpeg line" | Note the error, and go on with the next video |
