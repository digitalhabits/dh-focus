/**
 * Make the pictures for the Focus store listings.
 *
 *   node scripts/focus-store-assets.mjs --capture   # takes the website pictures again (needs the internet)
 *   node scripts/focus-store-assets.mjs             # writes store-listing/screenshots/
 *   node scripts/focus-store-assets.mjs 01          # one slide only
 *
 * Each slide is a small HTML page: a heading, some words, and pictures of the
 * extension. The popup is drawn here, from the real popup.html, with a stand-in
 * for the browser's extension API: so a slide is never older than the popup.
 *
 * The websites behind the popup are real pages with the real extension loaded,
 * taken by `--capture` and kept in store-listing/source-pictures/, so a slide
 * does not change when YouTube does. Take them again when the extension
 * changes what it hides.
 *
 * Sizes:
 *   chrome  1280 x 800   Chrome Web Store, Edge Add-ons and Firefox Add-ons
 *   mac     2880 x 1800  Mac App Store
 *   ipad    2752 x 2064  App Store, iPad 13" (landscape)
 *   iphone  1320 x 2868  App Store, iPhone 6.9"
 * The first three are one 1440 x 900 drawing, scaled. The iPhone has its own.
 *
 * Playwright and lucide come from DH Planner (../digital-habits-planner), as
 * this repository has no node_modules. Set DH_PLANNER to use another copy.
 *
 * Fonts: Georgia and Futura, which a Mac has. Run this on a Mac.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "Shared (Extension)/Resources");
const OUT = path.join(ROOT, "store-listing/screenshots");
const SRC = path.join(ROOT, "store-listing/source-pictures");
const PARTNERS = path.join(ROOT, "../digital-habits-next/public/images/site/partners");
const require = createRequire(process.env.DH_PLANNER ?? path.join(ROOT, "../digital-habits-planner/package.json"));
const { chromium } = require("playwright");

const TARGETS = {
  chrome: { width: 1440, height: 900, scale: 1280 / 1440 }, // 1280 x 800
  mac: { width: 1440, height: 900, scale: 2 }, // 2880 x 1800
  ipad: { width: 1440, height: 1080, scale: 2752 / 1440 }, // 2752 x 2064
  iphone: { width: 440, height: 956, scale: 3, phone: true }, // 1320 x 2868
};

const INK = "#2f3a4a";
const NAVY = "#1e2837";
const PAPER = "#edebe7";
const GREEN = "#3f9c8d";
const MINT = "#8fd3c5"; // the labels on the dark slide

const VERSION = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8")).version;
const EULA = { reddfocus_eula: { acceptedRevision: 1 } };

/** Playwright's headless shell, or the newest one in its cache. */
function shellPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : [];
  for (const dir of dirs.filter((d) => d.startsWith("chromium_headless_shell-"))) {
    const exe = path.join(cache, dir, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

/** The full Chromium of Playwright: the headless shell cannot load an extension. */
function chromiumPath() {
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : [];
  for (const dir of dirs.filter((d) => /^chromium-\d+$/.test(d))) {
    const exe = path.join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const fileUri = (file) => `data:image/${file.endsWith(".svg") ? "svg+xml" : "png"};base64,${fs.readFileSync(file).toString("base64")}`;
const pngUri = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
const source = (name) => fileUri(path.join(SRC, name));

/** A Lucide icon as SVG markup. */
async function lucide(name, size) {
  const file = path.join(path.dirname(require.resolve("lucide-react")), `../esm/icons/${name}.mjs`);
  const { __iconNode } = await import(file);
  const shapes = __iconNode
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}

// ---------------------------------------------------------------------------
// Website pictures (--capture)
// ---------------------------------------------------------------------------

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const HIDE_YOUTUBE = { youtubeRecVidsStatus: true, youtubeShortsStatus: true };
const SEARCH = "https://www.youtube.com/results?search_query=coral+reef+4k";
const MOBILE_SEARCH = "https://m.youtube.com/results?search_query=coral+reef+4k";

/**
 * The pictures of websites. Each is the real site, signed out, with the real
 * extension and these settings. `wait` is short for the Delay picture, so the
 * countdown still shows.
 */
const CAPTURES = [
  { name: "youtube-home-hidden.png", url: "https://www.youtube.com/", store: HIDE_YOUTUBE },
  { name: "youtube-home-delay.png", url: "https://www.youtube.com/", store: { ...HIDE_YOUTUBE, youtubeAccessDelayStatus: true, youtubeAccessDelaySeconds: 10 }, wait: 2500 },
  { name: "youtube-search-colour.png", url: SEARCH, store: {} },
  { name: "youtube-search-greyscale.png", url: SEARCH, store: { youtubeGrayscaleStatus: true } },
  { name: "youtube-mobile-home-hidden.png", url: "https://m.youtube.com/", store: HIDE_YOUTUBE, mobile: true },
  { name: "youtube-mobile-home-delay.png", url: "https://m.youtube.com/", store: { ...HIDE_YOUTUBE, youtubeAccessDelayStatus: true, youtubeAccessDelaySeconds: 10 }, mobile: true, wait: 2500 },
  { name: "youtube-mobile-search-colour.png", url: MOBILE_SEARCH, store: {}, mobile: true },
  { name: "youtube-mobile-search-greyscale.png", url: MOBILE_SEARCH, store: { youtubeGrayscaleStatus: true }, mobile: true },
];

async function capture() {
  fs.mkdirSync(SRC, { recursive: true });
  for (const shot of CAPTURES) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "focus-store-"));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: chromiumPath(),
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--headless=new"],
      viewport: shot.mobile ? { width: 430, height: 932 } : { width: 1280, height: 800 },
      deviceScaleFactor: shot.mobile ? 3 : 2,
      locale: "en-GB",
      ...(shot.mobile ? { userAgent: IPHONE_UA, isMobile: true, hasTouch: true } : {}),
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async ({ eula, store }) => {
      await chrome.storage.local.set(eula);
      await chrome.storage.sync.set(store);
    }, { eula: EULA, store: shot.store });
    // Consent was given, so no cookie banner covers the page.
    await context.addCookies(
      ["SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg", "CONSENT=YES+"].map((c) => {
        const [name, value] = c.split("=");
        return { name, value, domain: ".youtube.com", path: "/" };
      }),
    );
    const page = await context.newPage();
    await page.goto(shot.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(shot.wait ?? 7000);
    await page.screenshot({ path: path.join(SRC, shot.name) });
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
    console.log(path.relative(ROOT, path.join(SRC, shot.name)));
  }
}

// ---------------------------------------------------------------------------
// The popup
// ---------------------------------------------------------------------------

/** The browser API, as much of it as popup.js uses, over a store in memory. */
function fakeExtensionApi({ tabUrl, store, version }) {
  const sync = { ...store };
  const read = (keys) => {
    if (keys == null) return { ...sync };
    if (typeof keys === "string") keys = [keys];
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in sync).map((k) => [k, sync[k]]));
    return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in sync ? sync[k] : d]));
  };
  const later = (cb, value) => cb && setTimeout(() => cb(value));
  const area = {
    get: (keys, cb) => (later(cb, read(keys)), Promise.resolve(read(keys))),
    set: (values, cb) => (Object.assign(sync, values), later(cb), Promise.resolve()),
    remove: (keys, cb) => (later(cb), Promise.resolve()),
  };
  window.chrome = {
    runtime: {
      getManifest: () => ({ version }),
      getURL: (p) => p,
      lastError: undefined,
      onMessage: { addListener() {} },
      sendMessage: (message, cb) => later(cb, undefined),
    },
    storage: { sync: area, local: area, onChanged: { addListener() {} } },
    tabs: {
      query: (query, cb) => later(cb, [{ id: 1, url: tabUrl }]),
      create() {},
      sendMessage: (id, message, cb) => later(cb, message.type === "getSessionOverrides" ? { overrides: {} } : undefined),
    },
  };
  window.browser = window.chrome;
}

