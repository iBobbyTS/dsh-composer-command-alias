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

So `甲、乙` and `A、B` stay untouched, while a message that starts with `、` gets the full menu and `$sec` gets the skill menu filtered to `sectioned…`. Multi-paragraph drafts behave the same: a `、` at the start of the second paragraph opens the menu, and a caret in the middle of one works too, because the offset comes from the editor's own projection (one character per block boundary) instead of being measured from the DOM. Everything downstream is the native pipeline: candidate filtering, keyboard navigation, IME handling, Escape, click, and the token a pick consumes.

Because the draft is never rewritten:

- Typing `、goal` filters the command menu to `goal` while the composer still shows `、goal`; `$sec` filters the skill menu the same way.
- Picking a command replaces `、goal` with the command chip; picking a skill replaces `$sec` with `/sectioned-feature-development `.
- Dismissing the menu, or sending without picking, keeps `、goal` / `$sec` as ordinary message text.
- Deleting the trigger (Backspace, a selection delete, or retyping it as plain text) closes the panel within that one edit — no second press.
- Ending an IME composition (Shift or Enter turning the pinyin into letters) does not close the panel: the draft text is unchanged at that moment, only the composition settles, so the panel keeps filtering on the settled text.
- No undo entry is created and the composer history is untouched, because nothing was edited behind your back.

## Why the plugin needs the trigger controller

There is no extension point for new trigger characters. `InputTriggerSource.trigger` is typed `'/' | '@'`, and the detection core only scans for those two, so a plugin cannot register a third source for `、` or `$`: it would never receive a candidate request.

The plugin therefore drives the pipeline directly, through surfaces the composer's own wiring uses:

- `InputTriggerController.track(draft, caret, guard, draftRev)` for the comma: the same draft with the boundary comma spelled `/`, so the native menu opens over that hit. The hit's span covers the real `、query` characters, so a pick cuts the text the user actually typed.
- The caret comes from the composer's `caretSpan()`: the editor maps the visible selection onto the draft text with one character per block boundary, so multi-paragraph messages and mid-paragraph carets stay aligned. A DOM walk would have to invent those newlines, and one that does not disagrees with the draft on every second paragraph.
- `InputTriggerController.toggleSource('skill', hit)` for the skill aliases: the path the composer's own attach/command button uses to open a single source. The menu, its rows, filtering, and pick handling stay native — only the roster is narrowed, which is why no menu UI is copied. The launcher flag that call also sets is spent right away with an empty-draft `track()`: it buys a gesture-opened menu one exempt track, and swallowing the next one is exactly what kept the panel open after the alias was deleted, while an alias token holds no gesture.
- The draft is offered back through two channels. A text change publishes the input state, and the plugin re-offers one microtask later because the composer's own `track` runs first and closes the panel the alias just opened. A commit that changes no text publishes nothing — an IME composition settling, a caret move, a focus — yet the composer still re-tracks the draft, so the plugin also hangs on the editor's commit callback and gets the last word within that same commit. Without the second channel the panel died the moment a pinyin settled, with no publish left to revive it.

No panel markup is reimplemented. The visible surface is one invisible resident of the `conversation.input.overlay` slot, which subscribes to the session's input state and releases everything when the composer unmounts.

## Limits

- Uses non-declared seams: the `[data-composer-input]` marker only to confirm focus is in the composer; the composer's `caretSpan()` to read the caret (not on the `SessionInput` type, but the composer's own button calls it); the editor's `registerUpdateListener` (Lexical's public API) for commits that change no text; and the controller's `track()` / `toggleSource()` as entry points. All are stable implementation of their packages, but none is offered as a plugin extension point, so a DSH update may change them without notice.
- A draft carrying a chip is left alone: the draft expands a chip to text while the trigger pipeline counts it as one character, so the two coordinate spaces diverge. (Plain multi-paragraph drafts hold no chip and are unaffected.)
- The skill panel is the source named `skill`. A profile that does not load `@deepseek-ai/dsh-client-ui-skill` gets no skill menu; `$` then simply stays inert.
- Only `、`, `$`, and `￥` are aliased. Other IME punctuation and full-width variants such as `／` are not.

## Diagnosing an IME problem

The plugin ships an optional trace, off by default. With it on, every observed event becomes one JSON line in a local file:

```sh
python3 tools/log-collector.py --file /tmp/composer-alias.log   # in another terminal
```

Then set `localStorage['dsh-composer-alias.debug'] = '1'` in the page console and reload. The trace covers composition start/update/end (with `data`), `beforeinput`/`input` `inputType` and `isComposing`, every editor commit, each plugin decision and its bail reason, the `track`/`toggleSource`/`pick`/`insertText` arguments and results, and the menu snapshot on every change. Turn it off with `localStorage.removeItem('dsh-composer-alias.debug')` and a reload.

Without the collector the plugin still works: records fall back to an in-page ring, readable through `__composerAliasDebug.dump()` and emptied with `clear()`.

## Install

Install the directory as a DSH bundle into the target profile, for example:

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` links the package and also records `@local/dsh-composer-command-alias` in the profile's `dsh.profile.bundles`; installing through the Plugin Manager performs the same steps.
