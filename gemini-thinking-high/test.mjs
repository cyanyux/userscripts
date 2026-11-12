import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./gemini-thinking-high.user.js', import.meta.url), 'utf8');

// Exercise the real userscript against a small accessible-menu DOM and fake clock.
function harness({ initialHigh = false, thinkingReady = true, highReady = true } = {}) {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const listeners = new Map();
  const observers = new Set();
  const stats = { layoutReads: 0, pickerQueries: 0, modelClicks: 0, warnings: [], styles: new Set(), mutedOpens: 0, highClicks: [], markedOpens: 0 };
  const state = { model: 'Hydrogen', thinkingReady, highReady, cleanupThrows: false };
  const location = { href: 'https://gemini.google.com/app' };
  const document = {
    hidden: false,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    getElementById(id) { return [root, submenu].find(menu => menu.attrs.id === id) || null; },
    querySelector() { stats.pickerQueries++; return state.pickerMissing ? null : picker; },
    querySelectorAll() { return [root, submenu, dialog]; },
    createElement() {
      return { remove() { stats.styles.delete(this); } };
    },
    documentElement: { append(style) { stats.styles.add(style); } },
  };
  function emit(type, target = document.body) {
    for (const listener of listeners.get(type) || []) listener({ isTrusted: true, target });
  }
  class Element {
    constructor(attrs = {}, parent = null) {
      this.attrs = attrs;
      this.parent = parent;
      this.isConnected = true;
      this.shown = true;
      this.children = [];
      if (parent) parent.children.push(this);
    }
    getAttribute(name) { return this.attrs[name] ?? null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    checkVisibility() {
      stats.layoutReads++;
      return this.shown && (!this.parent || this.parent.checkVisibility());
    }
    matches() { return this.attrs.disabled || this.attrs['aria-disabled'] === 'true'; }
    closest() { return this.attrs.role === 'menu' ? this : this.parent?.closest() || null; }
    contains(element) {
      return element === this || this.children.some(child => child.contains(element));
    }
    querySelectorAll() {
      return this.children.flatMap(child => [child, ...child.querySelectorAll()])
        .filter(child => child.attrs.role?.startsWith('menuitem'));
    }
    focus() { document.activeElement = this; }
  }
  const body = new Element();
  document.body = body;
  document.activeElement = body;
  const root = new Element({ role: 'menu', id: 'mode-menu' });
  const submenu = new Element({ role: 'menu', id: 'thinking-menu' }, root);
  const dialog = new Element({ role: 'dialog' });
  root.shown = submenu.shown = dialog.shown = false;
  let picker = new Element({ 'aria-controls': 'mode-menu', 'aria-expanded': 'false' });
  const model = new Element({ role: 'menuitemradio' }, root);
  model.textContent = 'Everyday help 4 Hydrogen';
  model.click = () => { stats.modelClicks++; };
  const thinking = new Element({ role: 'menuitem', 'aria-controls': 'thinking-menu' }, root);
  thinking.textContent = ' Thinking level ';
  const high = new Element({ role: 'menuitemradio' }, submenu);
  high.textContent = ' High Extra thorough ';
  const originalVisible = thinking.checkVisibility.bind(thinking);
  thinking.checkVisibility = () => state.thinkingReady && originalVisible();
  const originalHighVisible = high.checkVisibility.bind(high);
  high.checkVisibility = () => state.highReady && originalHighVisible();
  function close() {
    root.shown = submenu.shown = false;
    picker.attrs['aria-expanded'] = 'false';
  }
  function setLabel(isHigh) {
    picker.attrs['aria-label'] = 'Open mode picker, currently ' + state.model + (isHigh ? ' High' : '');
    high.attrs['aria-checked'] = String(isHigh);
    for (const observer of observers) {
      if (observer.targets.has(picker)) observer.callback();
    }
  }
  function wirePicker() {
    picker.click = () => {
      if (root.shown) {
        if (state.cleanupThrows) throw new Error('Simulated cleanup exception');
        close();
      } else {
        if (stats.styles.size) stats.mutedOpens++;
        if (picker.getAttribute('data-gemini-high-auto-switch') !== null) stats.markedOpens++;
        state.openedFor = location.href;
        root.shown = true;
        picker.attrs['aria-expanded'] = 'true';
        document.activeElement = thinking;
      }
    };
  }
  thinking.click = () => { submenu.shown = true; document.activeElement = high; };
  high.click = () => {
    stats.highClicks.push({ openedFor: state.openedFor, url: location.href });
    setLabel(true);
    high.attrs['aria-checked'] = 'true';
    close();
  };
  wirePicker();
  setLabel(initialHigh);
  function addTimer(callback, delay, repeat = 0) {
    const id = ++sequence;
    timers.set(id, { callback, at: now + delay, repeat });
    return id;
  }
  const window = {};
  const context = vm.createContext({
    window, document, location,
    queueMicrotask,
    Date: { now: () => now },
    console: { warn: (...args) => stats.warnings.push(args) },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
      observe(target) { this.targets.add(target); }
      disconnect() { this.targets.clear(); }
    },
    setTimeout: (callback, delay) => addTimer(callback, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => addTimer(callback, delay, delay),
    clearInterval: id => timers.delete(id),
  });
  async function advance(ms) {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.repeat;
      else timers.delete(id);
      timer.callback();
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    }
    now = end;
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  }
  const start = () => vm.runInContext(source, context);
  start();
  return {
    stats, state, location, document, root, submenu, thinking, high, dialog, timers,
    advance, start, emit, close, setLabel, observers,
    mutate(element) {
      for (const observer of observers) if (observer.targets.has(element)) observer.callback();
    },
    isHigh: () => / High$/.test(picker.attrs['aria-label']),
    marker: () => picker.getAttribute('data-gemini-high-auto-switch'),
    version: () => window.__geminiAlwaysHighThinking.version,
    stop: () => window.__geminiAlwaysHighThinking.stop(),
    replacePicker() {
      picker.isConnected = false;
      picker = new Element({ 'aria-controls': 'mode-menu', 'aria-expanded': 'false' });
      wirePicker();
      close();
      setLabel(false);
    },
  };
}

