---
name: boqo-channel
description: "Use when the person wants a YouTube channel clipped automatically every day, or runs /boqo-channel: once a day it lists each followed channel's new long videos, makes branded vertical 9:16 clips with captions and their logo on their own machine (yt-dlp, ffmpeg) with the moments picked by you, and spreads the posts across the day through boqo only on their rule."
argument-hint: "[setup | timer]"
---

# /boqo-channel

## Overview

You follow the person's YouTube channels and clip each one's new long videos once a day, in their brand: 1080×1920,
burned captions in their style, their logo, by boqo's own pipeline. Everything runs on this machine: yt-dlp lists each
channel and reads a new video's captions; for each new video you select the moments from the whole transcript
(`select.md`) and `select-check` snaps, scores and ranks them; the first 10 render with face-aware framing; you judge
each one as a stranger would (`stranger.md`), and the final order puts the best first. The daily plan posts from that
order. boqo's servers are touched only to post, spread across the day, and only on the person's rule (`post.md`), or
to transcribe a video with no captions, when the person chose that and said yes to its cost.

**A daily run, not a session.** `/boqo-channel` clips what is new, plans the posts, reports, and ends. It is meant to
run once a day (Trigger).

**Attended or not.** `/boqo-channel timer` is the daily timer's own prompt (Trigger), and says nobody is there: an
unattended run asks nothing it must wait for, and never holds a video for a question (step 4.2, Held videos). A plain
`/boqo-channel`, or any other words from the person, is an attended run: the person is in the chat.

- **Tools:** `node "$HOME/.boqo-channel/tools/<tool>.mjs"`, always by that path. Commands are for a POSIX shell
  (macOS, Linux, and on Windows Git Bash or WSL).
