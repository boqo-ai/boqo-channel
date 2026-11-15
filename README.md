# boqo-channel

Auto-clip a whole YouTube channel every day with your brand, on your own machine.

You name the YouTube channels to follow, yours or anyone's. Once a day your agent lists each channel's new long
videos, reads their captions, picks the moments that work as shorts, downloads only those sections and renders
1080×1920 clips with burned-in captions and your logo if you set one. Then it spreads the posts across the day, as
many a day per channel as you choose, and only by the rule you set: it shows you the plan and waits for your yes, or
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
- Optional: whisper.cpp (`whisper-cli`) and a model, to clip a video that has no captions when you ask

The install runs `tools/doctor.mjs`, which checks all of these and says how to get what is missing on macOS, Windows
and Linux.

## Every day

Run `/boqo-channel` once a day. In Claude Code it offers a daily timer at your run time. The timer lives in that
Claude Code session: it fires only while the session stays open on a computer that is awake. In other agents, run
`/boqo-channel` each day yourself.

## What runs where

| Where | What |
| --- | --- |
| Your machine | Channel listing, captions and transcript, section download, rendering, your brand kits and the finished clips |
| Your agent | Picking the moments, titles and hooks |
| boqo | Posting and scheduling, through the boqo MCP connector (`https://mcp.boqo.ai/mcp`). Autoposting comes with the 7-day trial, or with Starter from $12. Without boqo you keep the files |

## The engine

The engine (`engine/`, shared tools) is vendored from boqo-ai/boqo-clips — edit it there, then run its `scripts/sync-engine.mjs`.

## Licence

MIT, see [LICENSE](LICENSE). © SSD Technologies LLC. Made by [boqo](https://boqo.ai).
