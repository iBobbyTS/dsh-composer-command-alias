# DSH Composer Trigger Aliases

[English](README.md) | [简体中文](README.zh.md)

A browser-side DSH plugin that opens native composer menus without rewriting the draft:

- `、` opens the command and skill menu normally triggered by `/`.
- `$` and `￥` open only the skill menu.

Picking a candidate replaces its trigger token. Dismissing the menu or sending without a selection keeps the typed text unchanged. Filtering, keyboard navigation and IME handling use the native menu.

## Install

For Desktop, launch the app once, quit it, and run the command below with its bundled CLI.

Use a checkout of this repository. Replace the absolute path below with your checkout path and select the profile you actually run:

```sh
dsh plugin --profile desktop add "link:/absolute/path/to/dsh-composer-command-alias"
```

Use `web` instead of `desktop` for a standalone Web profile. The command links the bundle and records `@local/dsh-composer-command-alias` in that profile. Restart the corresponding DSH process and reload its UI.

## Use and limits

- `、` follows the native word-boundary rule: it opens a menu at the start, after whitespace or after punctuation, but stays ordinary text after a letter, digit, underscore or CJK character.
- `$` and `￥` also work inside Chinese text when followed by a name-shaped query: `用$sectioned` opens skills; `甲$` and `价格$100` stay unchanged.
- Selecting `$sec` can insert `/sectioned-feature-development `. Deleting a trigger closes the menu; settling an IME composition keeps the matching menu open.
- Drafts containing reference or quote chips are left alone because their text and editor coordinates differ.
- Skill aliases require the profile to load `@deepseek-ai/dsh-client-ui-skill`. Other full-width variants, including `／`, are outside scope.
- The plugin relies on composer implementation seams that can change in a DSH upgrade.

[Development, compatibility checks and IME diagnostics](docs/DEVELOPMENT.md)
