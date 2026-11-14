// Populates the blocked-page UI from URL params set by background.js.
//
// Lives in a separate file (not inlined into blocked.html) so it satisfies
// the MV3 default CSP `script-src 'self'`; inline scripts in extension
// pages are blocked outright, which would leave the pill, countdown, and
// source/start/end rows permanently empty even when data was available.
//
// All fields may be absent (pre-1.x native host, or an edge case where
// the URL matches the flat blocklist but no block metadata is available)
// and the page degrades gracefully.

(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("popup") === "1") {
    document.body.classList.add("popup-mode");
  }

  const originalUrl = params.get("u") || "";
  const blocklistId = params.get("id");
  const blocklistName = params.get("name");
  const blockMode = params.get("mode");
  const emoji = params.get("emoji");
  const color = params.get("color");
  const source = params.get("source");
  const endsAt = parseIntOrNull(params.get("endsAt"));
  const startedAt = parseIntOrNull(params.get("startedAt"));

  function parseIntOrNull(raw) {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  const da = (navigator.language || "").toLowerCase().startsWith("da");
  const subtitleEl = document.getElementById("subtitle");
  if (subtitleEl) {
    if (blockMode === "allowlist") {
      subtitleEl.textContent = da
        ? "Dette websted er ikke et af dem, du har givet dig selv lov til at bruge."
        : "This site isn't one of the ones you've allowed yourself to use.";
    } else {
      subtitleEl.textContent = da
        ? "Dette websted er på din nuværende blokeringsliste."
        : "This site is on your current blocklist.";
    }
  }

  // ---- Blocklist pill -------------------------------------------------
  if (blocklistName) {
    setText("pill-name", blocklistName);
    const emojiEl = document.getElementById("pill-emoji");
    if (emoji) {
      emojiEl.textContent = emoji;
    } else {
      emojiEl.remove();
    }
    if (color) {
      const pill = document.getElementById("pill");
      pill.style.setProperty("--pill-bg", color);
      // Pick legible text color for the supplied background. Most
      // blocklist colors in Digital Habits: Blocker are pastel so black text is the
      // safer default; we only force white when the color is genuinely
      // dark.
      pill.style.setProperty("--pill-text", textColorFor(color));
    }
    show("pill-wrap");
  }

  function textColorFor(hex) {
    try {
      const rgb = hexToRgb(hex);
      if (!rgb) return "#fff";
      // Rec. 709 relative luminance approximation.
      const l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
      // Dark text uses --redd-navy for parity with the rest of the
      // ReDD design language (matches redd-block + extension popup).
      return l > 150 ? "#1b3d4a" : "#fff";
    } catch {
      return "#fff";
    }
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  // ---- URL detail -----------------------------------------------------
  if (originalUrl) {
    // Show the hostname + path, not the raw query-encoded string.
    try {
      const u = new URL(originalUrl);
      setText("url-value", u.hostname + (u.pathname === "/" ? "" : u.pathname));
      document.getElementById("url-value").title = originalUrl;
    } catch {
      setText("url-value", originalUrl);
    }
  } else {
    document.getElementById("row-url").hidden = true;
  }

  // ---- Source (manual vs schedule) ------------------------------------
  if (source === "schedule") {
    setText("source-value", "On schedule");
    show("row-source");
  } else if (source === "manual") {
    setText("source-value", "Manual block");
    show("row-source");
  }

  // ---- Countdown ------------------------------------------------------
  // Live countdown that re-renders every second. If the native host
  // hasn't pushed an updated block yet when the window expires, the
  // extension will redirect us away on the next refresh anyway.
  const countdownEl = document.getElementById("countdown");
  const endsAtSuffix = document.getElementById("ends-at-suffix");
  const ALWAYS_ON_CUTOFF_MS = Date.UTC(9999, 0, 1);

  function formatHms(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  function formatClock(unixMs) {
    try {
      return new Date(unixMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  if (endsAt) {
    show("row-ends");
    if (endsAt >= ALWAYS_ON_CUTOFF_MS) {
      document.getElementById("ends-label").textContent = "Ends";
      countdownEl.textContent = "when turned off";
      endsAtSuffix.textContent = "";
      return;
    }
    const renderCountdown = () => {
      const remainingMs = endsAt - Date.now();
      if (remainingMs <= 0) {
        countdownEl.textContent = "now";
        endsAtSuffix.textContent = "";
        document.getElementById("ends-label").textContent = "Ends";
        return;
      }
      countdownEl.textContent = formatHms(remainingMs);
      endsAtSuffix.textContent = " · at " + formatClock(endsAt);
    };
    renderCountdown();
    setInterval(renderCountdown, 1000);
  }

  // ---- Started-at -----------------------------------------------------
  if (startedAt) {
    setText("started-value", formatClock(startedAt));
    show("row-started");
  }

  // Keep the `blocklistId` around for anyone wiring richer behavior on
  // top (e.g. an override link). Currently unused by the UI.
  void blocklistId;

  // If nothing inside `.details` ended up visible (e.g. user opened
  // blocked.html directly without any query params while previewing),
  // hide the whole container so we don't show an empty bordered gap.
  const detailsEl = document.querySelector(".details");
  const hasVisibleRow = Array.from(
    detailsEl.querySelectorAll(".detail-row")
  ).some((row) => !row.hidden);
  if (!hasVisibleRow) detailsEl.hidden = true;
})();
