#!/usr/bin/env node
/**
 * Headless screenshots and console capture for development, with no dependencies: drives an
 * installed Chrome or Edge through the DevTools Protocol over Node's built-in WebSocket.
 *
 *   node scripts/shot.mjs <url> [--out=shots/shot.png] [--size=1280x720] [--wait=3000]
 *                         [--steps=steps.json] [--dpr=1] [--timeout=120000]
 *                         [--touch=1] [--downloads=shots/downloads]
 *
 * Without --steps it waits --wait ms after load and saves one PNG to --out.
 * --steps is a JSON array of actions run in order after the page loads:
 *   {"wait": 1500}                                    pause (ms)
 *   {"eval": "window.kemer !== undefined"}            evaluate JS in the page, print the result
 *   {"click": [640, 360], "button": "left"}           click at CSS pixels
 *   {"mouse": "down" | "up" | "move", "x": 1, "y": 2, "button": "left"}
 *   {"drag": [[x0, y0], [x1, y1]], "ms": 600, "button": "left"}
 *   {"key": "Space", "hold": 800}                     press (and hold) a key: Space, Escape, Enter, KeyQ, Digit1 …
 *   {"tap": [x, y]}  {"swipe": [[x0, y0], [x1, y1]], "ms": 600}   touch input (with --touch=1)
 *   {"tap": ".css-selector", "hold": 3000}            touch the middle of an element (held)
 *   {"swipe": ".css-selector", "by": [dx, dy]}         drag from the middle of an element
 *   {"viewport": [844, 390]}                          resize the page mid-run
 *   {"shot": "shots/a.png"}                           save a screenshot
 * Prints the page's console output, exceptions and log entries. Exit code 1 if the page threw.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (!url) {
  console.error('usage: node scripts/shot.mjs <url> [--out=file.png] [--size=WxH] [--wait=ms] [--steps=file.json]');
  process.exit(2);
}

const out = opt('out', 'shots/shot.png');
const [width, height] = opt('size', '1280x720').split('x').map((v) => Math.max(64, Number(v) || 0));
const waitMs = Number(opt('wait', '3000'));
const dpr = Number(opt('dpr', '1')) || 1;
const timeoutMs = Number(opt('timeout', '120000'));
const stepsPath = opt('steps', null);
const touch = opt('touch', '0') === '1';
const downloads = opt('downloads', null);
const steps = stepsPath ? JSON.parse(readFileSync(stepsPath, 'utf8')) : [{ wait: waitMs }, { shot: out }];

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const exe = BROWSERS.find((p) => p && existsSync(p));
if (!exe) {
  console.error('shot: no Chrome or Edge found (set CHROME_PATH)');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'kemer-shot-'));
const browser = spawn(
  exe,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

let pageThrew = false;
let finished = false;

function cleanup(code) {
  if (finished) return;
  finished = true;
  try {
    browser.kill();
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the OS cleans temp eventually */
    }
    process.exit(code);
  }, 300);
}

const overall = setTimeout(() => {
  console.error(`shot: timed out after ${timeoutMs} ms`);
  cleanup(3);
}, timeoutMs);