- **`<home>`:** `$BOQO_HOME`, or `~/.boqo` when it is unset; `echo "${BOQO_HOME:-$HOME/.boqo}"` prints it. Brand kits
  live in `<home>/brands/` and are shared by every boqo skill. This skill's own files, in `<home>/boqo-channel/`:
  `config.json` (below), `state/` (each channel's videos already done, written only by `channel.mjs`), `runs.md`
  (the log, below) and `lock` (while a run or a posting is going).
- **`<run>`:** `<home>/boqo-channel/runs/<YYYYMMDD-HHMM>`, one folder per daily run, holding `plan.json` (the posts).
  **`<video>`:** `<run>/<video id>`, one folder per video; its clips land in `<video>/out/`. It is the run folder of
  the tools that clip one video (`select-request`, `select-check`, `clips`, `render`, `stranger`, `panels`,
  `fetch sections`), so each takes `--run "<video>"`, and `<video>/clips.json` is the video's record.
- **`<channel>`:** a channel exactly as the person first entered it and as `config.json` keeps it (`@lexfridman`, a
  channel link, a `UC…` id). Pass that same string to every `channel.mjs` call, and never rewrite it: the channel's
  state is filed under the form it was given, and another form can start an empty state.
- **Paths in commands:** write `<home>`, `<run>`, `<video>` and every other path out in full, as the absolute path,
  inside double quotes, in every command: `"/Users/ana/.boqo/boqo-channel/runs/20261115-2113/y1-9yeYLJUo/clips.json"`.
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
  "maxVideosPerRun": 3,
  "transcript": "local"
}
```

- `accounts`: boqo accounts from `list_accounts` that post this channel's clips; `[]` clips it and posts nothing.
- `perDay.max`: at most this many of the channel's clips a day, each to all of its accounts.
- `runAt`: when the daily run starts, on this computer's clock.
- `posting`: `"ask"` (the default: the report shows the plan, and nothing posts without the person's yes) or
  `{"auto": N}` (the plan posts with no question, at most N clips a posting day in all, across runs).
- `maxVideosPerRun`: new videos clipped per channel in one run.
- `transcript`: `"local"` (the default) or `"boqo"`: who transcribes a video that has no captions. `"boqo"` is the
  person's ask, and spends credits (Rules); a missing key is `"local"`.
- `timer`: `"yes"` or `"no"`, the person's answer about the daily timer (Trigger); missing until then.

## The log

`<home>/boqo-channel/runs.md`, a line per event, appended as it happens and never edited:
`<YYYY-MM-DD HH:MM> | <channel> | <video id> | <event>`. A video's events: `started` (step 4.0), `no captions` (step
4.2), `failed: <the error's words>` (an error, step 4), `limited` (YouTube's limit, Rules), and `<n> clips |
<video>/out` or `given up` (step 4.13). A posting adds `<YYYY-MM-DD HH:MM> | posting | <plan> | posted <m>, skipped
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
  (A video with no captions). With `"transcript": "boqo"`, an attended run offers boqo's transcript instead (Held
  videos).
- **Ask before boqo transcribes.** It spends credits: 1 for each started 10 minutes of audio, at least 1 a video.
  An attended run asks once, for all of a day's videos together, and says the total minutes and credits (Held
  videos), after the day's plan and report: the clips of the videos that have captions are never kept waiting for it.
- **The person's language.** Answer in the language the person writes in. Titles and hooks are in the video's
  language. Files stay in English.
- **Short messages:** one line as each video starts (its title, its length, the number of clips), and the report at
  the end (step 7), at most 150 words plus one line per post. No tour of the tools unless asked.
- **Long steps run in the background:** sections, whisper and the boqo transcript wait always, render when the
  clips to render add up to more than 4 minutes. Each writes its one line to a file in `<video>`, and is done when that file holds the line. In Claude Code
  use the shell tool's background mode, which tells you when the command ends; elsewhere end the command with ` &`
  and look at the file about once a minute. Never wait with a foreground `sleep`. Any other command gets up to 10
  minutes (Claude Code: the shell tool's `timeout` of 600000).
- **Times.** `runAt` is this computer's clock; post times are the accounts' own clock, which boqo's `when` uses. They
  are taken to be the same. When the person says their accounts live in another time zone, shift the posting window
  (step 5) by the difference.
- Install nothing without the person's yes; INSTALL.md's one `npm ci` is the only npm command. An error naming ffmpeg,
  ffprobe, yt-dlp, whisper-cli or onnxruntime: run `node "$HOME/.boqo-channel/tools/doctor.mjs" --whisper optional`
  and give the person its `hints`.

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
4. **Each video,** channel by channel, newest first. `mkdir -p "<video>"`. The steps below are the boqo-clips run
   (select, score, rank, render the first 10, judge, order) for one video, with `<video>` as its run folder.
   0. **Its earlier tries.** `grep -F "| <video id> |" "<home>/boqo-channel/runs.md"` prints its lines in the log
      (none, or no file: its first try). Each `started` line begins a try, and the video's next line says how it
      ended: `failed: …`; `no captions` or `limited`, neither of which counts as failed; or none at all (the run
      stopped there, which counts as failed). Two failed tries already: mark it (step 4.13), note "failed twice" for the report, and go on
      with the next video. Otherwise append its `started` line (The log).
   1. **Info, captions and comments.**
      ```sh
      node "$HOME/.boqo-channel/tools/fetch.mjs" info "<url>" --dir "<video>"
      node "$HOME/.boqo-channel/tools/fetch.mjs" comments "<url>" --dir "<video>"
      rm -f "<video>/transcript-language.txt"
      ```
      `info` gives `{id, title, duration, captions}` with no video download; with captions it writes
      `<video>/words.json` and `<video>/segments.json`. `comments` is best effort (`{"comments": null}` is fine) and
      runs now, before the request (step 4.3), which reads `<video>/comments.json` once. The `rm` clears a language
      file an earlier try left. Tell the person, in one line, the title and the length.
   2. **No captions** (`"captions": "none"`): YouTube may not have made them yet.
      - An attended run, `"transcript": "boqo"` in `config.json` and boqo's `create_upload` among your tools
        (onboarding.md → 2 says how to find a deferred one): hold the video for Held videos. Add it to
        `<run>/held.json`, an array of `{"channel": "<channel>", "id", "url", "title", "duration"}` (write the whole
        file again), say nothing, and go on with the next video. It is not marked, and its `started` line stays
        open until Held videos ends it.
      - Otherwise append its `no captions` line. When step 4.0 showed a `no captions` line dated before today, it
        still has none a day later: mark it (step 4.13). A line from today (a rerun) does not count. Otherwise
        leave it unmarked, and tomorrow's run looks again. Note it for the report either way (with a boqo failure's
        reason, Held videos, when there was one; and, with `"transcript": "boqo"` in an unattended run, that boqo can
        transcribe it, with its minutes and credits, when the person asks), and go on with the next video. Its `info.json` stays, for A video with
        no captions.
   3. **Request.** `<video>/segments.json` (sentences) exists after step 4.1, or after Held videos' boqo transcript. With
      no file there, the transcript step failed: note it and give the video up as step 4.2's second rule does.
      ```sh
      node "$HOME/.boqo-channel/tools/select-request.mjs" --run "<video>"
      ```
      It writes `<video>/select-request.md` and prints `{"target", "segments", "chars"}`. Tell the person, in one
      line, how many clips it aims for (`target`) and that about the best half are kept (at least 3). The language comes from `<video>/info.json`, or from
      `<video>/transcript-language.txt` after a boqo transcript.
   4. **Select.** Read `select.md` (once a run), then the whole of `<video>/select-request.md` (in pages when it is
      long), and write `<video>/selection.json` once.
   5. **Check.**
      ```sh
      node "$HOME/.boqo-channel/tools/select-check.mjs" --run "<video>"
      ```
      - `{"ok": false, "errors": [...]}`: each error is `clips[i].field: what is wrong`, `clips[0]` being the first
        clip. Fix them in `<video>/selection.json` and run the check again.
      - `{"ok": true, "kept": n, "dropped": {...}}`: `<video>/clips.json` is the video's record, one row for each clip
        kept, its edges set on sentence edges, with its scores and its replay percentile. Re-running the check
        rebuilds the record, and every clip is unrendered again.
   6. **Order.** `node "$HOME/.boqo-channel/tools/clips.mjs" order --run "<video>"`: the rows are numbered in boqo's
      Ranked order. Clips 1 to 10 are the ones rendered.
   7. **Sections** for the first 10, in the background (Rules):
      ```sh
      node "$HOME/.boqo-channel/tools/fetch.mjs" sections "<url>" --run "<video>" > "<video>/sections.json"
      ```
      Done when `<video>/sections.json` holds `{"files": […]}`, or an error. It downloads only the seconds of those
      clips; when one comes back short it downloads the whole video once and cuts locally (a stderr line says so),
      which is the fallback working, not a failure, and takes longer.
   8. **Panels,** for a landscape source of 480 lines or more: `panels.md`. The probe, once a video; when it says
      `isStream: true`, the per-clip read for each of the clips 1 to 10, before their render. A portrait or small
      source says `{"eligible": false}`: skip it.
   9. **Render** the first 10, in the background when they add up to more than 4 minutes (Rules):
      ```sh
      node "$HOME/.boqo-channel/tools/render.mjs" --run "<video>" --first 10 --brand "<name>" > "<video>/render.json"
      ```
      `<video>/render.json` gets `{"rendered": [{n, file, thumb, seconds, notes}], "failed": [{n, error}]}`, and each
      rendered row of `clips.json` says `rendered: true`. A failed clip does not stop the others; its work folder
      stays at `<video>/render/clip-<nn>/` (`<nn>` its number, two digits). Note each failed `n` and error for the
      report. A render takes about as long as the clips run, and longer on a laptop. A note is a step that was
      skipped, not a failure (no face model; no logo): note the ones that matter for the report. Nothing rendered at
      all (every clip failed) is an error of the video (below).
   10. **Stranger.** For each rendered clip, `stranger.md`: its frames, your annotation, the record.
   11. **Order again.** `node "$HOME/.boqo-channel/tools/clips.mjs" order --run "<video>"`: the rendered clips are
       ranked with the stranger judgment, the files renamed to their new places (`clip-01.mp4` is the best), and
       the clips not rendered follow in their earlier order. This is the order the plan posts in (step 5).
   12. **Clean up** what the video downloaded or no longer needs, with `<video>` written out in full (never empty,
       never relative: `find` would then start in the current folder). `find`, because zsh stops a whole `rm` on a
       pattern that matches nothing:
       ```sh
       find "<video>" -maxdepth 1 -type f \( -name 'sec-*' -o -name 'whole.*' -o -name 'audio.*' -o -name '*.part' \
         -o -name '*.part-*' -o -name '*.ytdl' -o -name 'captions.*.json3' -o -name sections.json \
         -o -name asr.json -o -name render.json -o -name 'upload-*.json' \) -delete
       rm -rf "<video>/stranger" "<video>/panels"
       ```
       Keep `out/`, a failed clip's `render/clip-<nn>/` and the small files (`clips.json`, `selection.json`,
       `select-request.md`, `segments.json`, `words.json`, `info.json`, `comments.json`).
   13. **Mark** it done, only now that at least one clip is rendered (or step 4.0, step 4.2 or an error gives it up):
       ```sh
       node "$HOME/.boqo-channel/tools/channel.mjs" mark "<channel>" "<video id>"
       ```
       Then its line: `<n> clips | <video>/out` after a render (`<n>` the clips rendered), `given up` otherwise. A
       run that stops before the mark leaves the video new, and the next run tries it again.

   **An error in steps 4.1, 4.7 or 4.9** (nothing rendered at all counts): note it for the report, delete what the
   video made so far, with `<video>` written out in full (`rm -rf "<video>/out"`, then step 4.12), append its
   `failed: <the error's words>` line, and go on with the next video. Leave it unmarked, so tomorrow tries it again;
   when step 4.0 showed one failed try already, mark it instead: it failed twice and is not tried again. YouTube's
   limit is no error of the video (Rules): the same clean-up, its `limited` line, unmarked, and no further video or
   channel this run (step 5).

