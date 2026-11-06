# Maintainer contract

This project adds composer trigger aliases while reusing DSH's native menus. It does not implement a replacement editor, menu, command system or draft rewriting layer.

- Keep untouched drafts, undo history and selection coordinates intact. Quote/reference chips and sending drafts must remain outside alias handling unless their coordinate contract is explicitly supported.
- Preserve native candidate selection and menu lifecycle; do not replace native behavior with a parallel UI.
- README files own the user entry, installation and user-visible limits. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) owns implementation seams, diagnostics and verification. Keep both README languages aligned when their behavior changes.
- For composer or DSH compatibility changes, follow that verification reference. Mocked alias checks do not establish real editor or IME behavior.

开发、构建与交付遵循父目录 [统一规范](../docs/plugin-development.md)。`src/` 是编辑源，`lib/` 由显式构建生成并与源码一同交付。
