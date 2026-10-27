/**
 * Browser half: opens the native menus for two IME-hostile triggers without
 * touching the draft, and lets a pick decide what happens.
 *
 * - `、` (the enumeration comma a Chinese IME types for the "/" key) opens the
 *   whole command menu, exactly as `/` would.
 * - `$` / `￥` open the skill source alone: the same native menu, narrowed to
 *   one source through the controller's `toggleSource`, so only skills list.
 *
 * Why this is needed at all: the input-trigger pipeline accepts no new trigger
 * characters. `InputTriggerSource.trigger` is typed `'/' | '@'`, and
 * `detectTrigger` only scans for those two, so a third source never receives a
 * candidate request.
 *
 * How it works without rewriting text: `InputTriggerController.track(draft,
 * caret, guard, draftRev)` is the single entry the composer's own wiring uses.
 * The plugin resolves the same per-session controller, feeds it a copy of the
 * draft whose boundary comma is spelled "/", and lets the native menu open over
 * that hit. The span in the hit still points at the real characters, so a pick
 * behaves exactly as it would for a typed slash — the command chip replaces
 * [0, end), a skill reference replaces [start, end) — while an untouched draft
 * keeps its 顿号. Nothing runs until a candidate is picked.
 *
 * The boundary rule mirrors `detectTrigger`: a trigger opens at the start of the
 * draft, after whitespace, or after punctuation, and stays dead after a letter,
 * digit, underscore, or CJK character. Ordinary 顿号 usage ("A、B", "甲、乙")
 * therefore never opens anything.
 *
 * Timing: the attempt runs from the composer's own published input state, which
 * fires once per committed editor edit — after the editor wrote the DOM and
 * before the browser paints. The composer delivers no usable `input` event for
 * an ordinary insertion (Lexical claims `beforeinput` and applies the edit
 * itself), so an event-based trigger would miss ordinary typing entirely.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-composer-command-alias',
  factory(require) {
    const React = require('react');

    /** The Chinese enumeration comma this plugin treats as a command trigger. */
    const ALIAS = '、';
    /** The native command trigger the aliases are presented as to the pipeline. */
    const TRIGGER = '/';
    /** Characters that open the skill source alone. */
    const SKILL_ALIASES = ['$', '￥'];
    /** A skill query starts with a model-name character, never with a digit. */
    const SKILL_QUERY_START = /^[A-Za-z_]$/;
    /** The menu source name ui-skill registers (skill candidates live there). */
    const SKILL_SOURCE = 'skill';
    /** The composer's editable root, bound by ui-conversation's DraftEditor. */
    const COMPOSER = '[data-composer-input]';
    const WORD_CHAR = /[\p{L}\p{N}_]/u;
    const WHITESPACE = /\s/u;
    const TEXT_NODE = 3;

    /**
     * Whether a trigger at this position opens a menu, mirroring the detection
     * core's word-boundary rule.
     * @param prev - the character immediately before the trigger, absent at the start.
     * @returns true when the trigger is live.
     */
    function boundaryOpen(prev) {
      if (prev === undefined) return true;
      if (WHITESPACE.test(prev)) return true;
      return !WORD_CHAR.test(prev);
    }

    /**
     * The collapsed caret when it sits in a composer's editable text node.
     * @returns the editable root, the caret text node, and its offset, or null.
     */
    function composerCaret() {
      const selection = document.getSelection();
      if (selection === null || selection.rangeCount !== 1 || !selection.isCollapsed) return null;
      const node = selection.anchorNode;
      if (node === null || node.nodeType !== TEXT_NODE) return null;
      const root = node.parentElement?.closest(COMPOSER) ?? null;
      if (root === null) return null;
      return { root, node, offset: selection.anchorOffset };
    }

    /**
     * Find the alias this attempt would present as a trigger: the rightmost
     * alias in the token that ends at the caret, exactly where detection would
     * find a typed "/".
     *
     * A comma follows the trigger word-boundary rule. A skill alias follows it
     * too, but also opens mid-text once a name-shaped character follows it, so
     * "用$sectioned" works in a language that rarely types spaces. A lone "$"
     * after a word character (a price, "价格$") stays inert until then.
     * @param draft - the composer's detect-projection draft.
     * @param caret - caret offset into `draft`.
     * @returns the alias index and whether it opens the skill source, or null.
     */
    function aliasToken(draft, caret) {
      for (let i = caret - 1; i >= 0; i -= 1) {
        const ch = draft.charAt(i);
        if (WHITESPACE.test(ch)) return null;
        if (ch === ALIAS) {
          if (!boundaryOpen(i === 0 ? undefined : draft.charAt(i - 1))) continue;
          return { start: i, skill: false };
        }
        if (!SKILL_ALIASES.includes(ch)) continue;
        if (boundaryOpen(i === 0 ? undefined : draft.charAt(i - 1))) return { start: i, skill: true };
        if (i + 1 <= caret - 1 && SKILL_QUERY_START.test(draft.charAt(i + 1))) return { start: i, skill: true };
      }
      return null;
    }

    /**
     * Draft text from the start of the composer to one caret position.
     * @param root - the editable root.
     * @param node - caret text node.
     * @param offset - caret offset in that node.
     * @returns the text before the caret.
     */
    function textUpTo(root, node, offset) {
      const range = document.createRange();
      range.setStart(root, 0);
      range.setEnd(node, offset);
      return range.toString();
    }

    return {
      inject: ['slots', 'sessions', 'conversation', 'inputTriggers'],
      apply(ctx) {
        /**
         * Invisible resident of the composer overlay. Maps the live composer to
         * the session's trigger controller and re-arms the menu for a trailing
         * 顿号; it never edits the draft.
         * @param props - slot props; only the session id is read.
         * @returns nothing rendered.
         */
        function ComposerCommandAlias(props) {
          const sessionId = props.sessionId;
          React.useLayoutEffect(() => {
            let unsubscribe = null;
            /** Token signature of the skill panel this effect last opened. */
            let lastSkill = null;

            /**
             * Offer the current draft to the trigger pipeline with the boundary
             * comma read as a slash. A no-op unless the caret sits right after
             * such a comma and no reference chip is in play.
             * @param input - the session's input facade.
             * @param controller - the session's trigger controller.
             */
            const attempt = (input, controller) => {
              try {
                const state = input.state.getSnapshot();
                if (state.phase !== 'plain' || state.occurrences.length > 0) return;
                if (!state.draft.includes(ALIAS) && !SKILL_ALIASES.some(ch => state.draft.includes(ch))) return;
                const caret = composerCaret();
                if (caret === null) return;
                const before = textUpTo(caret.root, caret.node, caret.offset);
                // The DOM text and the published draft share coordinates only
                // while the draft is a single chip-free block; otherwise the
                // pipeline would receive a span it cannot cut.
                if (before === '' || state.draft.slice(0, before.length) !== before) return;
                const token = aliasToken(state.draft, before.length);
                if (token === null) return;
                if (!token.skill) {
                  const synthetic = state.draft.slice(0, token.start) + TRIGGER + state.draft.slice(token.start + 1);
                  controller.track(synthetic, before.length, { tier: 'plain' }, state.draftRev);
                  return;
                }
                // The skill panel is the native menu narrowed to one source.
                // Re-issuing the same token would toggle it closed, and one edit
                // can publish twice, so the last issued token is remembered.
                const key = `${token.start}:${before.length}:${state.draftRev}`;
                if (key === lastSkill) return;
                lastSkill = key;
                controller.toggleSource(SKILL_SOURCE, {
                  trigger: TRIGGER,
                  query: state.draft.slice(token.start + 1, before.length),
                  quoted: false,
                  position: state.draft.slice(0, token.start).trim() === '' ? 'leading' : 'inline',
                  span: { start: token.start, end: before.length, draftRev: state.draftRev },
                });
              } catch (error) {
                // A retired Session or a shutting-down controller must not take
                // the composer down with it.
                console.error('[dsh-composer-command-alias] alias attempt failed:', error);
              }
            };

            /** Resolve the session faces once; the slot remounts when the session changes. */
            const connect = () => {
              if (unsubscribe !== null) return;
              try {
                const binding = ctx.sessions.binding(sessionId);
                if (binding === undefined) return;
                const input = ctx.conversation.input.for(binding.ctx);
                const controller = ctx.inputTriggers.sessionOf(binding.ctx);
                // The composer publishes its input state before its own tracking
                // call for the same edit, and that call would close a menu the
                // attempt had just opened; run one microtask later so the alias
                // track is the last word on this edit.
                unsubscribe = input.state.subscribe(() => {
                  queueMicrotask(() => { attempt(input, controller) });
                });
                // An alias may already sit in the draft when this entry loads.
                attempt(input, controller);
              } catch (error) {
                console.error('[dsh-composer-command-alias] composer binding unavailable:', error);
              }
            };

            connect();
            // A Session retained after this entry mounted is picked up on the
            // first insertion rather than by polling.
            const retry = () => { connect() };
            document.addEventListener('beforeinput', retry, true);

            return () => {
              document.removeEventListener('beforeinput', retry, true);
              if (unsubscribe !== null) unsubscribe();
            };
          }, [sessionId]);
          return null;
        }

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay', id: 'composer-command-alias', order: 90,
        }, ComposerCommandAlias));
      },
    };
  },
});
