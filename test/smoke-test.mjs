// Offline smoke test: loads client.js under stubbed globals, runs apply(), and
// renders the registered pill against a mocked account Remote.
const registered = [];
const localeRegistrations = [];
const styleTags = [];

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      globalThis.__pluginDefinition = definition;
    },
  },
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.document = {
  visibilityState: 'visible',
  head: {
    appendChild: (tag) => styleTags.push(tag),
  },
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};

Object.defineProperty(globalThis, 'navigator', { value: { language: 'es-AR' }, configurable: true });
globalThis.__DSH_BOOT__ = { release: { version: '0.2.1-rc.5' } };

// --- minimal React -----------------------------------------------------------
const hookState = [];
let hookIndex = 0;
let pendingEffects = [];

const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
  },
  useState(initial) {
    const index = hookIndex++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (value) => { hookState[index] = value; }];
  },
  useEffect(effect) {
    pendingEffects.push(effect);
  },
};

const requireStub = (id) => {
  if (id === 'react') return React;
  throw new Error('unexpected require: ' + id);
};

await import(new URL('../client.js', import.meta.url).href);

const definition = globalThis.__pluginDefinition;
console.log('module id:', definition?.id);

const plugin = definition.factory(requireStub);
console.log('inject:', JSON.stringify(plugin.inject));

const balanceValue = {
  status: 'ready',
  value: [{ currency: 'USD', balance: '2.06' }],
  bonusWallets: [{ currency: 'USD', balance: '0.00' }],
};

let calls = 0;
const ctx = {
  locale: {
    register: (ns, dicts) => { localeRegistrations.push({ ns, keys: Object.keys(dicts.en) }); return () => {}; },
  },
  remote: {
    account: {
      getBalance: async (metadata) => { calls += 1; globalThis.__lastMetadata = metadata; return { ok: true, value: balanceValue }; },
    },
  },
  effect: (factory) => { factory(); },
  slots: {
    inject: (name, factory) => { factory(); },
    register: (options, component) => { registered.push({ options, component }); return () => {}; },
  },
};

plugin.apply(ctx);

console.log('slots registered:', registered.map((r) => r.options.name + '#' + r.options.id + '@' + r.options.order).join(', '));
console.log('locale namespaces:', localeRegistrations.map((r) => r.ns).join(', '));
console.log('style tags installed:', styleTags.length);

const registration = registered[0];
const props = registration.options.inject();
console.log('injected props:', Object.keys(props).join(', '));

const render = () => {
  hookIndex = 0;
  pendingEffects = [];
  const tree = registration.component({ ...props, t: (key) => 'EN:' + key });
  for (const effect of pendingEffects) effect();
  return tree;
};

const textOf = (node) => {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
};

const first = render();
console.log('first render (loading):', first === null ? 'null (hidden)' : 'unexpected tree');

await new Promise((resolve) => setTimeout(resolve, 20));
const second = render();
console.log('second render text:', JSON.stringify(textOf(second)));
console.log('second render title:', JSON.stringify(second?.props?.title));
console.log('read calls:', calls, 'metadata:', JSON.stringify(globalThis.__lastMetadata));

// --- assertions --------------------------------------------------------------
const text = textOf(second);
const problems = [];
if (definition.id !== 'dsh-plugin-balance') problems.push('module id mismatch');
if (registration.options.name !== 'conversation.composer.dock') problems.push('slot name mismatch');
if (registration.options.order !== 2) problems.push('order mismatch');
if (text !== '2.06 USD') problems.push('amount text mismatch: ' + text);
if (!String(second?.props?.title ?? '').includes('2.06 USD')) problems.push('tooltip missing total');
if (calls !== 1) problems.push('expected one read, got ' + calls);
if (globalThis.__lastMetadata?.version !== '0.2.1-rc.5') problems.push('metadata version mismatch');
if (globalThis.__lastMetadata?.locale !== 'es-AR') problems.push('metadata locale mismatch');
if (typeof globalThis.__lastMetadata?.timezoneOffsetSeconds !== 'number') problems.push('metadata zone missing');

console.log(problems.length === 0 ? 'SMOKE TEST OK' : 'SMOKE TEST FAILED:\n' + problems.join('\n'));
process.exitCode = problems.length === 0 ? 0 : 1;
