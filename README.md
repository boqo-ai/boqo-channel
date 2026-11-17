# boqo-channel

Auto-clip a whole YouTube channel every day with your brand, on your own machine.

You name the YouTube channels to follow, yours or anyone's. Once a day your agent lists each channel's new long
videos, reads their captions, picks the moments that work as shorts, and scores and ranks them the way boqo does:
then it downloads only the first 10 moments' sections and renders 1080×1920 clips with burned-in captions and your
logo if you set one, and judges each one as a stranger would. Then it spreads the posts across the day from the best
clip down, as many a day per channel as you choose, and only by the rule you set: it shows you the plan and waits for your yes, or
posts by itself up to a daily cap. The first run on a channel clips only its newest video, never the whole backlog.

<!-- demo GIF -->

## Install

Tell your agent (tested with Claude Code; any agent with a terminal, such as Cursor or Codex, can follow the same
steps):

> Read https://raw.githubusercontent.com/boqo-ai/boqo-channel/main/INSTALL.md and follow it.

It clones boqo-channel to `~/.boqo-channel` and links the skill, checks your tools, installs nothing without your
yes, and starts with your brand kit and the channels to follow.

## Requirements

- Node 20 or newer
- ffmpeg with libass (macOS: `brew install ffmpeg-full`)
- yt-dlp
- Two npm packages, `zod` and `onnxruntime-node` (about 258 MB, for face-aware framing), which the install adds after
  your yes
- Optional: whisper.cpp (`whisper-cli`) and a model, to clip a video that has no captions when you ask
- Optional: boqo transcribes a video that has no captions for 1 credit per started 10 minutes (set `"transcript":
  "boqo"` in the config); the run asks once a day, naming the minutes and credits

The install runs `tools/doctor.mjs`, which checks all of these and says how to get what is missing on macOS, Windows
and Linux.

## Every day

Run `/boqo-channel` once a day. In Claude Code it offers a daily timer at your run time. The timer lives in that
Claude Code session: it fires only while the session stays open on a computer that is awake, and a run may stop to
ask your permission for a step, so approve each one once or keep the session where you see it. In other agents, run
`/boqo-channel` each day yourself, or `/boqo-channel timer` from a scheduler nobody watches (it never waits for an answer).

## What runs where

| Where | What |
| --- | --- |
| Your machine | Channel listing, captions and transcript, section download, scoring and ranking, rendering, your brand kits and the finished clips |
| Your agent | Picking the moments, titles and hooks, and the stranger judgment of each clip |
| boqo | Posting and scheduling, through the boqo MCP connector (`https://mcp.boqo.ai/mcp`), and, only when you ask, transcribing a video that has no captions. Autoposting comes with the 3-day trial, or with Starter from $12. Without boqo you keep the files |

## The engine

The engine (`engine/`, shared tools) is vendored from boqo-ai/boqo-clips — edit it there, then run its `scripts/sync-engine.mjs`.

## Differences from the design

- **Posts a day is a maximum only** (`perDay.max`), not a minimum and a maximum: a day with fewer good clips posts
  fewer, and nothing is padded to reach a count.
- **CI here tests this repo's own tools** (channel listing, the plan, the schedule), ffmpeg's filters, the skill's
  docs and the engine copy's hash and dependencies. The engine's own checks (doctor, the render, the selection and
  ranking cases) run in boqo-clips' CI on the same bytes, which the hash test (`tests/engine-copy.test.mjs`) pins.

## Licence

MIT, see [LICENSE](LICENSE). © PRAC INC. Made by [boqo](https://boqo.ai).
