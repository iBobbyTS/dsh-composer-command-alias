# Composer aliases: development and diagnostics

[User guide](../README.md) · [中文入口](../README.zh.md)

This is the implementation and diagnostic reference. User-visible behavior and installation are described in the README.

## Why the plugin needs the trigger controller

There is no extension point for new trigger characters. `InputTriggerSource.trigger` is typed `'/' | '@'`, and the detection core only scans for those two, so a plugin cannot register a third source for `、` or `$`: it would never receive a candidate request.

The plugin therefore drives the pipeline directly, through surfaces the composer's own wiring uses:

- `InputTriggerController.track(draft, caret, guard, draftRev)` for the comma: the same draft with the boundary comma spelled `/`, so the native menu opens over that hit. The hit's span covers the real `、query` characters, so a pick cuts the text the user actually typed.
- The caret comes from the composer's `caretSpan()`: the editor maps the visible selection onto the draft text with one character per block boundary, so multi-paragraph messages and mid-paragraph carets stay aligned. A DOM walk would have to invent those newlines, and one that does not disagrees with the draft on every second paragraph.
- `InputTriggerController.toggleSource('skill', hit)` for the skill aliases: the path the composer's own attach/command button uses to open a single source. The menu, its rows, filtering, and pick handling stay native — only the roster is narrowed, which is why no menu UI is copied. An open panel is left alone (offering the same source twice is that API's close gesture); only a closed one gets the source put back. The launcher flag that call also sets is spent right away with an empty-draft `track()`: it buys a gesture-opened menu one exempt track, and swallowing the next one is exactly what kept the panel open after the alias was deleted, while an alias token holds no gesture.
- The draft is offered back through two channels. A text change publishes the input state, and the plugin re-offers one microtask later because the composer's own `track` runs first and closes the panel the alias just opened. A commit that changes no text publishes nothing — an IME composition settling, a caret move, a focus — yet the composer still re-tracks the draft, so the plugin also hangs on the editor's commit callback and gets the last word within that same commit. Without the second channel the panel died the moment a pinyin settled, with no publish left to revive it.

No panel markup is reimplemented. The visible surface is one invisible resident of the `conversation.input.overlay` slot, which subscribes to the session's input state and releases everything when the composer unmounts.

The non-declared seams are `[data-composer-input]`, `SessionInput.caretSpan()`, the editor's `registerUpdateListener`, and the controller's `track()` / `toggleSource()`. They are implementation details rather than plugin extension points; recheck them against the target DSH source during upgrades.

## Verification

From a source checkout, run:

```sh
node tools/test-client.mjs
```

This checks plain aliases and the quote, reference and sending guards with mocked services. It does not exercise a real browser editor. For a DSH compatibility change, compare the input-trigger, editor and composer wiring in the target source, then check the affected real UI paths: multi-paragraph and mid-paragraph carets, quote/reference chips, IME settling, trigger deletion, dismissal and candidate selection. State separately which source, automated and UI checks were actually performed.

## Diagnosing an IME problem

Use a source checkout of this repository and run the collector from its root; `tools/` is not part of the installed runtime package. The plugin ships an optional trace, off by default. With it on, every observed event becomes one JSON line in a local file:

```sh
python3 tools/log-collector.py --file /tmp/composer-alias.log   # in another terminal
```

Then set `localStorage['dsh-composer-alias.debug'] = '1'` in the page console and reload. The trace covers composition start/update/end (with `data`), `beforeinput`/`input` `inputType` and `isComposing`, every editor commit, each plugin decision and its bail reason, the `track`/`toggleSource`/`pick`/`insertText` arguments and results, and the menu snapshot on every change. Turn it off with `localStorage.removeItem('dsh-composer-alias.debug')` and a reload.

Without the collector the plugin still works: records fall back to an in-page ring, readable through `__composerAliasDebug.dump()` and emptied with `clear()`.

## Build and distribution checks

Use Node 24.11.0 and the `packageManager` pnpm version for maintenance. `pnpm install --frozen-lockfile` prepares development dependencies. `pnpm typecheck` checks Host and Client separately; `pnpm build:runtime` refreshes generated `lib/`; `pnpm test` builds an isolated candidate before testing; `pnpm check:dist` independently rebuilds and compares all artifacts, then packs and tests clean tarball/Git installation. `pnpm check` combines these with one candidate build. Installation uses prebuilt JS; it runs no plugin compiler lifecycle hook.

Source and automated checks target DSH 0.2.2-rc.2. Isolated Web validation confirmed native command/skill menus from `、`, only skills from `$acceptance`, unchanged draft after Escape, and execution of the native `compact` command after selection. This does not establish real IME composition, undo, or Desktop behavior.