/**
 * The popup for a page, with these settings. Answers with the picture and
 * with the places of `spots` (text that the labels point at), in CSS pixels.
 */
async function popupPicture(browser, { url, store = {}, height = 600, prepare, spots = {} }) {
  const context = await browser.newContext({ viewport: { width: 330, height }, deviceScaleFactor: 3 });
  await context.addInitScript(fakeExtensionApi, { tabUrl: url, store: { ...EULA, ...store }, version: VERSION });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn("popup:", e.message));
  await page.goto("file://" + path.join(EXT, "popup.html"));
  await page.waitForTimeout(1200);
  if (prepare) await prepare(page);
  const places = await page.evaluate((wanted) => {
    const out = {};
    for (const [name, text] of Object.entries(wanted)) {
      const el = [...document.querySelectorAll("body *")].find(
        (e) => e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(text)),
      );
      const r = el?.getBoundingClientRect();
      out[name] = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }
    return out;
  }, spots);
  for (const [name, spot] of Object.entries(places)) if (!spot) console.warn(`popup: no place for "${name}"`);
  const picture = await page.screenshot();
  await context.close();
  return { picture, spots: places, size: { width: 330, height } };
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

const SHADOW = "box-shadow: 0 0 0 1.5px rgba(47,58,74,0.22), 0 18px 44px rgba(20,30,45,0.22);";
const ICON = fileUri(path.join(EXT, "images/icon-128.png"));