test('selects High without clicking a model option', async () => {
  const h = harness();
  await h.advance(0);
  assert.equal(h.isHigh(), true);
  assert.equal(h.stats.modelClicks, 0);
  assert.equal(h.root.shown, false);
  assert.equal(h.stats.mutedOpens, 1);
  assert.equal(h.stats.markedOpens, 1);
  assert.equal(h.marker(), null);
  assert.equal(h.version(), '1.3.0');
  assert.equal(h.stats.styles.size, 0);
  assert.equal(h.marker(), null);
});

test('already-High idle path performs no layout reads or repeated picker queries', async () => {
  const h = harness({ initialHigh: true });
  await h.advance(60_000);
  assert.equal(h.stats.layoutReads, 0);
  assert.equal(h.stats.pickerQueries, 1);
});

test('recovers from same-URL resets, SPA navigation, and picker replacement', async () => {
  const h = harness();
  await h.advance(2500);
  h.setLabel(false);
  await h.advance(2500);
  assert.equal(h.isHigh(), true);
  h.state.model = 'Argon';
  h.location.href += '/existing-chat';
  h.replacePicker();
  await h.advance(2500);
  assert.equal(h.isHigh(), true);
  assert.equal(h.stats.modelClicks, 0);
});

test('retries a transiently missing Thinking level control', async () => {
  const h = harness({ thinkingReady: false });
  await h.advance(4500);
  assert.equal(h.root.shown, false);
  h.state.thinkingReady = true;
  await h.advance(7000);
  assert.equal(h.isHigh(), true);
});

test('limits unsupported controls to three attempts', async () => {
  const h = harness({ thinkingReady: false });
  await h.advance(40_000);
  const reads = h.stats.layoutReads;
  await h.advance(40_000);
  assert.equal(h.stats.layoutReads, reads);
  assert.equal(h.isHigh(), false);
  assert.equal(h.stats.styles.size, 0);
});

test('cancels stale-route work without clicking High', async () => {
  const h = harness({ highReady: false });
  await h.advance(1500);
  assert.equal(h.submenu.shown, true);
  h.location.href += '/another-chat';
  h.state.highReady = true;
  await h.advance(100);
  assert.equal(h.isHigh(), true);
  assert.equal(h.stats.highClicks.length, 1);
  assert.equal(h.stats.highClicks[0].openedFor, h.location.href);
  assert.equal(h.root.shown, false);
});

