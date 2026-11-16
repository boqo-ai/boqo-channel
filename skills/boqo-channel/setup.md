# Setup

Runs after `onboarding.md` on the first `/boqo-channel`, and on `/boqo-channel setup` (SKILL.md → Setup). It writes
`<home>/boqo-channel/config.json`. On a change ("add @x", "3 a day for @y", "post them automatically"), ask only
about what the person named, and keep every other key as it is. Paths go into commands written out in full, in
double quotes (SKILL.md → Overview).

Ask in as few messages as you can: the channels first, then the rest in one message.

## 1. The channels

Which YouTube channels to clip every day: an @handle, a channel link or a `UC…` id, one or more, their own or not.
Check each one, one at a time:

```sh
node "$HOME/.boqo-channel/tools/channel.mjs" new "<channel>" --max 1
```

- `{"videos": [{title, duration, …}]}`: name its newest long video and its length, so the person sees it is the
  right channel. Its first run clips that video, and none of the older ones.
- `{"videos": []}`: the channel has no long videos yet; keep it if they want it.
- An error: say it, and ask for the channel again.

Keep each channel exactly as the person typed it (SKILL.md → `<channel>`). This check marks nothing.

**The same channel twice.** Its reply's `newest` is the id of the channel's newest long video, done or not. Run the
same check on each channel already in `config.json`, one at a time, and compare: a new channel with the same
`newest` as one already followed, or as one named earlier in this setup, is that channel in another form (`@x` and
its `UC…` id). Refuse it: "already followed as <that channel>". A `newest` of `null` cannot be compared: keep it.

## 2. The accounts

With boqo's tools (onboarding.md → 2), `list_accounts`, the ones with status `active`. For each channel, ask which
accounts post its clips, by handle. Several channels can share an account; none is fine (its clips stay on disk).
Never choose for the person. No active accounts, or no boqo tools: `"accounts": []` for every channel, and ask
nothing.

## 3. Posts a day

For each channel with accounts: up to how many posts a day, to each of its accounts. 3 unless they say otherwise,
from 1 to 8. Say once that each run plans one day: its posts go out between 09:00 and 21:00, spread across that day.

## 4. The run time

When the daily run starts, on this computer's clock: 21:13 unless they say otherwise, so the clips made at night post
the next day. Say once that the computer has to be on, and the agent open, at that time.

## 5. The posting rule

With accounts, ask once: show each day's plan and post only after their yes (the default), or post automatically, up
to N clips a day in all. Without accounts, `"ask"`, and ask nothing.

## 6. The file

`mkdir -p "<home>/boqo-channel"`, then write `<home>/boqo-channel/config.json`:

```json
{
  "channels": [
    { "channel": "<as typed>", "accounts": [{ "id": "<id from list_accounts>", "handle": "@name" }], "perDay": { "max": 3 } }
  ],
  "runAt": "21:13",
  "posting": "ask",
  "maxVideosPerRun": 3,
  "transcript": "local"
}
```

- `posting` is `"ask"` or `{"auto": N}`.
- `maxVideosPerRun` is 3, and 1 to 5 on the person's ask only.
- `transcript` is `"local"` (the default). It becomes `"boqo"` only when the person asks for boqo to transcribe
  videos that have no captions, which spends credits (SKILL.md → Rules); each run asks once before using it.
- `handle` is the text inside the `<data …>` tag `list_accounts` gave.
- A removed channel is taken out of `channels`; its state stays in `<home>/boqo-channel/state/`, so adding it back
  carries on where it stopped.
- Keep `timer` when the file already has it.

Then one line: the channels, their accounts and posts a day, the run time and the rule. Then the daily run, now
(SKILL.md → The daily run). The timer question comes by SKILL.md → Trigger's one-question rule: never beside "Post
these?".