/**
 * A browser window, drawn plainly so that it is no one browser: lights, an
 * address, and the Focus button. `popup` hangs from the button.
 */
function browserWindow({ x, y, width, host, site, popup }) {
  const bar = 42;
  const viewH = width / 1.6; // the website pictures are 1280 x 800
  const pop = popup
    ? `<div style="position:absolute; right:${popup.right ?? 14}px; top:${bar - 4}px; width:${popup.width}px; height:${popup.width * popup.ratio}px;
         border-radius:10px; overflow:hidden; ${SHADOW}"><img src="${pngUri(popup.picture)}" style="width:100%; display:block"></div>`
    : "";
  return {
    viewH,
    bar,
    html: `<div style="position:absolute; left:${x}px; top:${y}px; width:${width}px; height:${bar + viewH}px; border-radius:12px; overflow:hidden; background:#fff; ${SHADOW}">
      <div style="height:${bar}px; background:#eceef1; display:flex; align-items:center; gap:14px; padding:0 14px; border-bottom:1px solid #d9dce1">
        <span style="display:flex; gap:7px">${["#ee6a5f", "#f5bd4f", "#61c454"].map((c) => `<i style="width:11px;height:11px;border-radius:50%;background:${c};display:block"></i>`).join("")}</span>
        <span style="flex:1; height:26px; border-radius:13px; background:#fff; color:#4a5565; font:14px/26px -apple-system, 'Helvetica Neue', sans-serif; padding:0 14px">${host}</span>
        <span style="width:30px; height:30px; border-radius:8px; display:grid; place-items:center; background:${popup ? "#d7dbe1" : "transparent"}"><img src="${ICON}" style="width:20px"></span>
      </div>
      <img src="${site}" style="width:100%; display:block">
    </div>${pop ? `<div style="position:absolute; left:${x}px; top:${y}px; width:${width}px; height:${bar + viewH}px">${pop}</div>` : ""}`,
  };
}

/**
 * A phone, with the site and the Focus sheet over its lower part, as Safari
 * on iPhone shows an extension. `sheetTop` is where the sheet starts (0..1).
 */
function phone({ x, y, width, site, popup, sheetTop = 0.42 }) {
  const bezel = 11;
  const screenW = width - bezel * 2;
  const screenH = screenW * (932 / 430);
  const sheet = popup
    ? `<div style="position:absolute; left:0; right:0; top:${screenH * sheetTop}px; bottom:0; background:#f8f7f4; border-radius:16px 16px 0 0; overflow:hidden; box-shadow:0 -6px 24px rgba(20,30,45,0.25)">
         <div style="width:38px; height:5px; border-radius:3px; background:#c9c9cc; margin:7px auto 0"></div>
         <div style="display:flex; align-items:center; justify-content:center; gap:7px; padding:8px 0 6px; font:600 13px -apple-system, 'Helvetica Neue', sans-serif; color:#222">
           <img src="${ICON}" style="width:18px">Digital Habits: Focus</div>
         <img src="${pngUri(popup.picture)}" style="width:100%; display:block">
       </div>`
    : "";
  return `<div style="position:absolute; left:${x}px; top:${y}px; width:${width}px; height:${screenH + bezel * 2}px; border-radius:52px; background:#16191f; padding:${bezel}px; box-shadow:0 24px 50px rgba(20,30,45,0.35)">
    <div style="position:relative; width:${screenW}px; height:${screenH}px; border-radius:42px; overflow:hidden; background:#fff">
      <img src="${site}" style="width:100%; display:block">
      <div style="position:absolute; left:50%; top:10px; width:96px; height:28px; margin-left:-48px; border-radius:16px; background:#000"></div>
      ${sheet}
    </div>
  </div>`;
}

