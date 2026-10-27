# DSH Composer Command Alias

A browser-side DSH plugin that makes the Chinese enumeration comma `、` open the same command and skill menu as the `/` trigger in the chat composer. Under a Chinese IME the `/` key usually produces `、`, so this plugin is what lets a Chinese-typing session reach commands and skills without switching to an English layout.

Pressing `、` only shows the menu. The comma stays in the draft: picking a candidate replaces it (a command chip, or the `/name ` skill text), while ignoring or dismissing the menu leaves the message exactly as typed.

## Behaviour

The menu opens under the same word-boundary rule the native `/` trigger uses (`detectTrigger` in `@deepseek-ai/dsh-client-ui-input-trigger`), applied to the character before the comma:

| Draft before the comma | Result |
| --- | --- |
| Start of the draft (leading whitespace allowed) | the command menu opens over `/` semantics |
| After a space or newline | the command menu opens |
| After punctuation (`：`, `，`, `)`, `！`, …) | the command menu opens |
| After a letter, digit, underscore, or CJK character | Nothing opens; the comma is ordinary text |

So `甲、乙` and `A、B` stay untouched, while a message that starts with `、` gets the same menu as one that starts with `/`. Everything downstream is the native pipeline: commands, the skill group, keyboard navigation, candidate filtering, `@` references, Escape, and the `、name` token a pick consumes.

Because the draft is never rewritten:

- Typing `、goal` filters the menu to `goal` while the composer still shows `、goal`.
- Picking a command replaces `、goal` with the command chip, exactly as picking after a typed `/goal` would.
- Dismissing the menu, or sending without picking, keeps `、goal` as ordinary message text.
- No undo entry is created and the composer history is untouched, because nothing was edited behind your back.

## Why the plugin needs the trigger controller

There is no extension point for new trigger characters. `InputTriggerSource.trigger` is typed `'/' | '@'`, and the detection core only scans for those two, so a plugin cannot register a third source for `、`: it would never receive a candidate request.

`InputTriggerController.track(draft, caret, guard, draftRev)` is the single entry the composer's own wiring uses, and `ctx.inputTriggers.sessionOf(sessionCtx)` is public on the input-trigger service. The plugin resolves the very controller the composer uses, hands it a copy of the draft whose boundary comma is spelled `/`, and lets the native menu open over that hit. The hit's span covers the real `、query` characters, so the pick paths operate on the text the user actually typed.

The visible surface is one invisible resident of the `conversation.input.overlay` slot, which subscribes to the session's input state and releases everything when the composer unmounts.

## Limits

- Uses two non-declared seams: the `[data-composer-input]` marker to read the caret, and the controller's `track()` as an entry point. Both are stable public surfaces of their packages, but neither is offered as a plugin extension point, so a DSH update may change them without notice.
- The draft must be a single chip-free block. The plugin compares the DOM text with the published draft and stays inert when they differ, which is the case once a reference or command chip is in play or the draft spans several paragraphs.
- Only `、` is aliased. Full-width variants such as `／`, and other IME punctuation, are not.
- The `$` / `￥` skill-only picker is not part of this plugin: the native menu cannot be filtered to a single source, so that needs its own panel.

## Install

Install the directory as a DSH bundle into the target profile, for example:

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` links the package and also records `@local/dsh-composer-command-alias` in the profile's `dsh.profile.bundles`; installing through the Plugin Manager performs the same steps.