const wsUrl = await new Promise((resolveUrl, reject) => {
  let buffer = '';
  const timer = setTimeout(() => reject(new Error('browser did not start')), 30000);
  browser.stderr.on('data', (chunk) => {
    buffer += chunk.toString();
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
    if (m) {
      clearTimeout(timer);
      resolveUrl(m[1]);
    }
  });
  browser.on('exit', (code) => reject(new Error(`browser exited (${code})`)));
}).catch((err) => {
  console.error(`shot: ${err.message}`);
  cleanup(2);
  return null;
});
if (!wsUrl) await new Promise(() => {});

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${p.method})`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  send(method, params = {}, sessionId = undefined) {
    const id = ++this.nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej, method }));
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('websocket error')), { once: true });
});
const cdp = new Cdp(ws);

const describe = (o) => {
  if (!o) return '';
  if (o.value !== undefined) return typeof o.value === 'string' ? o.value : JSON.stringify(o.value);
  return o.unserializableValue ?? o.description ?? o.type;
};

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const send = (method, params) => cdp.send(method, params, sessionId);

let loaded = null;
cdp.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  switch (msg.method) {
    case 'Runtime.consoleAPICalled':
      console.log(`[console.${msg.params.type}] ${msg.params.args.map(describe).join(' ')}`.slice(0, 2000));
      break;
    case 'Runtime.exceptionThrown': {
      pageThrew = true;
      const d = msg.params.exceptionDetails;
      console.log(`[exception] ${d.exception?.description ?? d.text}`.slice(0, 3000));
      break;
    }
    case 'Log.entryAdded':
      console.log(`[log.${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`.slice(0, 2000));
      break;
    case 'Page.loadEventFired':
      if (loaded) loaded();
      break;
    default:
      break;
  }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch });
// A phone: touch input (taps and swipes arrive as touch pointers, not a mouse).
if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
// Files the page saves (a shared image or video) land here, so a run can check them.
if (downloads) {
  mkdirSync(resolve(downloads), { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(downloads) });
}
const loadPromise = new Promise((res) => (loaded = res));
await send('Page.navigate', { url });
await Promise.race([loadPromise, new Promise((res) => setTimeout(res, 30000))]);

const KEYS = {
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
};
function keyInfo(name) {
  if (KEYS[name]) return KEYS[name];
  let m = /^Key([A-Z])$/.exec(name);
  if (m) return { key: m[1].toLowerCase(), code: name, keyCode: m[1].charCodeAt(0), text: m[1].toLowerCase() };
  m = /^Digit([0-9])$/.exec(name);
  if (m) return { key: m[1], code: name, keyCode: 48 + Number(m[1]), text: m[1] };
  return { key: name, code: name, keyCode: 0 };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const mouse = (type, x, y, button = 'left', buttons = 0) =>
  send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
const buttonsMask = (b) => (b === 'right' ? 2 : b === 'middle' ? 4 : 1);

for (const step of steps) {
  try {
    if (step.wait !== undefined) await sleep(Number(step.wait));
    else if (step.eval !== undefined) {
      const r = await send('Runtime.evaluate', { expression: step.eval, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        console.log(`[eval error] ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      } else {
        console.log(`[eval] ${describe(r.result)}`.slice(0, 4000));
      }
    } else if (step.click) {
      const [x, y] = step.click;
      const b = step.button ?? 'left';
      await mouse('mouseMoved', x, y, 'none');
      await mouse('mousePressed', x, y, b, buttonsMask(b));
      await sleep(40);
      await mouse('mouseReleased', x, y, b, 0);
    } else if (step.mouse) {
      const b = step.button ?? 'left';
      const type = step.mouse === 'down' ? 'mousePressed' : step.mouse === 'up' ? 'mouseReleased' : 'mouseMoved';
      await mouse(type, step.x, step.y, type === 'mouseMoved' ? (step.held ? b : 'none') : b, step.mouse === 'up' ? 0 : step.held || step.mouse === 'down' ? buttonsMask(b) : 0);
    } else if (step.drag) {
      const [[x0, y0], [x1, y1]] = step.drag;
      const b = step.button ?? 'left';
      const ms = Number(step.ms ?? 600);
      const n = Math.max(2, Math.round(ms / 16));
      await mouse('mouseMoved', x0, y0, 'none');
      await mouse('mousePressed', x0, y0, b, buttonsMask(b));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        await mouse('mouseMoved', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, b, buttonsMask(b));
        await sleep(ms / n);
      }
      await mouse('mouseReleased', x1, y1, b, 0);
    } else if (step.viewport) {
      // Resize the page mid-run (a rotated phone, a resized window).
      const [w, h] = step.viewport;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: touch });
    } else if (step.tap) {
      // A selector taps the middle of that element, so a run survives layout changes.
      let at = step.tap;
      if (typeof at === 'string') {
        const expr = `(() => { const e = document.querySelector(${JSON.stringify(at)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        at = r.result?.value ?? null;
        console.log(`[tap] ${step.tap} ${at ? at.map((v) => Math.round(v)).join(',') : 'not found'}`);
        if (!at) continue;
      }
      const [x, y] = at;
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(Number(step.hold ?? 60));
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else if (step.swipe) {
      let path = step.swipe;
      if (typeof path === 'string') {
        // From the middle of an element, moved by "by": a finger on a handle.
        const expr = `(() => { const e = document.querySelector(${JSON.stringify(path)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        const from = r.result?.value ?? null;
        console.log(`[swipe] ${step.swipe} ${from ? from.map((v) => Math.round(v)).join(',') : 'not found'}`);
        if (!from) continue;
        const [dx, dy] = step.by ?? [0, 0];
        path = [from, [from[0] + dx, from[1] + dy]];
      }
      const [[x0, y0], [x1, y1]] = path;
      const ms = Number(step.ms ?? 600);
      const n = Math.max(2, Math.round(ms / 16));
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, id: 1 }] });
        await sleep(ms / n);
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else if (step.key) {
      const k = keyInfo(step.key);
      const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k.text });
      if (step.hold) await sleep(Number(step.hold));
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    } else if (step.shot) {
      const file = resolve(step.shot);
      mkdirSync(dirname(file), { recursive: true });
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`[shot] ${file}`);
    }
  } catch (err) {
    console.log(`[step error] ${JSON.stringify(step)}: ${err.message}`);
  }
}

clearTimeout(overall);
try {
  await cdp.send('Browser.close');
} catch {
  /* already closing */
}
cleanup(pageThrew ? 1 : 0);
