# DSH Composer Trigger Aliases

A browser-side DSH plugin that gives the chat composer two trigger characters the input pipeline does not accept on its own:

- `、` — the enumeration comma a Chinese IME types for the `/` key — opens the same command and skill menu as `/`.
- `$` / `￥` open the skill source alone: the same native menu, narrowed to one source, so only skills are listed.

Neither trigger rewrites the draft. Pressing one only shows the menu; picking a candidate replaces the trigger token (a command chip, or the `/name ` skill text), while ignoring or dismissing the menu leaves the message exactly as typed.

## Behaviour

The menu opens under the same word-boundary rule the native `/` trigger uses (`detectTrigger` in `@deepseek-ai/dsh-client-ui-input-trigger`):

| Draft before the trigger | Result |
| --- | --- |
| Start of the draft (leading whitespace allowed) | the menu opens |
| After a space or newline | the menu opens |
| After punctuation (`：`, `，`, `)`, `！`, …) | the menu opens |
| After a letter, digit, underscore, or CJK character | Nothing opens; the character is ordinary text |

`$` and `￥` add one rule, because Chinese text rarely types spaces: a skill alias also opens mid-text once a name-shaped character follows it. `用$sectioned` opens the skill menu, while `甲$` and `价格$100` stay inert.

So `甲、乙` and `A、B` stay untouched, while a message that starts with `、` gets the full menu and `$sec` gets the skill menu filtered to `sectioned…`. Everything downstream is the native pipeline: candidate filtering, keyboard navigation, IME handling, Escape, click, and the token a pick consumes.

Because the draft is never rewritten:

- Typing `、goal` filters the command menu to `goal` while the composer still shows `、goal`; `$sec` filters the skill menu the same way.
- Picking a command replaces `、goal` with the command chip; picking a skill replaces `$sec` with `/sectioned-feature-development `.
- Dismissing the menu, or sending without picking, keeps `、goal` / `$sec` as ordinary message text.
- No undo entry is created and the composer history is untouched, because nothing was edited behind your back.

## Why the plugin needs the trigger controller

There is no extension point for new trigger characters. `InputTriggerSource.trigger` is typed `'/' | '@'`, and the detection core only scans for those two, so a plugin cannot register a third source for `、` or `$`: it would never receive a candidate request.

The plugin therefore drives the pipeline directly, through surfaces the composer's own wiring uses:

- `InputTriggerController.track(draft, caret, guard, draftRev)` for the comma: the same draft with the boundary comma spelled `/`, so the native menu opens over that hit. The hit's span covers the real `、query` characters, so a pick cuts the text the user actually typed.
- `InputTriggerController.toggleSource('skill', hit)` for the skill aliases: the path the composer's own attach/command button uses to open a single source. The menu, its rows, filtering, and pick handling stay native — only the roster is narrowed, which is why no menu UI is copied.

No panel markup is reimplemented. The visible surface is one invisible resident of the `conversation.input.overlay` slot, which subscribes to the session's input state and releases everything when the composer unmounts.

## Limits

- Uses three non-declared seams: the `[data-composer-input]` marker to read the caret, and the controller's `track()` / `toggleSource()` as entry points. All are stable public surfaces of their packages, but none is offered as a plugin extension point, so a DSH update may change them without notice.
- The draft must be a single chip-free block. The plugin compares the DOM text with the published draft and stays inert when they differ, which is the case once a reference or command chip is in play or the draft spans several paragraphs.
- The skill panel is the source named `skill`. A profile that does not load `@deepseek-ai/dsh-client-ui-skill` gets no skill menu; `$` then simply stays inert.
- Only `、`, `$`, and `￥` are aliased. Other IME punctuation and full-width variants such as `／` are not.

## Install

Install the directory as a DSH bundle into the target profile, for example:

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` links the package and also records `@local/dsh-composer-command-alias` in the profile's `dsh.profile.bundles`; installing through the Plugin Manager performs the same steps.
