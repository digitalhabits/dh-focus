// Optional redd-block bridge. The extension must keep working on its own
// if this fails — all Digital Habits: Focus features (content scripts, hiding UI)
// are independent of this code path. The only side effect of a successful
// connection is that website rules arrive from redd-block and matching URLs
// get redirected to blocked.html.
//
// Native-host payload contract (current):
//   { "blocklist": ["twitter.com", "x.com", ...],
//     "blocks": [
//       { "blocklistId": "...", "name": "No Twitter", "emoji": "🐦",
//         "color": "#A0CED9", "mode": "blocklist" | "allowlist",
//         "domains": ["twitter.com","x.com"],
//         "source": "schedule", "endsAt": 1745123400000,
//         "startedAt": 1745087400000 }, ...
//     ] }
// `blocks` is optional — older native-host builds that omit it still work,
// the blocked page just falls back to a generic card without metadata.

const NATIVE_HOST = "com.ulriklyngs.mindshield";
let blocklist = [];
let activeBlocks = [];
let port = null;
let backoffMs = 5_000;
const BACKOFF_MAX = 5 * 60_000;
const REDIRECT_DEBOUNCE_MS = 30_000;
const recentRedirects = new Map();

// URL prefix of our blocked page so a sweep can skip tabs that are
// already on it (avoiding a redirect loop that Chrome would flag as
// "too many redirects"). `chrome.runtime.getURL` resolves at runtime
// because the extension ID is only known once the service worker is up.
const BLOCKED_PAGE_PREFIX = chrome.runtime.getURL("blocked.html");
const IS_SAFARI = BLOCKED_PAGE_PREFIX.startsWith("safari-web-extension://");
const IS_IOS = /\b(iPhone|iPad|iPod)\b/i.test(navigator.userAgent || "")
  || (/\bMacintosh\b/i.test(navigator.userAgent || "") && /\bMobile\//i.test(navigator.userAgent || ""));
const USE_REDD_BLOCK_NATIVE = !IS_IOS;

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

const PROTECTED_HOSTS = [
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "broadcasthost",
  "local",
  "reddfocus.org",
  "www.reddfocus.org",
  "digitalhabits.org",
  "www.digitalhabits.org",
  "ulyngs.github.io",
];

function isProtectedHost(host) {
  const lower = String(host || "").toLowerCase();
  return PROTECTED_HOSTS.some(p => lower === p || lower.endsWith("." + p));
}

function blockModeIsAllowlist(mode) {
  return String(mode || "").toLowerCase() === "allowlist";
}

function blockHasDomains(block) {
  return !!(block && Array.isArray(block.domains) && block.domains.length > 0);
}

function activeWebsiteBlocks() {
  return activeBlocks.filter(blockHasDomains);
}

function allowlistWebsiteBlocks() {
  return activeWebsiteBlocks().filter(b => blockModeIsAllowlist(b.mode));
}

function websiteRulesSignature(domains, blocks) {
  const normalizedDomains = Array.isArray(domains)
    ? domains.map(d => String(d).toLowerCase())
    : [];
  const normalizedBlocks = Array.isArray(blocks)
    ? blocks
        .filter(blockHasDomains)
        .map(b => ({
          id: b.blocklistId || "",
          mode: blockModeIsAllowlist(b.mode) ? "allowlist" : "blocklist",
          domains: b.domains.map(d => String(d).toLowerCase()),
        }))
    : [];
  return JSON.stringify({
    blocklist: normalizedDomains,
    blocks: normalizedBlocks,
  });
}

function webEnforcementActive() {
  if (activeWebsiteBlocks().length > 0) return true;
  return blocklist.length > 0;
}

function isBlocked(url) {
  if (!url || !webEnforcementActive()) return false;
  const host = hostnameOf(url);
  if (!host) return false;
  if (isProtectedHost(host)) return false;

  const websiteBlocks = activeWebsiteBlocks();
  if (websiteBlocks.length === 0) {
    return blocklist.some(d => domainMatches(host, d));
  }

  for (const block of websiteBlocks) {
    if (blockModeIsAllowlist(block.mode)) continue;
    if (block.domains.some(d => domainMatches(host, d))) {
      return true;
    }
  }

  const allowlistBlocks = websiteBlocks.filter(b => blockModeIsAllowlist(b.mode));
  if (allowlistBlocks.length > 0) {
    const allowed = allowlistBlocks.some(block =>
      block.domains.some(d => domainMatches(host, d))
    );
    if (!allowed) {
      return true;
    }
  }

  return false;
}

function isHttpUrl(url) {
  return /^https?:/i.test(url || "");
}

function isBlockedPageUrl(url) {
  if (typeof url !== "string") return false;
  if (url.startsWith(BLOCKED_PAGE_PREFIX)) return true;

  // After a Safari/WebExtension update, restored tabs can briefly point at a
  // blocked page URL minted by the previous extension instance. The runtime
  // prefix can differ, so recognize our page by extension scheme + path too.
  try {
    const parsed = new URL(url);
    const isExtensionPage = [
      "chrome-extension:",
      "moz-extension:",
      "safari-web-extension:",
    ].includes(parsed.protocol);
    return isExtensionPage && parsed.pathname.replace(/^\/+/, "") === "blocked.html";
  } catch {
    return false;
  }
}

function originalUrlFromBlockedPage(url) {
  if (!isBlockedPageUrl(url)) return null;
  try {
    return new URL(url).searchParams.get("u");
  } catch {
    return null;
  }
}

function shouldRedirectTab(tabId, url) {
  if (isBlockedPageUrl(url)) {
    return false;
  }
  if (!isHttpUrl(url)) {
    return false;
  }
  if (!isBlocked(url)) {
    return false;
  }

  const now = Date.now();
  const prior = recentRedirects.get(tabId);
  if (prior && prior.url === url && now - prior.at < REDIRECT_DEBOUNCE_MS) {
    return false;
  }
  recentRedirects.set(tabId, { url, at: now });
  return true;
}

function updateTabToBlocked(tabId, url) {
  chrome.tabs.update(tabId, { url: buildBlockedUrl(url) }, () => {
    if (chrome.runtime.lastError) {
      const prior = recentRedirects.get(tabId);
      if (prior && prior.url === url) {
        recentRedirects.delete(tabId);
      }
      console.info("[redd-block] redirect failed:", chrome.runtime.lastError.message);
    }
  });
}

// Pick the most salient active block for a given URL. When a domain
// sits in multiple active rules, mirror the native-host / Automation rulebook:
// blocklist hits win, otherwise attribute allowlist-caused redirects to the
// earliest-started active allowlist that excludes the host.
function blockInfoForUrl(url) {
  if (!url || activeBlocks.length === 0) return null;
  if (!isBlocked(url)) return null;
  const host = hostnameOf(url);
  if (!host) return null;
  for (const block of activeWebsiteBlocks()) {
    if (blockModeIsAllowlist(block.mode)) continue;
    if (block.domains.some(d => domainMatches(host, d))) {
      return block;
    }
  }
  return allowlistWebsiteBlocks()
    .filter(block => !block.domains.some(d => domainMatches(host, d)))
    .sort((a, b) => {
      const aStarted = Number.isFinite(a.startedAt) ? a.startedAt : Number.MAX_SAFE_INTEGER;
      const bStarted = Number.isFinite(b.startedAt) ? b.startedAt : Number.MAX_SAFE_INTEGER;
      if (aStarted !== bStarted) return aStarted - bStarted;
      const aEnds = Number.isFinite(a.endsAt) ? a.endsAt : Number.MAX_SAFE_INTEGER;
      const bEnds = Number.isFinite(b.endsAt) ? b.endsAt : Number.MAX_SAFE_INTEGER;
      return aEnds - bEnds;
    })[0] || null;
}

// Build the blocked-page URL with as much context as the native host
// gave us. blocked.html is defensive about missing fields.
function buildBlockedUrl(originalUrl) {
  originalUrl = originalUrlFromBlockedPage(originalUrl) || originalUrl;
  const params = new URLSearchParams();
  params.set("u", originalUrl);
  const info = blockInfoForUrl(originalUrl);
  if (info) {
    if (info.blocklistId) params.set("id", info.blocklistId);
    if (info.mode) params.set("mode", info.mode);
    if (info.name) params.set("name", info.name);
    if (info.emoji) params.set("emoji", info.emoji);
    if (info.color) params.set("color", info.color);
    if (info.source) params.set("source", info.source);
    if (Number.isFinite(info.endsAt)) params.set("endsAt", String(info.endsAt));
    if (Number.isFinite(info.startedAt)) params.set("startedAt", String(info.startedAt));
  }
  return chrome.runtime.getURL("blocked.html") + "?" + params.toString();
}

function applyNativePayload(msg) {
  const beforeSignature = websiteRulesSignature(blocklist, activeBlocks);
  if (msg && Array.isArray(msg.blocklist)) {
    const next = msg.blocklist.map(d => String(d).toLowerCase());
    blocklist = next;
    backoffMs = 5_000;
  }
  if (msg && Array.isArray(msg.blocks)) {
    activeBlocks = msg.blocks.map(b => ({
      ...b,
      mode: blockModeIsAllowlist(b.mode) ? "allowlist" : "blocklist",
      domains: Array.isArray(b.domains)
        ? b.domains.map(d => String(d).toLowerCase())
        : [],
    }));
  } else {
    activeBlocks = [];
  }
  const afterSignature = websiteRulesSignature(blocklist, activeBlocks);
  if (beforeSignature !== afterSignature) {
    sweepAllTabsForBlocks();
    restoreUnblockedTabs();
  }
}

// Sweep every open tab and redirect any whose current URL matches the
// current website rules. `chrome.tabs.onUpdated` only fires on *navigations*, so a
// tab that was loaded to twitter.com *before* the native-host rules arrived
// (e.g. the user had it open, then re-enabled the extension) would
// otherwise stay visible until a manual refresh. Invoked every time the
// effective website rule set actually changes — not on every native-host
// frame, because `blocks` carries live timing metadata that can change
// without altering which sites should be blocked.
function sweepAllTabsForBlocks() {
  if (!webEnforcementActive()) return;
  if (!chrome.tabs || typeof chrome.tabs.query !== "function") return;
  chrome.tabs.query({}, tabs => {
    if (chrome.runtime.lastError) {
      console.info("[redd-block] sweep query failed:", chrome.runtime.lastError.message);
      return;
    }
    for (const tab of tabs) {
      const url = tab && tab.url;
      if (!url) continue;
      // Skip non-http(s) schemes (chrome://, about:, file://, etc.) —
      // our blocklist never contains those and `chrome.tabs.update` on
      // some of them is a permissions error anyway.
      if (!isHttpUrl(url)) continue;
      // Don't loop on already-redirected tabs.
      if (isBlockedPageUrl(url)) continue;
      if (shouldRedirectTab(tab.id, url)) {
        updateTabToBlocked(tab.id, url);
      }
    }
  });
}

// When a block is paused/stopped, tabs already sitting on blocked.html
// should return to their original URL. Without this, a stale blocked page
// can remain visible even though the current native payload no longer
// contains that domain.
function restoreUnblockedTabs() {
  if (!chrome.tabs || typeof chrome.tabs.query !== "function") return;
  chrome.tabs.query({}, tabs => {
    if (chrome.runtime.lastError) {
      console.info("[redd-block] restore query failed:", chrome.runtime.lastError.message);
      return;
    }
    for (const tab of tabs) {
      const url = tab && tab.url;
      const originalUrl = originalUrlFromBlockedPage(url);
      if (!originalUrl || !isHttpUrl(originalUrl)) continue;
      if (!isBlocked(originalUrl)) {
        chrome.tabs.update(tab.id, { url: originalUrl });
      }
    }
  });
}

async function refreshSafariBlocklist() {
  if (!IS_SAFARI || !USE_REDD_BLOCK_NATIVE) return;
  if (!chrome.runtime || typeof chrome.runtime.sendNativeMessage !== "function") return;
  // Piggyback the extension's incognito-access state on the refresh ping
  // so Digital Habits: Blocker can know it without Full Disk Access. SafariServices'
  // `getStateOfSafariExtension` only exposes `isEnabled`; the private-
  // browsing toggle lives inside Safari's sandboxed Extensions.plist
  // which is FDA-gated. Reading the value here (where the extension owns
  // it) and writing it into the App Group container in Swift sidesteps
  // that entirely.
  let privateBrowsing = null;
  try {
    if (chrome.extension && typeof chrome.extension.isAllowedIncognitoAccess === "function") {
      privateBrowsing = await new Promise(resolve => {
        try {
          chrome.extension.isAllowedIncognitoAccess(value => resolve(typeof value === "boolean" ? value : null));
        } catch (_) {
          resolve(null);
        }
      });
    }
  } catch (_) { /* leave as null */ }
  const payload = {
    type: "reddBlockRefresh",
    version: chrome.runtime.getManifest && chrome.runtime.getManifest().version,
    state: { privateBrowsing },
  };
  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      payload,
      response => {
        if (chrome.runtime.lastError) {
          console.info("[redd-block] safari native ping failed:", chrome.runtime.lastError.message);
          return;
        }
        applyNativePayload(response);
      }
    );
  } catch (e) {
    console.info("[redd-block] safari native ping threw:", e && e.message);
  }
}

