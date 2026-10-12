// Loads the control and the edited page in headless Chrome and prints what happened.
// Uses the installed Google Chrome; set PW_CHANNEL=chromium to use Playwright's Chromium.
// Usage: npm run verify (after `npm install --no-save svelte@<version>` to test another version)
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const { version } = JSON.parse(readFileSync('node_modules/svelte/package.json', 'utf8'));
const port = 3123;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) } });
await new Promise((resolve) => server.stdout.once('data', resolve));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });

console.log(`svelte ${version}`);
for (const path of ['/?control', '/']) {
  const page = await browser.newPage();
  const log = [];
  page.on('console', (msg) => log.push(`[console.${msg.type()}] ${msg.text()}`));
  // Chrome's own report of uncaught errors and unhandled rejections, as DevTools shows them.
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
    const props = d.exception?.preview?.properties;
    const shown = props ? `{${props.map((p) => `${p.name}: ${p.value}`).join(', ')}}` : d.exception?.description;
    log.push(`[exception] ${d.text} ${shown}`);
  });
  await cdp.send('Runtime.enable');
  await page.addInitScript(() => {
    // readyState turns 'interactive' after parsing (and after the inline edit script)
    // but before module scripts run, so these are the server-rendered nodes.
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        window.__ssr = { header: document.querySelector('header'), p: document.querySelector('#greeting') };
      }
    });
  });
  await page.goto(`http://localhost:${port}${path}`);
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => ({
    '<main> after load': document.querySelector('main').innerHTML,
    '<p> present': document.querySelector('#greeting')?.outerHTML ?? null,
    'failed snippet shown': document.querySelector('#failed')?.textContent ?? null,
    'server-rendered <header> kept (root not remounted)': document.contains(window.__ssr.header),
    'server-rendered <p> kept': document.contains(window.__ssr.p),
  }));
  console.log(`\n== ${path === '/' ? 'edited' : 'control'} page (${path})`);
  for (const [k, v] of Object.entries(result)) console.log(`${k}: ${JSON.stringify(v)}`);
  console.log(`onerror called: ${log.some((l) => l.includes('boundary onerror:'))}`);
  console.log('console:');
  for (const l of log) console.log(`  ${l}`);
  await page.close();
}
await browser.close();
server.kill();
