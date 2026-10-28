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
 * The caret comes from the editor's own projection (`caretSpan`), not from the
 * DOM: that projection already maps the visible selection onto the draft text,
 * counting the newline each block boundary contributes, so a multi-paragraph
 * message keeps the plugin and the pipeline on the same offsets.
 *
 * The boundary rule mirrors `detectTrigger`: a trigger opens at the start of the
 * draft, after whitespace, or after punctuation, and stays dead after a letter,
 * digit, underscore, or CJK character. Ordinary 顿号 usage ("A、B", "甲、乙")
 * therefore never opens anything.
 *
 * Timing: two channels feed the attempt, both after the composer's own track for
 * the same edit. The published input state fires once per text change — after
 * the editor wrote the DOM and before the browser paints; the composer delivers
 * no usable `input` event for an ordinary insertion (Lexical claims
 * `beforeinput` and applies the edit itself), so an event-based trigger would
 * miss ordinary typing entirely. The editor's own commit is the second channel,
 * for the commits that change no text: they publish nothing, while the
 * composer still re-tracks the draft and closes a menu no alias token can
 * justify. An IME composition ending is exactly that commit, so without it the
 * panel died the moment a pinyin was settled.
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
    /** The composer's editable root; read only to confirm it holds the focus. */
    const COMPOSER = '[data-composer-input]';
    const WORD_CHAR = /[\p{L}\p{N}_]/u;
    const WHITESPACE = /\s/u;

    // ---- optional IME diagnostics ----
    // Off unless the localStorage flag below is "1". When on, one JSON line per
    // observed event goes to a local collector (tools/log-collector.py) and to a
    // localStorage ring. Nothing here changes behavior: every hook is read-only,
    // and every failure is swallowed.

    /** Where the collector listens (see "Diagnosing an IME problem" in README.md). */
    const LOG_ENDPOINT = 'http://127.0.0.1:17873/log';
    /** localStorage flag: exactly "1" turns logging on; anything else keeps it off. */
    const LOG_FLAG = 'dsh-composer-alias.debug';
    /** localStorage ring holding the same lines, readable after a reload. */
    const LOG_RING = 'dsh-composer-alias.log';
    const LOG_RING_LINES = 600;
    /** Read once: the flag is toggled by reloading, so logging never costs a lookup per event. */
    const LOGGING = (() => {
      try {
        return window.localStorage.getItem(LOG_FLAG) === '1';
      } catch (error) {
        return false;
      }
    })();
    let logQueue = [];
    let logTimer = 0;
    let logSeq = 0;

    /** @returns whether diagnostics are enabled for this page load. */
    function debugEnabled() {
      return LOGGING;
    }

    /** Deliver the queued lines: POST to the collector and append to the ring. */
    function debugFlush() {
      logTimer = 0;
      if (logQueue.length === 0) return;
      const lines = logQueue;
      logQueue = [];
      try {
        window.fetch(LOG_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          keepalive: true,
          headers: { 'content-type': 'text/plain' },
          body: `${lines.join('\n')}\n`,
        }).catch(() => {});
      } catch (error) {
        // The collector is optional; the ring below still keeps the record.
      }
      try {
        const previous = window.localStorage.getItem(LOG_RING);
        const all = `${previous === null ? '' : `${previous}\n`}${lines.join('\n')}`;
        window.localStorage.setItem(LOG_RING, all.split('\n').slice(-LOG_RING_LINES).join('\n'));
      } catch (error) {
        // Quota or a disabled storage backend only costs the fallback copy.
      }
    }

    /**
     * Record one diagnostic event.
     * @param event - short event name.
     * @param data - JSON-serializable detail.
     */
    function record(event, data) {
      if (!debugEnabled()) return;
      logSeq += 1;
      let line;
      try {
        line = JSON.stringify({ seq: logSeq, t: Math.round(performance.now()), event, ...data });
      } catch (error) {
        line = JSON.stringify({ seq: logSeq, t: Math.round(performance.now()), event, unprintable: String(error) });
      }
      logQueue.push(line);
      if (logTimer === 0) logTimer = window.setTimeout(debugFlush, 200);
    }

    /** @returns the composer's rendered text, newlines escaped for one-line logs. */
    function composerText() {
      const root = document.querySelector(COMPOSER);
      if (root === null) return null;
      return root.innerText.replace(/\n/gu, '\\n');
    }

    /** @returns composition and DOM state of the live editor, never throwing. */
    function editorInfo(input) {
      let composing = null;
      try {
        composing = typeof input.editor?.isComposing === 'function' ? input.editor.isComposing() : null;
      } catch (error) {
        composing = 'error';
      }
      return { composing, dom: composerText(), focus: document.activeElement?.tagName ?? null };
    }

    /** @returns the published input state, flattened. */
    function summarizeState(state) {
      return { draft: state.draft, rev: state.draftRev, phase: state.phase, occ: state.occurrences.length };
    }

    /** @returns the trigger menu, flattened to one loggable line. */
    function summarizeMenu(menu) {
      return {
        open: menu.open,
        gen: menu.generation,
        hit: menu.hit === null ? null : {
          trigger: menu.hit.trigger,
          query: menu.hit.query,
          pos: menu.hit.position,
          start: menu.hit.span.start,
          end: menu.hit.span.end,
          rev: menu.hit.span.draftRev,
        },
        groups: menu.groups.map(group => `${group.source}:${group.status}:${group.items.length}`).join(' '),
        hl: menu.highlight === null ? null : `${menu.highlight.source}:${menu.highlight.index}`,
      };
    }

    /**
     * Wrap methods in place so each call is logged with its arguments and
     * result; the prototype stays untouched and the wrapper is removable.
     * @param target - object owning the methods.
     * @param names - method names to wrap.
     * @param wrap - receives the name, the original, the receiver, and the args.
     * @returns the restore function.
     */
    function patchMethods(target, names, wrap) {
      const restores = [];
      for (const name of names) {
        const original = target[name];
        if (typeof original !== 'function') continue;
        const owned = Object.prototype.hasOwnProperty.call(target, name);
        target[name] = function patched(...args) {
          return wrap(name, original, this, args);
        };
        restores.push(() => {
          if (owned) target[name] = original;
          else delete target[name];
        });
      }
      return () => {
        for (const restore of restores) restore();
      };
    }

    /** @returns a JSON-safe echo of one call's arguments. */
    function briefArgs(args) {
      return args.map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg === undefined || arg === null) return null;
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch (error) {
          return String(arg);
        }
      });
    }

    /**
     * Attach diagnostics to one session's composer: editor commits, published
     * input state, menu transitions, composition/input/key events, and both
     * ends of the pick path. Read-only apart from the removable method
     * wrappers.
     * @param input - the session's input facade.
     * @param controller - the session's trigger controller.
     * @param sessionId - the session this entry is bound to.
     * @returns the cleanup function.
     */
    function installDebug(input, controller, sessionId) {
      const offs = [];
      const timers = [];
      if (!debugEnabled()) return () => {};
      const editor = input.editor;
      const later = (fn) => {
        timers.push(window.setTimeout(fn, 0));
      };
      const listen = (target, type, handler) => {
        target.addEventListener(type, handler, true);
        offs.push(() => { target.removeEventListener(type, handler, true) });
      };
      const snapshot = () => ({
        ...summarizeState(input.state.getSnapshot()),
        ...editorInfo(input),
        caretRaw: rawCaret(input),
        menu: summarizeMenu(controller.menu.getSnapshot()),
      });

      record('debug.mount', {
        sessionId: String(sessionId),
        ua: navigator.userAgent,
        hasEditor: typeof editor?.registerUpdateListener === 'function',
        state: summarizeState(input.state.getSnapshot()),
        menu: summarizeMenu(controller.menu.getSnapshot()),
      });

      offs.push(input.state.subscribe(() => {
        record('state', snapshot());
      }));
      offs.push(controller.menu.subscribe(() => {
        record('menu', summarizeMenu(controller.menu.getSnapshot()));
      }));
      offs.push(controller.launcher.subscribe(() => {
        record('launcher', { value: controller.launcher.getSnapshot() });
      }));

      if (typeof editor?.registerUpdateListener === 'function') {
        offs.push(editor.registerUpdateListener(({ tags }) => {
          record('editor.commit', {
            tags: Array.from(tags),
            composing: (() => {
              try {
                return editor.isComposing();
              } catch (error) {
                return 'error';
              }
            })(),
          });
          later(() => { record('editor.commit.dom', { dom: composerText() }) });
        }));
      }

      listen(document, 'compositionstart', (event) => {
        record('composition.start', { data: event.data, ...editorInfo(input) });
      });
      listen(document, 'compositionupdate', (event) => {
        record('composition.update', { data: event.data, ...editorInfo(input) });
      });
      listen(document, 'compositionend', (event) => {
        record('composition.end', { data: event.data, ...editorInfo(input) });
        queueMicrotask(() => { record('composition.end.settled', snapshot()) });
        later(() => { record('composition.end.later', snapshot()) });
      });
      listen(document, 'beforeinput', (event) => {
        record('beforeinput', {
          inputType: event.inputType,
          data: event.data,
          isComposing: event.isComposing,
          ...editorInfo(input),
        });
      });
      listen(document, 'input', (event) => {
        record('input', {
          inputType: event.inputType,
          data: event.data,
          isComposing: event.isComposing,
          ...editorInfo(input),
        });
      });
      const keyEvent = (type) => (event) => {
        // Only the gestures this investigation cares about: the IME's own
        // composing keys, Shift (which commits a pinyin), and Enter.
        const interesting = event.isComposing || event.keyCode === 229 || event.key === 'Process'
          || event.key === 'Shift' || event.shiftKey || event.key === 'Enter' || event.key === 'Escape';
        if (!interesting) return;
        record(type, {
          key: event.key,
          code: event.code,
          keyCode: event.keyCode,
          isComposing: event.isComposing,
          shift: event.shiftKey,
          altKey: event.altKey,
          repeat: event.repeat,
          ...editorInfo(input),
        });
      };
      listen(document, 'keydown', keyEvent('keydown'));
      listen(document, 'keyup', keyEvent('keyup'));
      listen(document, 'mousedown', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        record('mousedown', {
          inMenu: target?.closest('[data-trigger-menu]') !== null,
          target: target?.tagName ?? null,
          role: target?.getAttribute('role') ?? null,
          label: target?.textContent?.slice(0, 40) ?? null,
          defaultPrevented: event.defaultPrevented,
          ...editorInfo(input),
          menuOpen: controller.menu.getSnapshot().open,
        });
      });

      const restoreController = patchMethods(controller, ['pick', 'track', 'toggleSource', 'dismiss'], (name, original, self, args) => {
        record(`controller.${name}.call`, { args: briefArgs(args), menu: summarizeMenu(controller.menu.getSnapshot()), ...editorInfo(input) });
        let result;
        try {
          result = original.apply(self, args);
        } catch (error) {
          record(`controller.${name}.throw`, { message: String(error) });
          throw error;
        }
        record(`controller.${name}.return`, {
          result: result === undefined ? null : result,
          menu: summarizeMenu(controller.menu.getSnapshot()),
          ...editorInfo(input),
        });
        if (name === 'pick') {
          queueMicrotask(() => { record('pick.settled', snapshot()) });
          timers.push(window.setTimeout(() => { record('pick.after150', snapshot()) }, 150));
        }
        return result;
      });
      const restoreInput = patchMethods(input, ['insertText', 'insertReference', 'beginCommand', 'consumeToken', 'setDraft'], (name, original, self, args) => {
        record(`input.${name}.call`, {
          args: briefArgs(args),
          ...editorInfo(input),
          menu: summarizeMenu(controller.menu.getSnapshot()),
        });
        let result;
        try {
          result = original.apply(self, args);
        } catch (error) {
          record(`input.${name}.throw`, { message: String(error) });
          throw error;
        }
        record(`input.${name}.return`, {
          result: result === undefined ? null : (result === true ? true : false),
          ...summarizeState(input.state.getSnapshot()),
          ...editorInfo(input),
        });
        queueMicrotask(() => { record(`input.${name}.settled`, snapshot()) });
        return result;
      });

      offs.push(restoreController);
      offs.push(restoreInput);

      // One-click dump for the user: `__composerAliasDebug.dump()` returns the
      // ring as text, `clear()` empties it, `flush()` forces delivery.
      window.__composerAliasDebug = {
        dump: () => {
          try {
            return window.localStorage.getItem(LOG_RING) ?? '';
          } catch (error) {
            return '';
          }
        },
        clear: () => {
          try {
            window.localStorage.removeItem(LOG_RING);
          } catch (error) {
            // Nothing to clear when storage is unavailable.
          }
          logQueue = [];
        },
        flush: debugFlush,
        snapshot,
        now: () => record('manual.mark', snapshot()),
      };

      return () => {
        for (const timer of timers) window.clearTimeout(timer);
        for (const off of offs) off();
      };
    }

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
     * The collapsed composer caret, in the coordinates the published draft
     * uses.
     *
     * The editor's own projection maps the visible selection onto that text —
     * one character per block boundary, one atomic stand-in per chip — so the
     * offset can be read instead of rebuilt from the DOM. A DOM walk drops the
     * newline between paragraphs and then disagrees with the draft for every
     * multi-paragraph message, which is why the menu stayed shut on a second
     * line.
     * @param input - the session's input facade.
     * @returns the caret offset into the draft, or null when the composer is
     * not the focused surface or the selection covers text.
     */
    function composerCaret(input) {
      const root = document.querySelector(COMPOSER);
      if (root === null || !root.contains(document.activeElement)) return null;
      const span = input.caretSpan();
      if (span.start !== span.end) return null;
      return span.end;
    }

    /**
     * The editor's own selection span, for diagnostics: the projected caret
     * and the raw span only disagree when composition text is in flight.
     * @param input - the session's input facade.
     * @returns the span, or null when the facade refuses to answer.
     */
    function rawCaret(input) {
      try {
        return input.caretSpan();
      } catch (error) {
        return null;
      }
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

    return {
      inject: ['slots', 'sessions', 'conversation', 'inputTriggers'],
      apply(ctx) {
        /**
         * Invisible resident of the composer overlay. Maps the live composer to
         * the session's trigger controller and re-arms the menu for a trailing
         * 顿号 or skill alias; it never edits the draft.
         * @param props - slot props; only the session id is read.
         * @returns nothing rendered.
         */
        function ComposerCommandAlias(props) {
          const sessionId = props.sessionId;
          React.useLayoutEffect(() => {
            let unsubscribe = null;
            /** Releases the editor-commit re-arm hook (null until the session resolves). */
            let stopEditor = null;
            /** Releases the diagnostic hooks (null until the session resolves). */
            let stopDebug = null;
            /** Token signature of the skill panel this effect last opened. */
            let lastSkill = null;

            /**
             * Offer the current draft to the trigger pipeline: a token holding a
             * boundary comma is presented as a slash hit, one holding a skill
             * alias as the skill source alone. Inert when no alias token ends at
             * the caret, or when a chip puts the draft and the trigger
             * coordinates out of step.
             * @param input - the session's input facade.
             * @param controller - the session's trigger controller.
             */
            const attempt = (input, controller) => {
              try {
                const state = input.state.getSnapshot();
                /** Diagnostics for one decision; a no-op unless this page load logs. */
                const trace = (detail) => {
                  if (LOGGING) record('attempt', { ...summarizeState(state), ...editorInfo(input), ...detail });
                };
                if (state.phase !== 'plain' || state.occurrences.length > 0) {
                  trace({ why: 'draft-not-plain-text' });
                  return;
                }
                if (!state.draft.includes(ALIAS) && !SKILL_ALIASES.some(ch => state.draft.includes(ch))) {
                  trace({ why: 'no-alias-in-draft' });
                  return;
                }
                const caret = composerCaret(input);
                if (caret === null) {
                  trace({ why: 'caret-unavailable', caretRaw: rawCaret(input) });
                  return;
                }
                const token = aliasToken(state.draft, caret);
                if (token === null) {
                  trace({ caret, caretRaw: rawCaret(input), why: 'no-token-at-caret' });
                  return;
                }
                if (!token.skill) {
                  const synthetic = state.draft.slice(0, token.start) + TRIGGER + state.draft.slice(token.start + 1);
                  trace({ caret, token, why: 'comma-track' });
                  controller.track(synthetic, caret, { tier: 'plain' }, state.draftRev);
                  return;
                }
                // The skill panel is the native menu narrowed to one source.
                // Re-issuing the same token would only re-seed it, and one edit
                // can publish twice, so the last issued token is remembered.
                const key = `${token.start}:${caret}:${state.draftRev}`;
                if (key === lastSkill) {
                  trace({ caret, token, why: 'skill-dedup' });
                  return;
                }
                lastSkill = key;
                trace({ caret, token, key, why: 'skill-open' });
                controller.toggleSource(SKILL_SOURCE, {
                  trigger: TRIGGER,
                  query: state.draft.slice(token.start + 1, caret),
                  quoted: false,
                  position: state.draft.slice(0, token.start).trim() === '' ? 'leading' : 'inline',
                  span: { start: token.start, end: caret, draftRev: state.draftRev },
                });
                // `toggleSource` is the gesture launcher's entry, so it also
                // marks the menu launcher-opened. That flag buys a gesture one
                // thing this plugin must not take: the controller swallows the
                // very next track, which is exactly the edit that deletes the
                // alias and should close the panel — the panel used to need a
                // second Backspace because of it. Nothing holds this menu by
                // gesture; its token is typed. An empty track spends the flag
                // without touching the open menu, so the next real edit reaches
                // the pipeline and closes or refilters as usual.
                if (controller.launcher.getSnapshot() !== null && controller.menu.getSnapshot().open) {
                  controller.track('', 0, { tier: 'plain' }, state.draftRev);
                }
              } catch (error) {
                record('attempt.error', { message: String(error) });
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
                // A commit that changes no text publishes nothing, and the
                // composer still re-tracks on it — so its own track closes the
                // menu with no publish left to re-arm from. Ending an IME
                // composition is exactly such a commit: the draft already holds
                // the composed text, the commit only settles it, and the panel
                // used to vanish right there. Re-arm on the commit itself, which
                // runs after the composer's own track for the same edit.
                if (typeof input.editor?.registerUpdateListener === 'function') {
                  stopEditor = input.editor.registerUpdateListener(() => { attempt(input, controller) });
                }
                // An alias may already sit in the draft when this entry loads.
                attempt(input, controller);
                stopDebug = installDebug(input, controller, sessionId);
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
              if (stopEditor !== null) stopEditor();
              if (stopDebug !== null) stopDebug();
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
