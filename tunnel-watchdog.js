// Watchdog: monitors the Cloudflare tunnel every 60 seconds.
// If the URL stops responding, kills cloudflared and starts a new one.
// Writes the current URL to current-url.txt so other tools can read it.

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const LOG_PATH      = 'C:/Users/avraham/meatfish-app/tunnel.log';
const URL_FILE      = 'C:/Users/avraham/meatfish-app/current-url.txt';
const SHORTCUT      = 'D:/user/Desktop/בשר ודגים - הוצאות והכנסות.url';
const CLOUDFLARED   = 'C:/Users/avraham/meatfish-app/bin/cloudflared.exe';
const CHECK_EVERY_MS = 60_000;

function log(msg) {
  const t = new Date().toISOString();
  console.log(`[${t}] ${msg}`);
}

function getCurrentUrl() {
  if (!existsSync(LOG_PATH)) return null;
  const content = readFileSync(LOG_PATH, 'utf8');
  // Find LAST trycloudflare URL in the log
  const matches = [...content.matchAll(/https:\/\/([a-z0-9\-]+\.trycloudflare\.com)/g)];
  if (!matches.length) return null;
  return `https://${matches[matches.length - 1][1]}`;
}

async function isUrlAlive(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.status >= 200 && r.status < 500;
  } catch { return false; }
}

function killCloudflared() {
  try { execSync('taskkill /F /IM cloudflared.exe 2>nul', { stdio: 'ignore' }); }
  catch {}
}

function startCloudflared() {
  // remove old log so we can detect new URL
  try { require('fs').unlinkSync(LOG_PATH); } catch {}
  const child = spawn(CLOUDFLARED, ['tunnel', '--url', 'http://localhost:3031', '--logfile', LOG_PATH], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function writeShortcut(url) {
  try {
    const content = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
    writeFileSync(SHORTCUT, content, 'ascii');
    writeFileSync(URL_FILE, url, 'utf8');
  } catch (e) {
    log(`shortcut update failed: ${e.message}`);
  }
}

async function ensureHealthy() {
  const url = getCurrentUrl();
  if (!url) {
    log('no URL in log — starting tunnel');
    killCloudflared();
    await new Promise(r => setTimeout(r, 3000));
    startCloudflared();
    await new Promise(r => setTimeout(r, 12000));
    const newUrl = getCurrentUrl();
    if (newUrl) {
      log(`new URL: ${newUrl}`);
      writeShortcut(newUrl);
    }
    return;
  }
  const alive = await isUrlAlive(url);
  if (alive) {
    log(`✓ ${url} OK`);
    if (!existsSync(URL_FILE) || readFileSync(URL_FILE, 'utf8').trim() !== url) {
      writeShortcut(url);
    }
  } else {
    log(`✗ ${url} DOWN — restarting`);
    killCloudflared();
    await new Promise(r => setTimeout(r, 3000));
    startCloudflared();
    await new Promise(r => setTimeout(r, 12000));
    const newUrl = getCurrentUrl();
    if (newUrl) {
      log(`new URL: ${newUrl}`);
      writeShortcut(newUrl);
    } else {
      log('failed to get new URL after restart');
    }
  }
}

log('watchdog started');
ensureHealthy();
setInterval(ensureHealthy, CHECK_EVERY_MS);