5. **Plan the posts.** A plan covers one day, the posting day, and only channels with `accounts`.
   - **An unanswered plan,** under `ask`: `node "$HOME/.boqo-channel/tools/plan.mjs" pending`. A `plan` it names is
     an earlier run's that nobody answered: `node "$HOME/.boqo-channel/tools/plan.mjs" skip "<that plan>" all`, and
     the report says so (step 7). Only the newest plan is ever posted, so an old one never goes out days late.
   - **The day:** when it is before 15:00 now (`date '+%H:%M'`), today, from the next full hour from now (09:00 at the
     earliest) to 21:00; otherwise tomorrow, 09:00 to 21:00.
   - **A channel's posts:** the clips of its videos marked done in this run after a render (step 4.13), never a clip
     from an earlier run or from a video left unmarked, in boqo's Ranked order. `plan.mjs clips` reads each video's
     `clips.json` and gives the rendered clips in their final order (from step 4.11), the videos taking turns, best
     first (each video's best, newest video first, then each video's second, and so on), and never a clip that was
     kept but not rendered:
     ```sh
     node "$HOME/.boqo-channel/tools/plan.mjs" clips "<newest video>" "<next video>" --max <perDay.max>
     ```
     gives `{"clips": [{video, id, file, title, hook, start, end}], "kept", "rendered", "excluded"}`: at most
     `perDay.max` clips, the plan's posts for that channel. A clip whose moment a posted plan item already carries
     (same video `id`, overlapping `start`-`end`) is left out and counted in `excluded`, so a video clipped again
     (Redo one clip) never offers a clip that went out. The clips not planned stay on disk. A post's `clip` is its
     `file`, its `title` is its `title`.
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
   `{"clip": "<its file>", "title": "<its title>", "hook": "<its hook, or null>", "video": "<its id>", "start": <s>,
   "end": <e>, "channel": "<channel>", "accountIds": ["<id>"], "handles": ["@name"], "when": {"date": "YYYY-MM-DD",
   "time": "HH:MM"}}`: `hook`, `id`, `start` and `end` as `plan.mjs clips` gave them (`post.md` posts the hook; a
   later plan knows a posted moment by its video and edges). Nothing to post: `[]`. Then check it:
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
   - videos with no captions under `"transcript": "boqo"`: in an unattended run, one line naming them and that boqo
     can transcribe them (minutes and credits in all) when the person asks (A video with no captions); in an attended
     run Held videos asks (step 8), so no line here;
   - an unanswered plan skipped in step 5: one line, its number of posts dropped, their clips still on disk;
   - the posts: one line each, `<date> <time> · <handles> · <title>`, then, under `auto`, posted or the refusal;
     under `ask`, the one question: "Post these?";
   - the clips' folder, `<run>`, and what all runs take on disk, `du -sh "<home>/boqo-channel/runs"`. When
     `find "<home>/boqo-channel/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14` lists any run, add: "Runs older
     than 14 days can go: say 'delete old runs'." On that ask only, with `<home>` written out in full:
     ```sh
     find "<home>/boqo-channel/runs" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
     ```