test('leaves user menus and dialogs alone; defers while typing', async () => {
  const h = harness();
  h.dialog.shown = true;
  await h.advance(5000);
  assert.equal(h.root.shown, false);
  h.dialog.shown = false;
  h.root.shown = true;
  await h.advance(2500);
  assert.equal(h.submenu.shown, false);
  h.close();
  h.emit('keydown');
  await h.advance(1200);
  assert.equal(h.root.shown, false);
  await h.advance(2000);
  assert.equal(h.isHigh(), true);
});

test('user takeover cancels automation without closing their menu', async () => {
  const h = harness({ thinkingReady: false });
  await h.advance(1200);
  assert.equal(h.root.shown, true);
  h.emit('pointerdown', h.thinking);
  assert.equal(h.stats.styles.size, 0);
  assert.equal(h.marker(), null);
  h.state.thinkingReady = true;
  await h.advance(2500);
  assert.equal(h.root.shown, true);
  assert.equal(h.submenu.shown, false);
  h.close();
  await h.advance(2500);
  assert.equal(h.isHigh(), true);
  assert.equal(h.stats.styles.size, 0);
});

test('detects the initial picker in the same turn without a polling delay', async () => {
  const h = harness();
  h.state.pickerMissing = true;
  await h.advance(0);
  assert.equal(h.isHigh(), false);
  h.state.pickerMissing = false;
  h.mutate(h.document);
  await h.advance(0);
  assert.equal(h.isHigh(), true);
  assert.ok([...h.observers].every(observer => !observer.targets.has(h.document)));
});

test('startup discovery stops on pages without a picker', async () => {
  const h = harness();
  h.state.pickerMissing = true;
  await h.advance(11_000);
  assert.ok([...h.observers].every(observer => !observer.targets.has(h.document)));
  h.state.pickerMissing = false;
  await h.advance(1000);
  assert.equal(h.isHigh(), true);
});

test('menu mutations wake a pending switch without waiting for its fallback timer', async () => {
  const h = harness({ highReady: false });
  await h.advance(0);
  assert.equal(h.isHigh(), false);
  assert.equal(h.stats.styles.size, 1);
  h.state.highReady = true;
  h.mutate(h.submenu);
  await h.advance(0);
  assert.equal(h.isHigh(), true);
  assert.equal(h.stats.styles.size, 0);
});

test('stopping in the middle of a switch immediately removes styles and wait timers', async () => {
  const h = harness({ highReady: false });
  await h.advance(0);
  assert.equal(h.stats.styles.size, 1);
  h.stop();
  assert.equal(h.stats.styles.size, 0);
  assert.equal(h.marker(), null);
  assert.equal(h.timers.size, 0);
  await h.advance(0);
  assert.equal(h.root.shown, false);
  assert.equal(h.isHigh(), false);
});

test('hidden tabs stop their interval and resume when shown', async () => {
  const h = harness({ initialHigh: true });
  await h.advance(2500);
  h.document.hidden = true;
  h.emit('visibilitychange');
  assert.equal(h.timers.size, 0);
  h.setLabel(false);
  await h.advance(60_000);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.emit('visibilitychange');
  await h.advance(2500);
  assert.equal(h.isHigh(), true);
});

test('cleanup exceptions release the running guard', async () => {
  const h = harness({ thinkingReady: false });
  h.state.cleanupThrows = true;
  await h.advance(4500);
  assert.ok(h.stats.warnings.length);
  h.state.cleanupThrows = false;
  h.state.thinkingReady = true;
  h.close();
  await h.advance(7000);
  assert.equal(h.isHigh(), true);
});

test('reinjection disposes the previous instance; stop clears all observers and timers', async () => {
  const h = harness({ initialHigh: true });
  await h.advance(2500);
  h.start();
  await h.advance(2500);
  assert.equal(h.timers.size, 1);
  h.stop();
  assert.equal(h.timers.size, 0);
  h.setLabel(false);
  h.emit('visibilitychange');
  await h.advance(5000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.isHigh(), false);
});