/** Green arrows: a curve from each label to its place, with a head. */
function drawArrows(arrows, colour) {
  const paths = arrows
    .map(({ from, to, bend }) => {
      const mx = (from.x + to.x) / 2 + (bend.x ?? 0);
      const my = (from.y + to.y) / 2 + (bend.y ?? 0);
      const angle = Math.atan2(to.y - my, to.x - mx);
      const head = (turn) => `${to.x - 16 * Math.cos(angle + turn)},${to.y - 16 * Math.sin(angle + turn)}`;
      return `<path d="M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}"/><path d="M${head(0.45)} L${to.x},${to.y} L${head(-0.45)}"/>`;
    })
    .join("");
  return `<svg style="position:absolute; inset:0; width:100%; height:100%; overflow:visible; fill:none; stroke:${colour}; stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round">${paths}</svg>`;
}

/**
 * A slide page. The drawing is made for `stage` (1440 x 900, or 440 x 956 for
 * the phone) and sits in the middle of the target: the iPad, at 4:3, has more
 * height, which the background fills.
 */
function page(target, { background, colour, body, css = "" }) {
  const stage = target.phone ? { width: 440, height: 956 } : { width: 1440, height: 900 };
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: ${background}; color: ${colour}; font-family: Futura, "Jost", "Avenir Next", sans-serif; -webkit-font-smoothing: antialiased; }
    .stage { position: absolute; left: 50%; top: 50%; width: ${stage.width}px; height: ${stage.height}px; margin: -${stage.height / 2}px 0 0 -${stage.width / 2}px; }
    h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 700; letter-spacing: -0.01em; text-align: center; }
    .label { position: absolute; font-size: 28px; line-height: 1.22; white-space: nowrap; }
    ${css}
  </style><div class="stage">${body}</div>`;
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

const YOUTUBE_HIDDEN = { youtubeShortsStatus: true, youtubeRecVidsStatus: true, youtubeCommentsStatus: true, youtubeExploreStatus: true };

/** Slide 1: a clean YouTube, and the popup that made it so. */
async function slideHide(browser, target) {
  const icons = { feed: await lucide("eye-off", 30), reels: await lucide("ban", 30), any: await lucide("mouse-pointer-click", 30) };
  const points = [
    [icons.feed, "Addictive feeds"],
    [icons.reels, "Shorts / Reels"],
    [icons.any, "and anything else you want"],
  ];
  if (target.phone) {
    const popup = await popupPicture(browser, { url: "https://m.youtube.com/", store: YOUTUBE_HIDDEN, height: 640 });
    return page(target, {
      background: NAVY,
      colour: "#f4f1ea",
      css: `h1 { font-size: 33px; line-height: 1.12; padding: 52px 24px 0; } h2 { font-size: 26px; margin-top: 8px; }
        ul { list-style: none; margin: 22px auto 0; width: max-content; } li { display: flex; align-items: center; gap: 12px; font-size: 21px; line-height: 1.75; }
        li svg { width: 24px; height: 24px; }`,
      body: `<h1>Hide addictive &amp; distracting features</h1><h2>on any website</h2>
        <ul>${points.map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join("")}</ul>
        ${phone({ x: 40, y: 330, width: 360, site: source("youtube-mobile-home-hidden.png"), popup, sheetTop: 0.3 })}`,
    });
  }
  const popup = await popupPicture(browser, {
    url: "https://www.youtube.com/",
    store: YOUTUBE_HIDDEN,
    height: 560,
    spots: { pick: "Pick", rec: "Recommended videos" },
  });
  const win = { x: 70, y: 280, width: 900 };
  const pop = { width: 300, ratio: popup.size.height / popup.size.width, right: 18 };
  const k = pop.width / popup.size.width;
  const popX = win.x + win.width - pop.right - pop.width;
  const popY = win.y + 42 - 4;
  const at = (s, fx, fy) => ({ x: popX + (s.x + s.w * fx) * k, y: popY + (s.y + s.h * fy) * k });
  const { html } = browserWindow({ ...win, host: "youtube.com", site: source("youtube-home-hidden.png"), popup: { ...popup, ...pop } });
  const labels = [
    { text: "Click to hide<br>any element", x: 1010, y: 330, from: { x: 1002, y: 352 }, to: at(popup.spots.pick, 1.15, 0.5), bend: { y: -20 } },
    { text: "Ready-made options<br>for popular sites", x: 1010, y: 520, from: { x: 1002, y: 545 }, to: at(popup.spots.rec, 1.06, 0.5), bend: { y: 26 } },
  ];
  return page(target, {
    background: NAVY,
    colour: "#f4f1ea",
    css: `h1 { font-size: 64px; padding-top: 58px; } h2 { font-size: 44px; margin-top: 6px; }
      ul { list-style: none; display: flex; justify-content: center; gap: 44px; margin-top: 30px; } li { display: flex; align-items: center; gap: 12px; font-size: 29px; }`,
    body: `<h1>Hide addictive &amp; distracting features</h1><h2>on any website</h2>
      <ul>${points.map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join("")}</ul>
      ${html}
      ${labels.map((l) => `<div class="label" style="left:${l.x}px; top:${l.y}px; color:${MINT}">${l.text}</div>`).join("")}
      ${drawArrows(labels, MINT)}`,
  });
}

/** Slide 2: ready-made settings for many sites, and your own picks on any other. */
async function slideYourNeeds(browser, target) {
  const card = (p, w) =>
    `<div style="width:${w}px; height:${(w * p.size.height) / p.size.width}px; border-radius:12px; overflow:hidden; ${SHADOW}"><img src="${pngUri(p.picture)}" style="width:100%; display:block"></div>`;
  const instagram = await popupPicture(browser, {
    url: "https://www.instagram.com/",
    store: { instagramFeedStatus: true, instagramReelsStatus: true, instagramExploreStatus: true, instagramSuggestedFollowsStatus: true },
    height: 420,
  });
  const linkedin = await popupPicture(browser, {
    url: "https://www.linkedin.com/feed/",
    store: { linkedinFeedStatus: true, linkedinNewsStatus: true },
    height: 420,
  });
  const any = await popupPicture(browser, {
    url: "https://www.bbc.co.uk/news",
    store: {
      "www.bbc.co.ukCustomHiddenElements": [
        { name: "Most read", selector: "#most-read" },
        { name: "Recommended stories", selector: "#recommended" },
        { name: "Video carousel", selector: "#video-carousel" },
      ],
    },
    height: 420,
  });
  const sites = ["YouTube", "Instagram", "Facebook", "X", "LinkedIn", "Reddit", "Google", "WhatsApp Web"];
  if (target.phone) {
    return page(target, {
      background: PAPER,
      colour: INK,
      css: `h1 { font-size: 34px; line-height: 1.12; padding: 52px 20px 0; } p { font-size: 20px; line-height: 1.4; text-align: center; padding: 0 30px; margin-top: 16px; }
        .cap { position: absolute; color: ${GREEN}; font-size: 19px; line-height: 1.2; }`,
      body: `<h1>Change websites to YOUR needs</h1>
        <p>Ready-made for ${sites.slice(0, -1).join(", ")} and ${sites.at(-1)}</p>
        <p>… and hide anything you choose on any other website</p>
        <div class="cap" style="left:30px; top:330px">Ready-made</div>
        <div style="position:absolute; left:24px; top:362px">${card(instagram, 262)}</div>
        <div class="cap" style="left:24px; top:700px">Your own<br>picks</div>
        <div style="position:absolute; right:24px; top:644px">${card(any, 262)}</div>`,
    });
  }
  return page(target, {
    background: PAPER,
    colour: INK,
    css: `h1 { font-size: 64px; padding-top: 60px; }
      .lead { position: absolute; left: 70px; top: 260px; width: 380px; font-size: 27px; line-height: 1.35; }
      .lead ul { list-style: none; margin: 10px 0 24px; display: grid; grid-template-columns: 150px 1fr; } .lead li { font-size: 24px; line-height: 1.6; white-space: nowrap; }
      .lead li::before { content: "•"; margin-right: 8px; color: ${GREEN}; }
      .cards { position: absolute; left: 480px; top: 250px; display: flex; gap: 24px; } .cap { color: ${GREEN}; font-size: 25px; margin-bottom: 14px; }`,
    body: `<h1>Change websites to YOUR needs</h1>
      <div class="lead">Ready-made for<ul>${sites.map((s) => `<li>${s}</li>`).join("")}</ul>… and hide anything you choose on any other website</div>
      <div class="cards">
        <div><div class="cap">Ready-made</div>${card(instagram, 290)}</div>
        <div><div class="cap">&nbsp;</div>${card(linkedin, 290)}</div>
        <div><div class="cap">Your own picks</div>${card(any, 290)}</div>
      </div>`,
  });
}

/** Slide 3: Delay, and a lock on your settings. */
async function slideHabits(browser, target) {
  const check = await lucide("circle-check-big", 30);
  const points = [
    "Wait a few seconds before a site opens, and remember why you came",
    "Lock your settings, so a change takes time",
  ];
  const delayPopup = (height) =>
    popupPicture(browser, {
      url: "https://www.youtube.com/",
      store: { ...YOUTUBE_HIDDEN, youtubeAccessDelayStatus: true, youtubeAccessDelaySeconds: 10, youtubeSettingsLocked: true },
      height,
      prepare: async (p) => {
        await p.locator('.feature-card[data-feature="delay"]').click();
        await p.waitForTimeout(500);
      },
    });
  if (target.phone) {
    return page(target, {
      background: PAPER,
      colour: INK,
      css: `h1 { font-size: 34px; line-height: 1.12; padding: 52px 20px 0; } h2 { font-weight: 400; font-size: 21px; margin-top: 10px; padding: 0 30px; }
        ul { list-style: none; margin: 18px 34px 0; } li { display: flex; gap: 10px; font-size: 18px; line-height: 1.3; margin-bottom: 10px; } li svg { width: 22px; height: 22px; flex-shrink: 0; color: ${GREEN}; }`,
      body: `<h1>Build better online habits</h1><h2>with tools to hold you accountable to your better self</h2>
        <ul>${points.map((t) => `<li>${check}<span>${t}</span></li>`).join("")}</ul>
        ${phone({ x: 40, y: 380, width: 360, site: source("youtube-mobile-home-delay.png") })}`,
    });
  }
  const popup = await delayPopup(330);
  const { html } = browserWindow({ x: 560, y: 250, width: 820, host: "youtube.com", site: source("youtube-home-delay.png") });
  const card = `<div style="position:absolute; left:80px; top:560px; width:330px; height:330px; border-radius:12px; overflow:hidden; ${SHADOW}"><img src="${pngUri(popup.picture)}" style="width:100%; display:block"></div>`;
  return page(target, {
    background: PAPER,
    colour: INK,
    css: `h1 { font-size: 64px; padding-top: 60px; } h2 { font-weight: 400; font-size: 34px; margin-top: 8px; }
      ul { position: absolute; left: 80px; top: 250px; width: 440px; list-style: none; } li { display: flex; gap: 16px; font-size: 29px; line-height: 1.3; margin-bottom: 30px; }
      li svg { width: 34px; height: 34px; flex-shrink: 0; margin-top: 2px; color: ${GREEN}; }`,
    body: `<h1>Build better online habits</h1><h2>with tools to hold you accountable to your better self</h2>
      <ul>${points.map((t) => `<li>${check}<span>${t}</span></li>`).join("")}</ul>
      ${html}${card}`,
  });
}

/** Slide 4: Greyscale and Redirect. */
async function slideLessTempting(browser, target) {
  const card = (p, w) =>
    `<div style="width:${w}px; height:${(w * p.size.height) / p.size.width}px; border-radius:12px; overflow:hidden; ${SHADOW}"><img src="${pngUri(p.picture)}" style="width:100%; display:block"></div>`;
  const redirect = await popupPicture(browser, {
    url: "https://www.instagram.com/",
    store: { instagramRedirectStatus: true, instagramRedirectUrl: "https://en.wikipedia.org" },
    height: 300,
    prepare: async (p) => {
      await p.locator('.feature-card[data-feature="redirect"]').click();
      await p.waitForTimeout(500);
    },
  });
  // Half in colour, half in greyscale: the same page, with a line between.
  const split = (colour, grey, w, h) => `<div style="position:relative; width:${w}px; height:${h}px; overflow:hidden">
      <img src="${colour}" style="position:absolute; inset:0; width:100%">
      <div style="position:absolute; inset:0; clip-path:polygon(55% 0, 100% 0, 100% 100%, 45% 100%)"><img src="${grey}" style="width:100%"></div>
      <svg style="position:absolute; inset:0" width="${w}" height="${h}"><line x1="${w * 0.55}" y1="0" x2="${w * 0.45}" y2="${h}" stroke="#fff" stroke-width="4"/></svg>
      ${["Before", "Greyscale"].map((t, i) => `<span style="position:absolute; bottom:${h * 0.04}px; ${i ? "right" : "left"}:${w * 0.03}px; background:rgba(30,40,55,0.82); color:#fff; border-radius:999px; padding:${w * 0.006}px ${w * 0.018}px; font-size:${Math.max(13, w * 0.022)}px">${t}</span>`).join("")}
    </div>`;
  if (target.phone) {
    const w = 338;
    const h = w * (932 / 430) * 0.52;
    return page(target, {
      background: PAPER,
      colour: INK,
      css: `h1 { font-size: 34px; line-height: 1.12; padding: 52px 20px 0; }
        .cap { color: ${GREEN}; font-size: 19px; line-height: 1.25; text-align: center; }`,
      body: `<h1>Make distractions less tempting</h1>
        <div class="cap" style="margin-top:16px">Greyscale takes the colour out of a site</div>
        <div style="position:absolute; left:51px; top:180px; border-radius:22px; overflow:hidden; ${SHADOW}">${split(source("youtube-mobile-search-colour.png"), source("youtube-mobile-search-greyscale.png"), w, h)}</div>
        <div class="cap" style="position:absolute; left:0; right:0; top:${180 + h + 26}px">Redirect sends you somewhere better</div>
        <div style="position:absolute; left:70px; top:${180 + h + 60}px">${card(redirect, 300)}</div>`,
    });
  }
  const winW = 860;
  const winH = winW / 1.6;
  return page(target, {
    background: PAPER,
    colour: INK,
    css: `h1 { font-size: 64px; padding-top: 60px; }
      .cap { position: absolute; color: ${GREEN}; font-size: 28px; line-height: 1.25; }`,
    body: `<h1>Make distractions less tempting</h1>
      <div class="cap" style="left:70px; top:192px">Greyscale takes the colour out of a site</div>
      <div style="position:absolute; left:70px; top:250px; border-radius:12px; overflow:hidden; ${SHADOW}">${split(source("youtube-search-colour.png"), source("youtube-search-greyscale.png"), winW, winH)}</div>
      <div class="cap" style="left:1000px; top:192px">Redirect sends you<br>somewhere better</div>
      <div style="position:absolute; left:1000px; top:290px">${card(redirect, 370)}</div>`,
  });
}

/** Slide 5: the research, and what the extension does with your data. */
async function slideResearch(browser, target) {
  const icon = (name) => lucide(name, 26);
  const icons = { brain: await icon("brain"), chart: await icon("chart-scatter"), code: await icon("code-xml"), lock: await icon("lock") };
  const logos = [
    path.join(PARTNERS, "oxford.png"),
    path.join(SRC, "logo-maastricht.png"),
    path.join(PARTNERS, "santa-clara.png"),
    path.join(PARTNERS, "copenhagen.png"),
    path.join(PARTNERS, "linacre.png"),
  ];
  const logoRow = (h) => `<div style="display:flex; align-items:center; gap:${h * 0.28}px">${logos.map((f) => `<img src="${fileUri(f)}" style="height:${h}px">`).join("")}</div>`;
  const cardCss = `.card { background: #fff; border-radius: 14px; box-shadow: 0 0 0 1.5px rgba(47,58,74,0.12), 0 10px 28px rgba(47,58,74,0.08); }
    .card h3 { font-family: Georgia, serif; }
    .row { display: flex; color: #4a5565; } .row svg { flex-shrink: 0; color: ${INK}; }`;
  const research = `Digital Habits: Focus is based on research on digital distraction by the Centre for Digital Habits, led by Dr Ulrik Lyngs at the University of Oxford.`;
  const privacy = `Open source, and private by design: we collect no personal data, and only count how many people use Focus.`;
  if (target.phone) {
    return page(target, {
      background: PAPER,
      colour: INK,
      css: `${cardCss} h1 { font-size: 30px; line-height: 1.15; padding: 48px 26px 0; } h2 { font-weight: 400; font-size: 20px; margin-top: 10px; padding: 0 30px; }
        .card { margin: 0 22px 14px; padding: 16px 18px; } .card h3 { font-size: 19px; margin-bottom: 8px; }
        .row { gap: 10px; font-size: 14px; line-height: 1.35; margin-top: 6px; } .row svg { width: 18px; height: 18px; }`,
      body: `<h1>Based on 10+ years of award-winning research</h1><h2>to help you take back control of your attention online</h2>
        <div class="card" style="margin-top:24px">
          <h3>Research-based</h3>
          <div class="row">${icons.brain}<span>${research}</span></div>
          <div style="margin:14px 0 8px">${logoRow(34)}</div>
          <img src="${source("research-wasted-time.png")}" style="width:100%; display:block; margin-top:6px">
        </div>
        <div class="card"><div class="row" style="margin:0">${icons.lock}<span>${privacy}</span></div></div>`,
    });
  }
  return page(target, {
    background: PAPER,
    colour: INK,
    css: `${cardCss} h1 { font-size: 56px; line-height: 1.12; padding: 56px 60px 0; } h2 { font-weight: 400; font-size: 32px; margin-top: 12px; }
      .card { position: absolute; padding: 26px 30px; } .card h3 { font-size: 30px; margin-bottom: 12px; }
      .row { gap: 14px; font-size: 22px; line-height: 1.38; margin-top: 10px; } .row svg { width: 26px; height: 26px; margin-top: 2px; }
      .thanks { font-size: 20px; color: #4a5565; margin: 18px 0 10px; }`,
    body: `<h1>Based on 10+ years of award-winning research</h1><h2>to help you take back control of your attention online</h2>
      <div class="card" style="left:80px; top:250px; width:530px; height:590px; padding:22px 30px; display:grid; place-items:center">
        <img src="${source("research-wasted-time.png")}" style="width:100%; display:block">
      </div>
      <div class="card" style="left:650px; top:250px; width:710px">
        <h3>Research-based</h3>
        <div class="row">${icons.brain}<span>${research}</span></div>
        <div class="row">${icons.chart}<span>digitalhabits.org/research</span></div>
        <div class="thanks">With researchers at</div>
        ${logoRow(54)}
      </div>
      <div class="card" style="left:650px; top:628px; width:710px; height:212px">
        <h3>Your data stays with you</h3>
        <div class="row">${icons.lock}<span>${privacy}</span></div>
        <div class="row">${icons.code}<span>github.com/digitalhabits/dh-focus</span></div>
      </div>`,
  });
}

// The order of the store listing. The first ones show before a person scrolls.
const SLIDES = [
  { id: "01-hide-distractions", make: slideHide },
  { id: "02-your-needs", make: slideYourNeeds },
  { id: "03-better-habits", make: slideHabits },
  { id: "04-less-tempting", make: slideLessTempting },
  { id: "05-research", make: slideResearch },
];

if (process.argv.includes("--capture")) {
  await capture();
  process.exit(0);
}

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const stores = (process.env.STORES ?? Object.keys(TARGETS).join(",")).split(",");
const browser = await chromium.launch({ executablePath: shellPath() });
for (const store of stores) {
  const target = TARGETS[store];
  const dir = path.join(OUT, store, "en");
  fs.mkdirSync(dir, { recursive: true });
  for (const slide of SLIDES) {
    if (only && !slide.id.startsWith(only)) continue;
    const html = await slide.make(browser, target);
    const context = await browser.newContext({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: target.scale });
    const tab = await context.newPage();
    await tab.setContent(html, { waitUntil: "load" });
    await tab.waitForTimeout(300);
    const file = path.join(dir, `${slide.id}.png`);
    await tab.screenshot({ path: file });
    await context.close();
    console.log(path.relative(ROOT, file));
  }
}
await browser.close();