8. **Held videos** (Held videos), when `<run>/held.json` exists and the report asked nothing else (`auto`, or an
   empty plan). When the report asked "Post these?" they wait for the answer (Posting the plan, its last step), and
   `<run>/held.json` keeps them.
9. **Unlock and the timer.** `rm -f "<home>/boqo-channel/lock"`, then Trigger (its question waits when the report asked
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
     log), release the lock, and stop: the clips stay on disk. Then Held videos, when `<run>/held.json` exists
     (`<run>` the plan's folder), then the timer question, when it is still to come
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
   is released. Then Held videos, when `<run>/held.json` exists (`<run>` the plan's folder), then the timer question,
   when it is still to come (Trigger).

**A skipped item, later:** only on "post <title> anyway", for that item alone: the lock, a fresh `post_video` by
`post.md`, then `plan.mjs posted "<plan>" <n>`, `<plan>` the plan that holds it (posted replaces the skip). A bare yes
never posts a skipped item.

## Trigger

The run happens once a day, at `runAt`.

**One question at a time.** The held-videos question (Held videos) and the timer question are never asked beside
"Post these?": they end the run only when the report asks nothing else, and otherwise come, the held one first, right
after the person's answer about the posts (Posting the plan, the no in step 2 or step 5). When both are open anyway (a plan from another chat still waits), a bare "yes" or "no"
answers neither: ask "Which one: posting these, or the daily timer?"

- **Claude Code:** a timer in this session. With no `timer` in `config.json`, ask once: "Run this every day at
  <runAt>? It runs only while this Claude Code session stays open, and it may stop to ask your permission for a
  step: approve each one once, or keep this session open where you can see it." Write the answer as `"timer": "yes"`
  or `"no"`. No `CronCreate` among your tools (a deferred one counting): do as any other agent does (below). On the
  yes, and at the end of every run after it:
  1. `CronList`, and `CronDelete` the job whose prompt is `/boqo-channel` or `/boqo-channel timer`, if there is one;
  2. `CronCreate {cron: "<mm> <hh> * * *", prompt: "/boqo-channel timer", recurring: true}`, `<hh>:<mm>` being
     `runAt` (`21:13` is `13 21 * * *`). The prompt says `timer` so that the run knows nobody is there to answer
     (Attended or not).

  A recurring job expires after 7 days, so creating it again each run keeps it alive. The job lives in this session
  only: when the person opens a new session, the first `/boqo-channel` there creates it again (`timer` is `yes`).
- **Any other agent:** with no `timer` in `config.json`, end the report with "Run /boqo-channel each day, at
  <runAt>; from a scheduler nobody watches, run `/boqo-channel timer`.", and write `"timer": "no"`, so it is said once.

## Held videos

Videos step 4.2 held: no captions, `"transcript": "boqo"`, an attended run. `<run>/held.json` lists them. No file:
nothing is held; go on. It runs after the day's plan and report (step 8), or right after the person's answer about
the posts (Posting the plan), so the videos with captions are planned and reported first and never wait for it. An
unattended run holds nothing and never asks (Attended or not).

Ask once, for all the held videos together, in one line, and wait for the answer: "No captions on <V> videos: boqo can
transcribe them, <N> minutes in all, <C> credits (1 for each started 10 minutes, at least 1 a video). Yes?" `<N>` is
the sum of each video's `duration` rounded up to whole minutes, `<C>` the sum, over the videos, of its `duration`
divided by 600, rounded up, at least 1.
- **A no** (or a refusal of the whole ask): each held video follows step 4.2's second rule, its `no captions` line
  appended and the video left unmarked, and `<run>/held.json` is deleted.
- **A yes:** take the lock when this run does not hold it (The daily run, step 1; `file exists`: say a run or a posting
  is going, and that the person can ask for these videos again, as in A video with no captions), and release it at the
  end. For each held video in order, `<video>` being `<run>/<id>`, items 1 to 4 here, then its steps 4.3 to 4.13
  (its channel from `held.json`); then `<run>/held.json` is deleted. Then steps 5 to 7 for the clips of these videos
  alone, the plan going into a new `<run>` folder named for now (an earlier plan nobody answered cannot be waiting:
  this ran after its answer, or the report asked nothing).

1. The audio, from this machine's own address (never mp3: boqo reads m4a, webm/opus, ogg, flac and wav):
   ```sh
   yt-dlp -q --js-runtimes node --no-playlist -f "ba[ext=m4a]/ba[ext=webm]" -o "<video>/audio.%(ext)s" "<url>"
   node "$HOME/.boqo-channel/tools/boqo-upload.mjs" probe-audio "<video>/audio.<ext>"
   ```
   `ls "<video>"` gives `<ext>`. `probe-audio` gives `sizeBytes` and `contentType`.
2. `create_upload {filename: "audio.<ext>", contentType, sizeBytes, kind: "transcribe"}`. Write its reply, exactly
   as it came, to `<video>/upload-audio.json` (live signed URLs: never print them). Then
   `node "$HOME/.boqo-channel/tools/boqo-upload.mjs" put "<video>/audio.<ext>" --reply "<video>/upload-audio.json"`
   gives `{"ok": true, "upload_id", …}`; delete `<video>/upload-audio.json`.
3. `complete_upload {upload_id}`, then `transcribe {upload_id}`: `{id, credits, minutes}`. A link in either reply
   (the connection's daily cap): give it to the person, and take no further boqo transcript this run: this video
   and every held one after it follow step 4.2's second rule.
4. `get_transcript {id}`, about every 20 seconds (a background `sleep 20`), until `status` is `done` (with a
   `url`) or `failed` (with an `error`); an answer of `{not_found: true}` is final, so stop polling and go to
   the failure line below. Then, with the `url` exactly as it came and never shown:
   ```sh
   node "$HOME/.boqo-channel/tools/transcript-boqo.mjs" --url "<url>" --run "<video>"
   ```
   It writes `<video>/words.json`, `<video>/segments.json` and `<video>/transcript-language.txt`. Note for the
   report that boqo transcribed it and the credits spent.

On any failure above (a refusal, a failed job, an error from a tool, `not_found`): note "boqo's transcript failed
(<the reason, as it came>)" for the report, and this video follows step 4.2's second rule. Whisper does not run in a
daily run.

## A video with no captions

The report names it. When the person asks to clip it, transcribe it here. It is marked done once its clips render
(step 4.13), so no run clips it again.
1. Run `node "$HOME/.boqo-channel/tools/doctor.mjs" --whisper optional`. When its `whisper` or `whisper-model` check
   fails, give that check's hint, and stop (with `"transcript": "boqo"` and boqo's `create_upload` among your tools,
   the person can ask for boqo's transcript instead: Held videos' question and its items 1 to 4, in place of 2 to 4
   here). Otherwise say how long it takes, about 13 s per minute of audio on an
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
   `{"words": N, …}` in `<video>/asr.json` is done, and `<video>/segments.json` is written beside the words;
   `{"error": …}` stops it. `"englishOnly": true` is a model that hears every video as English: when this one is not
   in English (`<video>/info.json`'s `language`, the title, the person), say so, and offer the multilingual model
   (about 150 MB). On a yes:
   ```sh
   mkdir -p "<home>/models" && curl -L -o "<home>/models/ggml-base.bin" \
     "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
   ```
   then run whisper again with the video's language, `--lang <code>` (`--lang ru`) before `--out`: with a language
   other than English it takes a multilingual model, and `select-request` gets the same `--lang <code>` (step 4.3).
   `the words file has no words`: whisper heard no speech. Tell the person, and stop. Known limit: whisper can hear a
   word that is not there ("Oh") in silence at a multiple of 30 s, its window edge; never set an edge on one.
4. Steps 4.3 to 4.13 of the daily run, then steps 5 to 7 for its clips alone, the plan going into a new `<run>` folder
   named for now.

## Redo one clip

"Clip 2 should start earlier", "another title". Take the lock first (The daily run, step 1; `file exists`: say a run
or a posting is going, and to ask again once it is done), and release it at the end and on every way out.

- **Another title or hook:** change that row's `title` (60 characters at most) or `hook` (140) in
  `<video>/clips.json`, then step 4.7 for it when step 4.12's cleanup deleted its section (`--n <n>` after `--run`:
  `fetch.mjs sections "<url>" --run "<video>" --n <n> > "<video>/sections.json"`) and
  `render.mjs --run "<video>" --n <n> --brand "<name>"`. Its file is replaced where it is: no order step, so no clip
  is renamed and a plan that names the files stays right. Then step 4.12's cleanup. A clip already posted stays
  posted as it was.
- **Other edges, or a clip left out:** the clips need a new selection, and the files are renamed by the order. Skip
  this video's open plan items first (`plan.mjs pending` names the plan; `plan.mjs skip "<plan>" <n>` for each of
  them), since their files will not be the same clips. Change `<video>/selection.json` (step 4.4, the new edge on a
  transcript line's timestamp), run the check (step 4.5), which rebuilds the record, delete `<video>/out`, and go on
  at step 4.6. Every clip of the video renders again, and its posts are planned again only on the person's ask (step 5,
  a new `<run>` folder named for now). `plan.mjs clips` leaves out any clip whose moment a posted item already
  carries, so a clip that went out is never offered again, whatever it is now called.
