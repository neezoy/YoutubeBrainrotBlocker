// ============================================================
//  Youtube Brainrot Blocker — content script
//  Runs at document_start so redirects fire before any render.
// ============================================================

const DEFAULTS = {
  blockShorts: true,
  hideRecommended: true,
  redirectHome: true
};

const CACHE_KEY = 'ytbbb_settings';

let settings = { ...DEFAULTS };
let styleEl = null;

// ── Helpers ──────────────────────────────────────────────────

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
  catch { return {}; }
}

function writeCache(s) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); }
  catch {}
}

// ── Redirect logic ───────────────────────────────────────────

function redirectPath(path) {
  const s = settings;

  if (s.redirectHome && (path === '/' || path === '')) {
    return '/feed/subscriptions';
  }

  if (s.blockShorts && path.startsWith('/shorts/')) {
    const videoId = path.split('/shorts/')[1]?.split(/[/?#]/)[0];
    if (videoId) return `/watch?v=${videoId}`;
  }

  return null;
}

function checkRedirects() {
  const dest = redirectPath(window.location.pathname);
  if (dest) {
    window.location.replace(dest);
    return true;
  }
  return false;
}

// ── CSS injection ─────────────────────────────────────────────

function buildCSS() {
  const blocks = [];

  if (settings.blockShorts) {
    blocks.push(`
      /* ── Shorts: shelves ── */
      ytd-reel-shelf-renderer,
      ytd-rich-shelf-renderer[is-shorts],

      /* ── Shorts: individual items ── */
      ytd-reel-item-renderer,
      ytd-rich-item-renderer:has(ytd-reel-item-renderer),

      /* ── Shorts: sidebar nav button (expanded & mini) ── */
      ytd-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-guide-entry-renderer:has(a[title="Shorts"]),
      ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),

      /* ── Shorts: search filter chip ── */
      yt-chip-cloud-chip-renderer:has(a[href*="/shorts"]),

      /* ── Shorts: channel tab ── */
      tp-yt-paper-tab:has(a[href*="/shorts"]),
      yt-tab-shape:has(a[href*="/shorts"])
    `);
  }

  if (settings.redirectHome) {
    blocks.push(`
      /* ── Home page content (flash prevention) ── */
      ytd-browse[page-subtype="home"],

      /* ── Home button in sidebar nav (expanded & mini) ── */
      ytd-guide-entry-renderer:has(a[href="/"]),
      ytd-guide-entry-renderer:has(a[title="Home"]),
      ytd-mini-guide-entry-renderer:has(a[href="/"]),
      ytd-mini-guide-entry-renderer:has(a[title="Home"])
    `);
  }

  if (settings.hideRecommended) {
    blocks.push(`
      /* ── Watch page: Up Next sidebar ── */
      ytd-watch-next-secondary-results-renderer,
      ytd-compact-autoplay-renderer
    `);
  }

  return blocks
    .map(b => `${b.trim()} { display: none !important; }`)
    .join('\n\n');
}

function applyStyles() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ytbbb-styles';
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = buildCSS();
}

// ── Immediate boot (synchronous, before any render) ──────────

// Use cached settings for instant redirect — no async wait.
settings = { ...DEFAULTS, ...readCache() };
applyStyles();
checkRedirects();

// ── Async init: load authoritative settings from storage ─────

browser.storage.sync.get(DEFAULTS).then((stored) => {
  settings = { ...DEFAULTS, ...stored };
  writeCache(settings);
  applyStyles();
  checkRedirects();
});

// ── React to popup toggle changes ────────────────────────────

browser.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) settings[key] = newValue;
  }
  writeCache(settings);
  applyStyles();
  checkRedirects();
});

// ── Intercept logo / Home clicks (prevents full-page reload) ──
// The YouTube logo is a real <a href="/"> anchor — clicking it
// triggers a full browser navigation, bypassing pushState.
// Capture-phase listener intercepts it before the browser acts.

document.addEventListener('click', (e) => {
  if (!settings.redirectHome) return;

  const anchor = e.target.closest('a');
  if (!anchor) return;

  // Match any anchor whose resolved href points to youtube.com root
  try {
    const url = new URL(anchor.href, location.href);
    if (url.hostname.endsWith('youtube.com') && (url.pathname === '/' || url.pathname === '')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.href = '/feed/subscriptions';
    }
  } catch {}
}, true); // true = capture phase, runs before YouTube's own handlers

// ── Re-attach styles after YouTube SPA page transitions ──────

let lastUrl = location.href;

new MutationObserver(() => {
  const cur = location.href;
  if (cur === lastUrl) return;
  lastUrl = cur;

  // Re-insert style element if YouTube cleared <head>
  if (!document.getElementById('ytbbb-styles')) {
    styleEl = null;
    applyStyles();
  }

  checkRedirects();
}).observe(document.documentElement, { childList: true, subtree: true });