function connectNative() {
  if (!USE_REDD_BLOCK_NATIVE) return;
  // Graceful no-op if native messaging isn't available (e.g., older
  // Safari builds, stripped-down platforms).
  if (!chrome.runtime || typeof chrome.runtime.connectNative !== "function") {
    console.info("[redd-block] native messaging unavailable; standalone mode");
    return;
  }
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
    port.onMessage.addListener(msg => {
      applyNativePayload(msg);
    });
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.info("[redd-block] native disconnected:", err && err.message);
      port = null;
      // redd-block not installed is the common case — back off exponentially.
      setTimeout(connectNative, backoffMs);
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
    });
  } catch (e) {
    console.info("[redd-block] native connect failed:", e && e.message);
    setTimeout(connectNative, backoffMs);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
  }
}

// Anonymous usage ping, so we know roughly how many people use Focus.
// At most once per UTC day, when the user is on a site where one of their own
// Focus rules is on (content.js or the popup tells us), we send
// { product, platform, key }. The key is a random id that is replaced at the
// start of each calendar month, so no two months can be linked. Nothing about
// sites, settings, or the user is sent. Users can turn it off in Settings.
// Firefox sends no ping; it is counted from Mozilla's own add-on statistics.
const PING_URL = "https://plan.digitalhabits.org/api/ping";
const PING_STATE_KEY = "usagePing";
const PING_ENABLED_KEY = "usagePingEnabled";
const PING_RETRY_MS = 60 * 60_000;
const EULA_KEY = "reddfocus_eula";
const EULA_REVISION = 1; // CURRENT_EULA_REVISION in popup.js
const IS_FIREFOX = BLOCKED_PAGE_PREFIX.startsWith("moz-extension://");
let pingSentDay = null;
let pingInFlight = false;
let pingLastAttempt = 0;

