# Setup

Runs after `onboarding.md` on the first `/boqo-channel`, and on `/boqo-channel setup` (SKILL.md → Setup). It writes
`<home>/boqo-channel/config.json`. On a change ("add @x", "3 a day for @y", "post them automatically"), ask only
about what the person named, and keep every other key as it is.

Ask in as few messages as you can: the channels first, then the rest in one message.

## 1. The channels

Which YouTube channels to clip every day: an @handle, a channel link or a `UC…` id, one or more, their own or not.
Check each one, one at a time:

```sh
node ~/.boqo-channel/tools/channel.mjs new "<channel>" --max 1
```

- `{"videos": [{title, duration, …}]}`: name its newest long video and its length, so the person sees it is the
  right channel. Its first run clips that video, and none of the older ones.
- `{"videos": []}`: the channel has no long videos yet; keep it if they want it.
- An error: say it, and ask for the channel again.

Keep each channel exactly as the person typed it (SKILL.md → `<channel>`). This check marks nothing.

## 2. The accounts

With boqo's tools (onboarding.md → 2), `list_accounts`, the ones with status `active`. For each channel, ask which
accounts post its clips, by handle. Several channels can share an account; none is fine (its clips stay on disk).
Never choose for the person. No active accounts, or no boqo tools: `"accounts": []` for every channel, and ask
nothing.

## 3. Posts a day

For each channel with accounts: how many posts a day, at least and at most, to each of its accounts. 1 to 3 unless
they say otherwise; each from 1 to 8, the least not above the most. Say once that posts go out between 09:00 and
21:00, spread across the day.

## 4. The run time

When the daily run starts, on this computer's clock: 21:13 unless they say otherwise, so the clips made at night post
the next day. Say once that the computer has to be on, and the agent open, at that time.

## 5. The posting rule

With accounts, ask once: show each day's plan and post only after their yes (the default), or post automatically, up
to N clips a day in all. Without accounts, `"ask"`, and ask nothing.

## 6. The file

`mkdir -p <home>/boqo-channel`, then write `<home>/boqo-channel/config.json`:

```json
{
  "channels": [
    { "channel": "<as typed>", "accounts": [{ "id": "<id from list_accounts>", "handle": "@name" }], "perDay": { "min": 1, "max": 3 } }
  ],
  "runAt": "21:13",
  "posting": "ask",
  "maxVideosPerRun": 3
}
```

- `posting` is `"ask"` or `{"auto": N}`.
- `maxVideosPerRun` is 3, and 1 to 5 on the person's ask only.
- `handle` is the text inside the `<data …>` tag `list_accounts` gave.
- A removed channel is taken out of `channels`; its state stays in `<home>/boqo-channel/state/`, so adding it back
  carries on where it stopped.
- Keep `timer` when the file already has it.

Then one line: the channels, their accounts and posts a day, the run time and the rule. Then the daily run, now
(SKILL.md → The daily run): its report ends with the timer (SKILL.md → Trigger).
