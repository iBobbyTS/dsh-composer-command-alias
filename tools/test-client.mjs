import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
function attempt(draft, node, phase = 'plain', occurrences = []) {
  let entry, component; const effects = []; const calls = [];
  const input = {
    state: { getSnapshot: () => ({ draft, phase, occurrences, draftRev: 1 }), subscribe: () => () => {} },
    caretSpan: () => ({ start: draft.length, end: draft.length }),
    editor: { getEditorState: () => ({ toJSON: () => ({ root: { type: 'root', children: [node] } }) }), registerUpdateListener: () => () => {} },
  };
  const controller = {
    menu: { getSnapshot: () => ({ open: false }) }, launcher: { getSnapshot: () => null },
    track: (...args) => calls.push(['track', ...args]), toggleSource: (...args) => calls.push(['skill', ...args]),
  };
  const document = { querySelector: () => ({ contains: () => true }), activeElement: {}, addEventListener() {}, removeEventListener() {} };
  const window = { __ModuleLoader__: { load: value => { entry = value; } }, localStorage: { getItem: () => null } };
  vm.runInNewContext(source, { window, document, console, queueMicrotask, navigator: {}, Element: class {} });
  const plugin = entry.factory(() => ({ useLayoutEffect: cb => effects.push(cb) }));
  plugin.apply({ sessions: { binding: () => ({ ctx: {} }) }, conversation: { input: { for: () => input } }, inputTriggers: { sessionOf: () => controller },
    slots: { inject: (_, cb) => cb(), register: (_, value) => { component = value; } } });
  component({ sessionId: 'session' }); effects.forEach(cb => cb());
  return calls;
}
const text = { type: 'paragraph', children: [{ type: 'text', text: '$sec' }] };
assert.equal(attempt('$sec', text)[0][0], 'skill');
assert.equal(attempt('、goal', text)[0][0], 'track');
assert.deepEqual(attempt('Quoted text followed by $sec', { type: 'paragraph', children: [{ type: 'quote', text: 'Quoted text' }, text] }), []);
assert.deepEqual(attempt('$sec', text, 'sending'), []);
assert.deepEqual(attempt('$sec', text, 'plain', [{}]), []);
console.log('Alias plain/quote/reference/sending checks passed');
