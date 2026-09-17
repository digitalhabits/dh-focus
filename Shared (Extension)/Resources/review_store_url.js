/**
 * Review-store URLs for the popup prompt. Standalone: only uses
 * chrome.runtime + navigator (no Digital Habits: Blocker, native messaging, or block pages).
 */

const APPLE_LISTING =
    'https://apps.apple.com/gb/app/redd-focus-hide-distractions/id1660218371';

const CHROME_WEB_STORE =
    'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd';

const FIREFOX_REVIEWS =
    'https://addons.mozilla.org/en-US/firefox/addon/digitalhabits-focus/reviews/';

function extensionScheme() {
    try {
        return new URL(chrome.runtime.getURL('manifest.json')).protocol;
    } catch {
        return '';
    }
}

function isSafariExtension() {
    return extensionScheme() === 'safari-web-extension:';
}

function isFirefoxExtension() {
    return extensionScheme() === 'moz-extension:';
}

function isAppleMobile() {
    const ua = navigator.userAgent || '';
    if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return true;
    if (/\bMacintosh\b/i.test(ua) && /\bMobile\//i.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function getReviewStoreUrl() {
    if (isSafariExtension()) {
        if (isAppleMobile()) {
            return `${APPLE_LISTING}?action=write-review`;
        }
        return `${APPLE_LISTING}?platform=mac&action=write-review`;
    }
    if (isFirefoxExtension()) {
        return FIREFOX_REVIEWS;
    }
    return CHROME_WEB_STORE;
}

// Loaded as a classic script in popup.html — ES module imports break iOS Safari popups.
window.getReviewStoreUrl = getReviewStoreUrl;