function pingPlatform() {
  if (IS_SAFARI) return IS_IOS ? "safari-ios" : "safari-mac";
  if (/\bEdg\//.test(navigator.userAgent || "")) return "edge";
  return "chrome";
}

function randomKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function pingAllowed() {
  if (IS_FIREFOX) return false;
  const eula = (await chrome.storage.local.get(EULA_KEY))[EULA_KEY];
  if (!eula || eula.acceptedRevision !== EULA_REVISION) return false;
  // Unpacked developer copies are not counted. getSelf needs no permission.
  if (chrome.management && chrome.management.getSelf) {
    const self = await chrome.management.getSelf();
    if (self && self.installType === "development") return false;
  }
  const stored = await chrome.storage.sync.get(PING_ENABLED_KEY);
  return stored[PING_ENABLED_KEY] !== false;
}

async function maybeSendUsagePing() {
  const today = new Date().toISOString().slice(0, 10);
  if (pingSentDay === today || pingInFlight) return;
  if (Date.now() - pingLastAttempt < PING_RETRY_MS) return;
  pingInFlight = true;
  try {
    const state = (await chrome.storage.local.get(PING_STATE_KEY))[PING_STATE_KEY] || {};
    if (state.lastDay === today) {
      pingSentDay = today;
      return;
    }
    if (!(await pingAllowed())) return;
    const month = today.slice(0, 7);
    const key = state.month === month && state.key ? state.key : randomKey();
    // Keep the key before sending; if it cannot be saved, send nothing.
    await chrome.storage.local.set({ [PING_STATE_KEY]: { month, key } });
    pingLastAttempt = Date.now();
    const res = await fetch(PING_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ product: "focus", platform: pingPlatform(), key }),
      credentials: "omit",
    });
    if (!res.ok) return;
    await chrome.storage.local.set({ [PING_STATE_KEY]: { month, key, lastDay: today } });
    pingSentDay = today;
  } catch {
    // Offline or blocked: try again later.
  } finally {
    pingInFlight = false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  refreshSafariBlocklist();
  // Cheap early-out when standalone (no active website rules).
  if (!webEnforcementActive()) {
    return;
  }
  const url = changeInfo.url || (changeInfo.status === "loading" ? tab.url : null);
  if (isBlockedPageUrl(url)) {
    return;
  }
  if (shouldRedirectTab(tabId, url)) {
    updateTabToBlocked(tabId, url);
  }
});

connectNative();
refreshSafariBlocklist();
// Safari's native handler is request/response only, so keep polling
// for Digital Habits: Blocker payload changes even when the user sits on a single
// tab. Compliance is verified by Digital Habits: Blocker from Safari's plist, not
// by this refresh.
if (IS_SAFARI && USE_REDD_BLOCK_NATIVE) {
  setInterval(refreshSafariBlocklist, 15 * 1000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "getBlocklist") {
    sendResponse({ blocklist, blocks: activeBlocks });
    return true;
  }
  // A page with one of the user's Focus rules on; Blocker's own blocks don't count.
  if (message && message.type === "usagePing") {
    const url = sender.tab ? sender.tab.url : message.url;
    if (!isBlockedPageUrl(url) && !isBlocked(url)) maybeSendUsagePing();
  }
});
