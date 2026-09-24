document.addEventListener('DOMContentLoaded', function () {
    initializePopup();

    function initializePopup() {
        console.log("Popup initialized.");

        // hide payment field for now
        const paymentField = document.getElementById('payment-status');
        paymentField.style.display = 'none';

        /**
         * iOS Safari extension sheets often don't resolve height:100% to the visible
         * sheet viewport. Pin html/body to the visual viewport so #popup-content can
         * scroll and the footer stays on-screen without drag-to-resize.
         */
        function syncIosPopupSheetLayout() {
            const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (!isIos) return;

            function isTextEntryElement(el) {
                if (el instanceof HTMLTextAreaElement) return true;
                if (!(el instanceof HTMLInputElement)) return false;
                const type = (el.type || 'text').toLowerCase();
                return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'hidden'].includes(type);
            }

            let lastStableHeight = 0;

            const apply = function () {
                const viewport = window.visualViewport;
                const height = Math.round((viewport && viewport.height) || window.innerHeight || 0);
                if (!height) return;
                const isEditing = isTextEntryElement(document.activeElement);
                if (!isEditing) {
                    lastStableHeight = height;
                }
                const appliedHeight = isEditing && lastStableHeight ? lastStableHeight : height;
                const px = appliedHeight + 'px';
                document.documentElement.style.height = px;
                document.documentElement.style.maxHeight = px;
                document.body.style.height = px;
                document.body.style.maxHeight = px;
            };

            apply();
            window.addEventListener('resize', apply);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', apply);
            }
        }
        syncIosPopupSheetLayout();

        // ========================================
        // Theme Management
        // ========================================

        // Media query for system preference
        const systemDarkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        /**
         * Apply theme to the document based on preference
         * @param {string} theme - 'system', 'light', or 'dark'
         */
        function applyTheme(theme) {
            const root = document.documentElement;

            if (theme === 'dark') {
                root.classList.add('dark-mode');
            } else if (theme === 'light') {
                root.classList.remove('dark-mode');
            } else {
                // 'system' - match OS/browser preference
                if (systemDarkModeQuery.matches) {
                    root.classList.add('dark-mode');
                } else {
                    root.classList.remove('dark-mode');
                }
            }
        }

        /**
         * Handle system preference change when theme is set to 'system'
         */
        function handleSystemThemeChange(e) {
            chrome.storage.sync.get('themePreference', function (result) {
                if (result.themePreference === 'system' || !result.themePreference) {
                    applyTheme('system');
                }
            });
        }

        // Listen for system theme changes
        systemDarkModeQuery.addEventListener('change', handleSystemThemeChange);

        const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' };

        /**
         * Initialize theme from storage and set up the theme selector (custom list: option hover matches FAQ rows)
         */
        function setupTheme() {
            const themeRoot = document.getElementById('themeSelectRoot');
            const themeTrigger = document.getElementById('themeSelectTrigger');
            const themeTriggerText = document.getElementById('themeSelectTriggerText');
            const themeMenu = document.getElementById('themeSelectMenu');
            if (!themeRoot || !themeTrigger || !themeTriggerText || !themeMenu) return;

            // Detect mobile/tablet devices
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            if (isMobile) {
                const generalSection = document.getElementById('general-section');
                if (generalSection) generalSection.style.display = 'none';
                chrome.storage.sync.set({ themePreference: 'system' });
                applyTheme('system');
                return;
            }

            let currentThemeValue = 'system';

            function setTriggerLabel(value) {
                themeTriggerText.textContent = THEME_LABELS[value] || THEME_LABELS.system;
            }

            function syncOptionSelection() {
                themeMenu.querySelectorAll('[role="option"]').forEach(function (opt) {
                    const selected = opt.getAttribute('data-value') === currentThemeValue;
                    opt.setAttribute('aria-selected', selected ? 'true' : 'false');
                });
            }

            function closeThemeMenu() {
                themeMenu.hidden = true;
                themeTrigger.setAttribute('aria-expanded', 'false');
            }

            function openThemeMenu() {
                themeMenu.hidden = false;
                themeTrigger.setAttribute('aria-expanded', 'true');
                syncOptionSelection();
            }

            // Load saved theme preference
            chrome.storage.sync.get('themePreference', function (result) {
                currentThemeValue = result.themePreference || 'system';
                setTriggerLabel(currentThemeValue);
                applyTheme(currentThemeValue);
            });

            themeTrigger.addEventListener('click', function (e) {
                e.stopPropagation();
                const expanded = themeTrigger.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    closeThemeMenu();
                } else {
                    openThemeMenu();
                }
            });

            themeMenu.querySelectorAll('[role="option"]').forEach(function (option) {
                option.addEventListener('click', function (e) {
                    e.stopPropagation();
                    currentThemeValue = option.getAttribute('data-value') || 'system';
                    chrome.storage.sync.set({ themePreference: currentThemeValue });
                    applyTheme(currentThemeValue);
                    setTriggerLabel(currentThemeValue);
                    syncOptionSelection();
                    closeThemeMenu();
                });
            });

            document.addEventListener('click', function (e) {
                if (!themeRoot.contains(e.target)) {
                    closeThemeMenu();
                }
            });

            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && themeTrigger.getAttribute('aria-expanded') === 'true') {
                    closeThemeMenu();
                    themeTrigger.focus();
                }
            });
        }

        // Setup theme immediately
        setupTheme();

        const MANUAL_CSS_SELECTORS_KEY = 'manualCssSelectorsEnabled';

        function applyManualCssSelectorsEnabled(enabled) {
            document.body.classList.toggle('manual-css-enabled', enabled);
        }

        function setupManualCssSelectors() {
            const toggle = document.getElementById('manualCssSelectorsToggle');
            if (!toggle) return;

            chrome.storage.sync.get(MANUAL_CSS_SELECTORS_KEY, function (result) {
                const enabled = result[MANUAL_CSS_SELECTORS_KEY] === true;
                toggle.checked = enabled;
                applyManualCssSelectorsEnabled(enabled);
            });

            toggle.addEventListener('change', function () {
                const enabled = toggle.checked;
                chrome.storage.sync.set({ [MANUAL_CSS_SELECTORS_KEY]: enabled });
                applyManualCssSelectorsEnabled(enabled);
            });
        }

        setupManualCssSelectors();

        // Anonymous usage ping (sent from background.js). On by default.
        // Firefox sends no ping, so it gets no switch either.
        const USAGE_PING_KEY = 'usagePingEnabled';

        function setupUsagePing() {
            const toggle = document.getElementById('usagePingToggle');
            if (!toggle) return;

            if (chrome.runtime.getURL('').startsWith('moz-extension://')) {
                const row = toggle.closest('.settings-row');
                if (row) row.style.display = 'none';
                return;
            }

            chrome.storage.sync.get(USAGE_PING_KEY, function (result) {
                toggle.checked = result[USAGE_PING_KEY] !== false;
            });

            toggle.addEventListener('change', function () {
                chrome.storage.sync.set({ [USAGE_PING_KEY]: toggle.checked });
            });
        }

        setupUsagePing();

        // ========================================
        // EULA (ReDD 2FA parity: revision + storage.local)
        // ========================================
        const EULA_STORAGE_KEY = 'reddfocus_eula';
        const CURRENT_EULA_REVISION = 1;

        function showEulaOverlayThen(onAccept) {
            const eulaOverlay = document.getElementById('eula-overlay');
            if (!eulaOverlay) {
                onAccept();
                return;
            }
            const errorContainer = document.getElementById('error-prompt');
            const popupContainer = document.getElementById('popup-content');
            const reviewPrompt = document.getElementById('reviewPrompt');
            const messageContainer = document.getElementById('delay-content');
            const saveFooter = document.getElementById('save-controls');
            if (errorContainer) errorContainer.style.display = 'none';
            if (popupContainer) popupContainer.style.display = 'none';
            if (reviewPrompt) reviewPrompt.style.display = 'none';
            if (messageContainer) {
                messageContainer.style.display = 'none';
                messageContainer.classList.remove('show');
            }
            if (saveFooter) saveFooter.style.display = 'none';
            const foot = document.querySelector('footer');
            if (foot) foot.style.display = 'none';
            document.body.classList.add('eula-gate-active');
            document.documentElement.classList.add('eula-gate-active');
            eulaOverlay.style.display = 'block';
            // Firefox sends no usage count (see background.js), so it gets
            // no "we count" line and no "How we count" details.
            if (chrome.runtime.getURL('').startsWith('moz-extension://')) {
                const lead = document.getElementById('eula-privacy-lead');
                if (lead) lead.textContent = 'We collect no personal data, and Focus sends nothing to us.';
                const details = document.getElementById('eula-how-we-count');
                if (details) details.style.display = 'none';
            }
            const checkbox = document.getElementById('eula-agree-checkbox');
            const continueBtn = document.getElementById('eula-continue-btn');
            if (checkbox) checkbox.checked = false;
            if (continueBtn) continueBtn.disabled = true;

            function onCheckboxChange() {
                if (continueBtn) continueBtn.disabled = !checkbox || !checkbox.checked;
            }
            if (checkbox) {
                checkbox.addEventListener('change', onCheckboxChange);
            }
            if (!continueBtn) {
                onAccept();
                return;
            }
            continueBtn.addEventListener('click', function onContinue() {
                if (!checkbox || !checkbox.checked) return;
                continueBtn.removeEventListener('click', onContinue);
                if (checkbox) checkbox.removeEventListener('change', onCheckboxChange);
                const originalText = continueBtn.textContent;
                continueBtn.disabled = true;
                continueBtn.textContent = 'Continuing...';
                const toSet = {};
                toSet[EULA_STORAGE_KEY] = {
                    acceptedRevision: CURRENT_EULA_REVISION,
                    acceptedAt: Date.now()
                };
                chrome.storage.local.set(toSet, function () {
                    eulaOverlay.style.display = 'none';
                    document.body.classList.remove('eula-gate-active');
                    document.documentElement.classList.remove('eula-gate-active');
                    if (foot) foot.style.display = '';
                    continueBtn.textContent = originalText;
                    onAccept();
                });
            });
        }

        function runMain() {
        /*// Check payment status when popup opens"
        checkPaymentStatus();

        function checkPaymentStatus() {
            const paymentText = document.getElementById('payment-text');

            // Send message to check payment status
            chrome.runtime.sendMessage({ type: "checkPurchase" })
                .then(result => {
                    if (result === null) {
                        paymentText.textContent = 'Not available on this browser';
                    } else if (result && result.paid !== undefined) {
                        paymentText.textContent = result.paid ? 'Paid' : 'Not Paid';
                    } else {
                        paymentText.textContent = 'Error';
                    }
                })
                .catch(err => {
                    console.error("Error checking purchase:", err);
                    paymentText.textContent = 'Error';
                });
        }*/

        let isSelectionModeActive = false;
        let currentPlatform = null;
        let currentSiteIdentifier = null;
        let currentPageHostname = null;
        let rememberSettingsEnabled = true; // default
        let isSettingsLocked = false;
        let protectedHiddenAtLock = new Set();
        let unlockWaitTime = 10;
        const DEFAULT_UNLOCK_WAIT_TEXT = "What's your intention?";
        let unlockWaitText = DEFAULT_UNLOCK_WAIT_TEXT;

        function resolveUnlockWaitText(raw) {
            const trimmed = typeof raw === 'string' ? raw.trim() : '';
            return trimmed || DEFAULT_UNLOCK_WAIT_TEXT;
        }

        function unlockWaitTextForInput(raw) {
            if (typeof raw !== 'string') return '';
            const trimmed = raw.trim();
            // Legacy: default was stored as the field value — treat that as empty so placeholder shows
            if (!trimmed || trimmed === DEFAULT_UNLOCK_WAIT_TEXT) return '';
            return raw;
        }

        function updateSaveFooterVisibility() {
            const saveFooterEl = document.getElementById('save-controls');
            if (!saveFooterEl) return;
            const delayEl = document.getElementById('delay-content');
            const isDelayVisible = !!delayEl && delayEl.style.display !== 'none';
            const shouldShow = (rememberSettingsEnabled === false) && !isDelayVisible;
            saveFooterEl.style.display = shouldShow ? 'block' : 'none';
        }

        const reviewLink = document.querySelector('#reviewPrompt .review-link');
        if (reviewLink && typeof window.getReviewStoreUrl === 'function') {
            reviewLink.href = window.getReviewStoreUrl();
        }

        let opensCount = localStorage.getItem('opensCount');
        opensCount = opensCount ? parseInt(opensCount, 10) + 1 : 1;
        localStorage.setItem('opensCount', opensCount);
        let noThanksClicked = localStorage.getItem('noThanksClicked') === 'true';
        if (opensCount % 10 === 0 && !noThanksClicked) {
            var reviewPrompt = document.getElementById('reviewPrompt');
            if (reviewPrompt) reviewPrompt.style.display = 'block';
        }
        function hideReviewPrompt() {
            var reviewPrompt = document.getElementById('reviewPrompt');
            if (reviewPrompt) reviewPrompt.style.display = 'none';
        }

        function dismissReviewPromptPermanently() {
            localStorage.setItem('noThanksClicked', 'true');
            hideReviewPrompt();
        }

        const noThanksButton = document.getElementById('noThanksButton');
        if (noThanksButton) {
            noThanksButton.addEventListener('click', dismissReviewPromptPermanently);
        }
        if (reviewLink) {
            // tabs.create: <a target="_blank"> can navigate the iOS Safari popup itself.
            // Prefer getReviewStoreUrl() — reviewLink.href expands "#" to an invalid extension URL.
            reviewLink.addEventListener('click', function (event) {
                event.preventDefault();
                dismissReviewPromptPermanently();
                const url = typeof window.getReviewStoreUrl === 'function'
                    ? window.getReviewStoreUrl()
                    : '';
                if (!url || !/^https?:/i.test(url)) return;
                chrome.tabs.create({ url });
            });
        }
        const reviewDismissButton = document.getElementById('reviewDismissButton');
        if (reviewDismissButton) {
            reviewDismissButton.addEventListener('click', hideReviewPrompt);
        }

        function clampSecondsField(value) {
            const parsed = parseInt(value, 10);
            if (isNaN(parsed) || parsed < 5) return 5;
            if (parsed > 600) return 600;
            return parsed;
        }

        function bindSecondsFieldCommit(input, options) {
            if (!input) return;

            function commit() {
                if (options && typeof options.isProtected === 'function' && options.isProtected()) {
                    if (options.getRestoreValue) {
                        input.value = clampSecondsField(options.getRestoreValue());
                    }
                    return;
                }
                const seconds = clampSecondsField(input.value);
                input.value = seconds;
                if (options && typeof options.onCommit === 'function') {
                    options.onCommit(seconds);
                }
            }

            // Cap over-max immediately while typing; allow empty / under-min until commit.
            input.addEventListener('input', function () {
                if (options && typeof options.isProtected === 'function' && options.isProtected()) return;
                if (input.value === '') return;
                const parsed = parseInt(input.value, 10);
                if (!isNaN(parsed) && parsed > 600) {
                    input.value = 600;
                    if (options && typeof options.onCommit === 'function') {
                        options.onCommit(600);
                    }
                }
            });

            // Floor empty / under-min (and re-cap max) on commit.
            input.addEventListener('change', commit);
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                }
            });
        }

        function setupUnlockSettings(siteIdentifier) {
            if (!siteIdentifier) return;

            const waitTextKey = `${siteIdentifier}WaitText`;
            const waitTimeKey = `${siteIdentifier}WaitTime`;

            chrome.storage.sync.get([waitTextKey, waitTimeKey, "waitText", "waitTime"], function (result) {
                const waitTextBox = document.getElementById("waitText");
                const waitTimeBox = document.getElementById("waitTime");
                const messageBox = document.getElementById("delay-message");
                const countdownBox = document.getElementById("delay-time");

                const storedText = result[waitTextKey] !== undefined ? result[waitTextKey] : result.waitText;
                unlockWaitText = resolveUnlockWaitText(storedText);
                const storedWait = result[waitTimeKey] !== undefined
                    ? result[waitTimeKey]
                    : (result.waitTime !== undefined ? result.waitTime : 10);
                unlockWaitTime = clampSecondsField(storedWait);

                if (waitTextBox) {
                    waitTextBox.placeholder = DEFAULT_UNLOCK_WAIT_TEXT;
                    waitTextBox.value = unlockWaitTextForInput(storedText);
                }
                if (waitTimeBox) waitTimeBox.value = unlockWaitTime;
                if (messageBox) messageBox.innerText = unlockWaitText;
                if (countdownBox) countdownBox.innerText = unlockWaitTime;
            });

            const waitTimeInput = document.getElementById("waitTime");
            if (waitTimeInput) {
                bindSecondsFieldCommit(waitTimeInput, {
                    isProtected: function () { return isSettingsLocked; },
                    getRestoreValue: function () { return unlockWaitTime; },
                    onCommit: function (waitValue) {
                        unlockWaitTime = waitValue;
                        chrome.storage.sync.set({ [waitTimeKey]: waitValue });
                        const countdownBox = document.getElementById("delay-time");
                        if (countdownBox) countdownBox.innerText = waitValue;
                    }
                });
            }

            const waitTextInput = document.getElementById("waitText");
            if (waitTextInput) {
                waitTextInput.addEventListener('input', function () {
                    if (isSettingsLocked) return;
                    const waitTextKey = `${siteIdentifier}WaitText`;
                    unlockWaitText = resolveUnlockWaitText(this.value);
                    chrome.storage.sync.set({ [waitTextKey]: this.value });
                    const messageBox = document.getElementById("delay-message");
                    if (messageBox) messageBox.innerText = unlockWaitText;
                });
            }
        }

        function isElementHidden(elementKey, toggleEl) {
            if (!toggleEl) return false;
            if (toggleEl.tagName === 'BUTTON') {
                return toggleEl.getAttribute('data-state') !== 'On';
            }
            if (toggleEl.type === 'checkbox') {
                return toggleEl.checked;
            }
            return false;
        }

        /** What the lock would protect right now: hidden elements and features that are on. */
        function collectLockableItems() {
            const items = new Set();
            if (currentPlatform) {
                elementsThatCanBeHidden.filter(e => e.startsWith(currentPlatform)).forEach(function (item) {
                    const toggleEl = document.getElementById(item + 'Toggle');
                    if (isElementHidden(item, toggleEl)) {
                        items.add(item);
                    }
                });
            }
            if (currentSiteIdentifier) {
                const grayscaleToggle = document.getElementById('grayscaleToggle');
                if (grayscaleToggle && grayscaleToggle.checked) {
                    items.add(`${currentSiteIdentifier}Grayscale`);
                }
                const accessDelayToggle = document.getElementById('accessDelayToggle');
                if (accessDelayToggle && accessDelayToggle.checked) {
                    items.add(`${currentSiteIdentifier}AccessDelay`);
                }
                const redirectToggle = document.getElementById('redirectToggle');
                if (redirectToggle && redirectToggle.checked) {
                    items.add(`${currentSiteIdentifier}Redirect`);
                }
                const redirectUrlInput = document.getElementById('redirectUrl');
                if (redirectUrlInput && redirectUrlInput.value.trim()) {
                    items.add(`${currentSiteIdentifier}RedirectUrl`);
                }
            }
            return items;
        }

        /** Something to lock: an item above, or at least one of the user's own picks. */
        function hasSomethingToLock() {
            // A saved redirect address with Redirect off is not something to lock.
            const active = Array.from(collectLockableItems()).filter(function (key) {
                return !key.endsWith('RedirectUrl');
            });
            if (active.length > 0) return true;
            const listId = (currentPlatform ? currentSiteIdentifier : 'generic') + 'CustomElements';
            const list = document.getElementById(listId);
            return !!(list && list.children.length > 0);
        }

        function captureProtectedHiddenSnapshot() {
            protectedHiddenAtLock = collectLockableItems();
        }

        function updateLockIcon() {
            const lockBtn = document.getElementById('settings-lock-btn');
            const unlockedIcon = document.getElementById('lock-icon-unlocked');
            const lockedIcon = document.getElementById('lock-icon-locked');
            if (!lockBtn || !unlockedIcon || !lockedIcon) return;

            unlockedIcon.style.display = isSettingsLocked ? 'none' : 'block';
            lockedIcon.style.display = isSettingsLocked ? 'block' : 'none';
            lockBtn.title = isSettingsLocked ? 'Unlock settings' : 'Lock settings';
            lockBtn.setAttribute('aria-label', lockBtn.title);
            lockBtn.setAttribute('aria-pressed', isSettingsLocked ? 'true' : 'false');

            const waitTimeInput = document.getElementById('waitTime');
            const waitTextInput = document.getElementById('waitText');
            const frictionCustomisation = document.querySelector('.friction-customisation');
            if (waitTimeInput) waitTimeInput.disabled = isSettingsLocked;
            if (waitTextInput) waitTextInput.disabled = isSettingsLocked;
            if (frictionCustomisation) {
                frictionCustomisation.classList.toggle('lock-protected-settings', isSettingsLocked);
            }
        }

        function updateLockProtectedUI() {
            if (currentPlatform) {
                elementsThatCanBeHidden.filter(e => e.startsWith(currentPlatform)).forEach(function (item) {
                    const toggleEl = document.getElementById(item + 'Toggle');
                    const row = toggleEl ? toggleEl.closest('.a-toggle') : null;
                    if (!row) return;
                    const shouldProtect = isSettingsLocked &&
                        protectedHiddenAtLock.has(item) &&
                        isElementHidden(item, toggleEl);
                    row.classList.toggle('lock-protected', shouldProtect);
                });
            }
            if (currentSiteIdentifier) {
                const grayscaleToggle = document.getElementById('grayscaleToggle');
                const grayscaleRow = document.getElementById('grayscale-toggle-row');
                if (grayscaleToggle && grayscaleRow) {
                    const grayscaleKey = `${currentSiteIdentifier}Grayscale`;
                    const shouldProtect = isSettingsLocked &&
                        protectedHiddenAtLock.has(grayscaleKey) &&
                        grayscaleToggle.checked;
                    grayscaleRow.classList.toggle('lock-protected', shouldProtect);
                }
                const accessDelayToggle = document.getElementById('accessDelayToggle');
                const accessDelayRow = document.getElementById('access-delay-toggle-row');
                const accessDelaySeconds = document.getElementById('accessDelaySeconds');
                if (accessDelayToggle && accessDelayRow) {
                    const accessDelayKey = `${currentSiteIdentifier}AccessDelay`;
                    const shouldProtect = isSettingsLocked &&
                        protectedHiddenAtLock.has(accessDelayKey) &&
                        accessDelayToggle.checked;
                    accessDelayRow.classList.toggle('lock-protected', shouldProtect);
                    if (accessDelaySeconds) accessDelaySeconds.disabled = shouldProtect;
                }
                const redirectToggle = document.getElementById('redirectToggle');
                const redirectRow = document.getElementById('redirect-toggle-row');
                const redirectUrlInput = document.getElementById('redirectUrl');
                if (redirectToggle && redirectRow) {
                    const redirectKey = `${currentSiteIdentifier}Redirect`;
                    const redirectUrlKey = `${currentSiteIdentifier}RedirectUrl`;
                    const shouldProtectToggle = isSettingsLocked &&
                        protectedHiddenAtLock.has(redirectKey) &&
                        redirectToggle.checked;
                    const shouldProtectUrl = isSettingsLocked &&
                        protectedHiddenAtLock.has(redirectUrlKey);
                    redirectRow.classList.toggle('lock-protected', shouldProtectToggle);
                    redirectRow.classList.toggle('redirect-url-locked', shouldProtectUrl);
                    if (redirectUrlInput) {
                        redirectUrlInput.disabled = shouldProtectUrl;
                        redirectUrlInput.readOnly = shouldProtectUrl;
                    }
                }
            }
        }

        function persistLockState(siteIdentifier) {
            const lockKey = `${siteIdentifier}SettingsLocked`;
            chrome.storage.sync.set({ [lockKey]: isSettingsLocked });
        }

        function openSettingsPanel(options) {
            const faqDropdown = document.getElementById('faq-dropdown');
            const faqOverlay = document.getElementById('faq-overlay');
            if (!faqDropdown || !faqOverlay) return;

            faqDropdown.style.display = 'block';
            faqOverlay.style.display = 'block';
            document.body.classList.add('modal-open');
            setupSettingsPanelTabOrder(options || {});

            const scrollToId = options && options.scrollToId;
            if (scrollToId) {
                const target = document.getElementById(scrollToId);
                if (target) {
                    requestAnimationFrame(function () {
                        target.scrollIntoView({ block: 'nearest' });
                    });
                }
            }
        }

        let settingsTabTrapHandler = null;

        function closeSettingsPanel() {
            const faqDropdown = document.getElementById('faq-dropdown');
            const faqOverlay = document.getElementById('faq-overlay');
            if (faqDropdown) faqDropdown.style.display = 'none';
            if (faqOverlay) faqOverlay.style.display = 'none';
            document.body.classList.remove('modal-open');
            if (settingsTabTrapHandler) {
                document.removeEventListener('keydown', settingsTabTrapHandler);
                settingsTabTrapHandler = null;
            }
            setupPopupTabOrder();
            clearPopupAutofocus();
        }

        function clearPopupAutofocus() {
            const active = document.activeElement;
            if (active && active !== document.body && typeof active.blur === 'function') {
                active.blur();
            }
        }

        function setupSettingsPanelTabOrder(options) {
            const settingsRoot = document.getElementById('faq-dropdown');
            if (!settingsRoot || settingsRoot.style.display === 'none') return;

            document.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(function (el) {
                if (settingsRoot.contains(el)) return;
                el.tabIndex = -1;
            });

            const firstFaqItem = settingsRoot.querySelector('.settings-panel-faq .faq-item');
            if (firstFaqItem) {
                firstFaqItem.querySelectorAll('.faq-content a').forEach(function (link) {
                    link.tabIndex = -1;
                });
            }
            settingsRoot.querySelectorAll('#themeSelectMenu [role="option"]').forEach(function (el) {
                el.tabIndex = -1;
            });

            function isSettingsFocusable(el) {
                if (!(el instanceof HTMLAnchorElement ||
                    el instanceof HTMLButtonElement ||
                    el instanceof HTMLInputElement ||
                    el instanceof HTMLSelectElement ||
                    el instanceof HTMLTextAreaElement)) {
                    return false;
                }
                if (el.disabled) return false;
                if (el.closest('#themeSelectMenu')) return false;
                if (el instanceof HTMLAnchorElement && el.closest('.faq-content')) return false;
                if (el.closest('[hidden]')) return false;
                const section = el.closest('.settings-section');
                if (section && section.style.display === 'none') return false;
                const switchRoot = el.closest('.enforcement-switch');
                if (switchRoot) {
                    return !!(switchRoot.offsetWidth || switchRoot.offsetHeight || switchRoot.getClientRects().length);
                }
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            }

            const focusables = [];
            settingsRoot.querySelectorAll('a, button, input, select, textarea').forEach(function (el) {
                if (!isSettingsFocusable(el)) {
                    el.tabIndex = -1;
                    return;
                }
                focusables.push(el);
            });

            focusables.forEach(function (el, index) {
                el.tabIndex = index + 1;
            });

            if (settingsTabTrapHandler) {
                document.removeEventListener('keydown', settingsTabTrapHandler);
            }

            function isLiveFocusable(el) {
                if (el.disabled) return false;
                const switchRoot = el.closest('.enforcement-switch');
                if (switchRoot) {
                    return !!(switchRoot.offsetWidth || switchRoot.offsetHeight || switchRoot.getClientRects().length);
                }
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            }

            settingsTabTrapHandler = function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSettingsPanel();
                    return;
                }
                if (e.key !== 'Tab') return;

                const live = focusables.filter(isLiveFocusable);
                if (live.length === 0) return;

                const first = live[0];
                const last = live[live.length - 1];
                const active = document.activeElement;

                if (!settingsRoot.contains(active)) {
                    e.preventDefault();
                    first.focus();
                    return;
                }

                if (e.shiftKey) {
                    if (active === first) {
                        e.preventDefault();
                        last.focus();
                    }
                } else if (active === last) {
                    e.preventDefault();
                    first.focus();
                }
            };
            document.addEventListener('keydown', settingsTabTrapHandler);

            const focusId = options && options.focusId;
            if (focusId) {
                const focusEl = document.getElementById(focusId);
                if (focusEl && !focusEl.disabled) {
                    focusEl.focus();
                    return;
                }
            }
            clearPopupAutofocus();
        }

        /** A short message at the bottom of the popup that goes away by itself. */
        function showToast(message) {
            const existing = document.getElementById('popup-toast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'popup-toast';
            toast.className = 'popup-toast';
            toast.setAttribute('role', 'status');
            toast.textContent = message;
            document.body.appendChild(toast);
            requestAnimationFrame(function () { toast.classList.add('is-visible'); });
            setTimeout(function () {
                toast.classList.remove('is-visible');
                setTimeout(function () { toast.remove(); }, 250);
            }, 6000);
        }

        function showLockStartDialog(waitSecs, onConfirm) {
            const secs = clampSecondsField(waitSecs);
            const waitLabel = secs === 1 ? '1 second' : `${secs} seconds`;

            const overlay = document.createElement('div');
            overlay.className = 'edit-dialog-overlay lock-start-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'lock-start-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'lock-start-title');
            dialog.innerHTML = `
                <div class="lock-start-icon" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
                <h3 id="lock-start-title">Commit to staying focused?</h3>
                <p class="lock-start-message">Your hidden elements stay hidden until you unlock — and to unlock you will have to wait <strong>${waitLabel}</strong>.</p>
                <button type="button" id="accept-lock-start" class="lock-start-primary-btn">Lock in</button>
                <button type="button" id="cancel-lock-start" class="lock-start-secondary-btn">Not now</button>
                <p class="lock-start-footer">Change the wait time in <button type="button" id="lock-start-settings-link" class="lock-start-settings-link">Settings</button>.</p>`;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            document.body.classList.add('modal-open');

            const titleEl = dialog.querySelector('#lock-start-title');
            if (titleEl) titleEl.tabIndex = -1;

            const acceptBtn = dialog.querySelector('#accept-lock-start');
            const cancelBtn = dialog.querySelector('#cancel-lock-start');
            const settingsBtn = dialog.querySelector('#lock-start-settings-link');
            const modalFocusables = [acceptBtn, cancelBtn, settingsBtn].filter(Boolean);

            document.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(function (el) {
                if (overlay.contains(el)) return;
                el.tabIndex = -1;
            });
            modalFocusables.forEach(function (el) {
                el.tabIndex = 0;
            });

            const onLockStartKeydown = function (e) {
                if (e.key === 'Escape') {
                    closeDialog();
                    return;
                }
                if (e.key !== 'Tab') return;

                const focusables = modalFocusables.filter(function (el) {
                    return !el.disabled && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                });
                if (focusables.length === 0) return;

                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = document.activeElement;

                if (!overlay.contains(active)) {
                    e.preventDefault();
                    first.focus();
                    return;
                }

                if (e.shiftKey) {
                    if (active === first) {
                        e.preventDefault();
                        last.focus();
                    }
                } else if (active === last) {
                    e.preventDefault();
                    first.focus();
                }
            };

            const closeDialog = function (options) {
                document.removeEventListener('keydown', onLockStartKeydown);
                if (overlay.parentNode) document.body.removeChild(overlay);
                if (!(options && options.keepModalOpen)) {
                    document.body.classList.remove('modal-open');
                }
                setupPopupTabOrder();
                if (!(options && options.keepModalOpen)) {
                    clearPopupAutofocus();
                }
            };

            document.getElementById('accept-lock-start').addEventListener('click', function () {
                closeDialog();
                onConfirm();
                showToast(`Locked in. To change locked settings, click the lock icon again and wait ${waitLabel}.`);
            });
            cancelBtn.addEventListener('click', closeDialog);
            settingsBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeDialog({ keepModalOpen: true });
                // Defer so the originating click cannot immediately dismiss Settings.
                setTimeout(function () {
                    openSettingsPanel({ scrollToId: 'accountability-section', focusId: 'waitTime' });
                }, 0);
            });
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeDialog();
            });
            document.addEventListener('keydown', onLockStartKeydown);

            document.getElementById('accept-lock-start').focus();
        }

        function runUnlockCountdown(onComplete) {
            const popupContainer = document.getElementById('popup-content');
            const messageContainer = document.getElementById('delay-content');
            const errorContainer = document.getElementById('error-prompt');
            const messageBox = document.getElementById('delay-message');
            const countdownBox = document.getElementById('delay-time');
            const saveFooter = document.getElementById('save-controls');
            const helpContainer = document.getElementById('help-container');

            if (!popupContainer || !messageContainer || !countdownBox) {
                if (onComplete) onComplete();
                return;
            }

            if (messageBox) messageBox.innerText = unlockWaitText;
            let countdown = clampSecondsField(unlockWaitTime);
            countdownBox.innerText = countdown;

            popupContainer.style.display = 'none';
            if (helpContainer) helpContainer.style.display = 'none';
            if (errorContainer) errorContainer.style.display = 'none';
            if (saveFooter) saveFooter.style.display = 'none';
            messageContainer.style.display = 'block';
            setTimeout(() => messageContainer.classList.add('show'), 100);

            const timerId = setInterval(function () {
                countdown--;
                if (countdown >= 0) {
                    countdownBox.innerText = countdown;
                } else {
                    clearInterval(timerId);
                    messageContainer.style.display = 'none';
                    messageContainer.classList.remove('show');
                    popupContainer.style.display = 'flex';
                    if (helpContainer) helpContainer.style.display = '';
                    if (errorContainer) errorContainer.style.display = 'none';
                    updateSaveFooterVisibility();
                    if (onComplete) onComplete();
                }
            }, 1000);
        }

        function applyToggleStateFromValue(item, value) {
            const toggleEl = document.getElementById(item + 'Toggle');
            if (!toggleEl) return;
            if (item === 'youtubeThumbnails') {
                toggleEl.setAttribute('data-state', value || 'On');
            } else {
                toggleEl.checked = !!value;
            }
        }

        function dismissPopupLoading() {
            document.body.classList.remove('popup-loading', 'lock-state-pending');
        }

        function setupPopupTabOrder() {
            const footer = document.querySelector('footer');
            const siteInfo = document.getElementById('currentSiteInfo');
            const scroll = document.querySelector('.popup-main-scroll');
            const headerButtons = document.querySelectorAll('#help-container button');
            const settingsRoot = document.getElementById('faq-dropdown');

            function excludeFromTabOrder(root) {
                if (!root) return;
                root.tabIndex = -1;
                root.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(function (el) {
                    el.tabIndex = -1;
                });
            }

            function isPopupFocusable(el) {
                if (!(el instanceof HTMLAnchorElement ||
                    el instanceof HTMLButtonElement ||
                    el instanceof HTMLInputElement ||
                    el instanceof HTMLSelectElement ||
                    el instanceof HTMLTextAreaElement)) {
                    return false;
                }
                if (el.disabled) return false;
                if (footer && footer.contains(el)) return false;
                if (siteInfo && siteInfo.contains(el)) return false;
                if (el.closest('#faq-dropdown, #eula-overlay, #delay-content, .lock-start-overlay, .edit-panel-overlay')) return false;
                if (el.closest('[hidden]')) return false;
                if (el.closest('.dropdown:not(.shown)')) return false;
                const reviewPrompt = el.closest('#reviewPrompt');
                if (reviewPrompt && reviewPrompt.style.display === 'none') return false;
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            }

            excludeFromTabOrder(footer);
            excludeFromTabOrder(siteInfo);
            excludeFromTabOrder(settingsRoot);

            if (!scroll) return;

            scroll.querySelectorAll('a, button, input, select, textarea').forEach(function (el) {
                el.tabIndex = 0;
            });
            headerButtons.forEach(function (el) {
                el.tabIndex = 0;
            });

            const ordered = [];
            const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_ELEMENT, {
                acceptNode: function (node) {
                    return isPopupFocusable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                }
            });
            while (walker.nextNode()) {
                ordered.push(walker.currentNode);
            }

            ordered.forEach(function (el, index) {
                el.tabIndex = index + 1;
            });

            headerButtons.forEach(function (el, index) {
                if (!isPopupFocusable(el)) return;
                el.tabIndex = ordered.length + index + 1;
            });
        }

        function revealPopupContent() {
            if (isSettingsLocked) {
                captureProtectedHiddenSnapshot();
                updateLockProtectedUI();
            }

            const popupContainer = document.getElementById('popup-content');
            const messageContainer = document.getElementById('delay-content');
            const errorContainer = document.getElementById('error-prompt');
            if (popupContainer) popupContainer.style.display = 'flex';
            if (messageContainer) {
                messageContainer.style.display = 'none';
                messageContainer.classList.remove('show');
            }
            if (errorContainer) errorContainer.style.display = 'none';
            updateSaveFooterVisibility();
            setupPopupTabOrder();
            dismissPopupLoading();
            // Browsers often autofocus the first control on popup open; clear it so no
            // focus ring is visible until the user actually tabs.
            requestAnimationFrame(clearPopupAutofocus);
            setTimeout(clearPopupAutofocus, 0);
        }

        function initializePopupUI() {
            const lockKey = `${currentSiteIdentifier}SettingsLocked`;
            const rememberKey = `${currentSiteIdentifier}RememberSettings`;
            const grayscaleKey = `${currentSiteIdentifier}GrayscaleStatus`;
            const accessDelayKey = `${currentSiteIdentifier}AccessDelayStatus`;
            const accessDelaySecondsKey = `${currentSiteIdentifier}AccessDelaySeconds`;
            const redirectKey = `${currentSiteIdentifier}RedirectStatus`;
            const redirectUrlKey = `${currentSiteIdentifier}RedirectUrl`;
            const storageKeys = [lockKey, rememberKey, grayscaleKey, accessDelayKey, accessDelaySecondsKey, redirectKey, redirectUrlKey, 'themePreference'];

            if (currentPlatform) {
                elementsThatCanBeHidden.filter(e => e.startsWith(currentPlatform)).forEach(function (item) {
                    storageKeys.push(item + 'Status');
                });
            }

            chrome.storage.sync.get(storageKeys, function (result) {
                isSettingsLocked = result[lockKey] === true;
                rememberSettingsEnabled = result[rememberKey] !== false;

                const themePref = result.themePreference || 'system';
                applyTheme(themePref);
                const themeTriggerText = document.getElementById('themeSelectTriggerText');
                if (themeTriggerText) {
                    themeTriggerText.textContent = THEME_LABELS[themePref] || THEME_LABELS.system;
                }

                if (currentPlatform) {
                    elementsThatCanBeHidden.filter(e => e.startsWith(currentPlatform)).forEach(function (item) {
                        applyToggleStateFromValue(item, result[item + 'Status']);
                    });
                }

                const grayscaleToggle = document.getElementById('grayscaleToggle');
                if (grayscaleToggle) {
                    grayscaleToggle.checked = result[grayscaleKey] === true;
                }

                const accessDelayToggle = document.getElementById('accessDelayToggle');
                const accessDelaySeconds = document.getElementById('accessDelaySeconds');
                if (accessDelayToggle) {
                    accessDelayToggle.checked = result[accessDelayKey] === true;
                    updateAccessDelaySuffixVisibility();
                }
                if (accessDelaySeconds) {
                    accessDelaySeconds.value = clampSecondsField(
                        result[accessDelaySecondsKey] !== undefined ? result[accessDelaySecondsKey] : 10
                    );
                }

                const redirectToggle = document.getElementById('redirectToggle');
                const redirectUrlInput = document.getElementById('redirectUrl');
                if (redirectToggle) {
                    redirectToggle.checked = result[redirectKey] === true;
                    updateRedirectDetailsVisibility();
                }
                if (redirectUrlInput) {
                    redirectUrlInput.value = typeof result[redirectUrlKey] === 'string' ? result[redirectUrlKey] : '';
                }

                const rememberToggle = document.getElementById('rememberSettingsToggle');
                if (rememberToggle) {
                    rememberToggle.checked = rememberSettingsEnabled;
                }

                updateLockIcon();
                updateSaveFooterVisibility();

                if (!rememberSettingsEnabled) {
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        if (!tabs || !tabs[0]) {
                            revealPopupContent();
                            return;
                        }
                        chrome.tabs.sendMessage(tabs[0].id, { type: 'getSessionOverrides' }, function (response) {
                            if (response && response.overrides) {
                                applyOverridesToUI(response.overrides);
                            }
                            if (response && response.customSelectors && Array.isArray(response.customSelectors)) {
                                updateCustomElementsList(currentSiteIdentifier, response.customSelectors);
                            }
                            revealPopupContent();
                        });
                    });
                } else {
                    revealPopupContent();
                }
            });
        }

        function setupSettingsLock(siteIdentifier) {
            const lockBtn = document.getElementById('settings-lock-btn');
            if (!lockBtn || !siteIdentifier) return;

            lockBtn.style.display = '';

            lockBtn.addEventListener('click', function () {
                if (!isSettingsLocked) {
                    if (!hasSomethingToLock()) {
                        showToast('Nothing to lock yet. Hide something, or turn on Greyscale, Delay or Redirect, then lock.');
                        return;
                    }
                    const waitSecs = clampSecondsField(unlockWaitTime);
                    showLockStartDialog(waitSecs, function () {
                        captureProtectedHiddenSnapshot();
                        isSettingsLocked = true;
                        persistLockState(siteIdentifier);
                        updateLockIcon();
                        updateLockProtectedUI();
                    });
                } else {
                    runUnlockCountdown(function () {
                        isSettingsLocked = false;
                        protectedHiddenAtLock.clear();
                        persistLockState(siteIdentifier);
                        updateLockIcon();
                        updateLockProtectedUI();
                    });
                }
            });
        }

        function setupFrictionDelay(siteIdentifier) {
            /* replaced by setupUnlockSettings + setupSettingsLock */
            setupUnlockSettings(siteIdentifier);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isSelectionModeActive) {
                e.preventDefault();
                if (currentSiteIdentifier) {
                    chrome.storage.sync.set({ [`${currentSiteIdentifier}SelectionActive`]: false });
                }
                const addButtonId = currentPlatform
                    ? `${currentPlatform}AddElementButton`
                    : 'genericAddElementButton';
                const addButton = document.getElementById(addButtonId);
                if (addButton) {
                    isSelectionModeActive = false;
                    addButton.classList.remove('active');
                    addButton.textContent = 'Pick…';
                }
            }
        });

        function isRememberEnabled() {
            return rememberSettingsEnabled === true;
        }

        function applySettingChange(elementKey, value) {
            // elementKey examples: youtubeShorts, youtubeThumbnails, etc. Persist if remembering, else send session override
            const storageKey = elementKey + "Status";
            if (isRememberEnabled()) {
                let obj = {};
                obj[storageKey] = value;
                chrome.storage.sync.set(obj);
            } else {
                // session-only override for the active tab
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                    if (tabs && tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: 'sessionOverride', key: storageKey, value: value });
                    }
                });
            }
        }

        function setCheckboxState(element_to_check, id_of_toggle) {
            var currentToggle = document.getElementById(id_of_toggle);
            if (!currentToggle) return;

            chrome.storage.sync.get(element_to_check + "Status", function (result) {
                currentToggle.checked = !!result[element_to_check + "Status"];
            });
        }

        function toggleViewStatusCheckbox(element_to_change, id_of_toggle) {
            var currentCheckbox = document.getElementById(id_of_toggle);
            if (!currentCheckbox) return;

            currentCheckbox.addEventListener('click', function () {
                const newValue = currentCheckbox.checked;
                if (isSettingsLocked && protectedHiddenAtLock.has(element_to_change) && !newValue) {
                    currentCheckbox.checked = true;
                    return;
                }
                applySettingChange(element_to_change, newValue);
                currentCheckbox.classList.add('loading');

                setTimeout(() => {
                    currentCheckbox.classList.remove('loading');
                    updateLockProtectedUI();
                }, 800);
            }, false);
        }

        function setButtonStateFour(element_to_check, id_of_toggle) {
            var currentButton = document.getElementById(id_of_toggle);
            if (!currentButton) return;

            chrome.storage.sync.get(element_to_check + "Status", function (result) {
                let state = result[element_to_check + "Status"] || "On";
                currentButton.setAttribute("data-state", state);
            });
        }

        function toggleViewStatusMultiToggle(element_to_change, id_of_toggle) {
            var currentButton = document.getElementById(id_of_toggle);
            if (!currentButton) return;

            currentButton.addEventListener('click', function () {
                let currentState = currentButton.getAttribute("data-state");

                if (isSettingsLocked && protectedHiddenAtLock.has(element_to_change) && currentState !== "On") {
                    return;
                }

                let nextState;

                if (currentState == "On") {
                    nextState = "Off";
                } else if (currentState == "Off") {
                    nextState = "Blur";
                } else if (currentState == "Blur") {
                    nextState = "Black";
                } else {
                    nextState = "On";
                }
                currentButton.setAttribute("data-state", nextState);
                applySettingChange(element_to_change, nextState);
                currentButton.classList.add('loading'); // Add loading class for animation

                setTimeout(() => {
                    currentButton.classList.remove('loading');
                    updateLockProtectedUI();
                }, 800);
            }, false);
        }

        elementsThatCanBeHidden.forEach(function (item) {
            if (item.startsWith('youtube') || item.startsWith('facebook') || item.startsWith('x') ||
                item.startsWith('instagram') || item.startsWith('linkedin') || item.startsWith('whatsapp') ||
                item.startsWith('google') || item.startsWith('reddit')) {
                if (item === "youtubeThumbnails") {
                    setButtonStateFour(item, item + "Toggle");
                    toggleViewStatusMultiToggle(item, item + "Toggle");
                } else {
                    setCheckboxState(item, item + "Toggle");
                    toggleViewStatusCheckbox(item, item + "Toggle");
                }
            }
        });

        function setSwitch() { /* platform-level switch removed */ }

        function setupPlatformSwitchListener() { /* removed */ }

        function showEditDialog(siteIdentifier, selector, name, onSave, options) {
            options = options || {};
            const dialogTitle = options.title || 'Edit Custom Element';
            const saveLabel = options.saveLabel || 'Save';

            // Full-bleed panel (same pattern as settings #faq-dropdown)
            const overlay = document.createElement('div');
            overlay.className = 'edit-panel-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            overlay.innerHTML = `
                <div class="edit-dialog-scroll">
                    <div class="edit-dialog-header">
                        <h3 id="edit-dialog-title">${dialogTitle}</h3>
                    </div>
                    <div class="edit-dialog-field">
                        <label for="element-name">Name (optional)</label>
                        <input type="text" id="element-name" class="shadcn-input" placeholder="e.g., Reels button" value="${name || ''}">
                    </div>
                    <div class="edit-dialog-field">
                        <label for="element-selector">
                            CSS Selector
                            <a href="https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics" target="_blank" rel="noopener noreferrer" class="help-icon" aria-label="Learn about CSS selectors from Mozilla">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                <span class="help-icon-tooltip" role="tooltip">
                                    Learn about CSS selectors from Mozilla
                                </span>
                            </a>
                        </label>
                        <textarea id="element-selector" class="shadcn-input" rows="3" placeholder="e.g., div.class-name">${selector}</textarea>
                    </div>
                </div>
                <div class="edit-dialog-buttons">
                    <button type="button" id="cancel-edit" class="secondary-btn">Cancel</button>
                    <button type="button" id="save-edit" class="primary-btn">${saveLabel}</button>
                </div>
            `;
            overlay.setAttribute('aria-labelledby', 'edit-dialog-title');

            document.body.appendChild(overlay);
            document.body.classList.add('modal-open');
            document.body.style.minHeight = '350px';

            const titleEl = overlay.querySelector('#edit-dialog-title');
            if (titleEl) titleEl.tabIndex = -1;
            overlay.querySelectorAll('.edit-dialog-field label, .help-icon').forEach(function (el) {
                el.tabIndex = -1;
            });

            const nameInput = overlay.querySelector('#element-name');
            const selectorInput = overlay.querySelector('#element-selector');
            const cancelBtn = overlay.querySelector('#cancel-edit');
            const saveBtn = overlay.querySelector('#save-edit');
            [nameInput, selectorInput, cancelBtn, saveBtn].forEach(function (el, index) {
                if (el) el.tabIndex = index + 1;
            });

            // Focus the selector field when adding manually, otherwise the name input
            setTimeout(() => {
                const fieldToFocus = options.focusSelector ? selectorInput : nameInput;
                if (fieldToFocus) {
                    fieldToFocus.focus();
                }
            }, 50);

            const onEditKeydown = function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeDialog();
                }
            };

            const closeDialog = function () {
                document.removeEventListener('keydown', onEditKeydown);
                if (overlay.parentNode) document.body.removeChild(overlay);
                document.body.classList.remove('modal-open');
                document.body.style.minHeight = '';
            };

            document.addEventListener('keydown', onEditKeydown);

            // Handle save
            saveBtn.addEventListener('click', function () {
                const newName = nameInput.value.trim();
                const newSelector = selectorInput.value.trim();

                if (!newSelector) {
                    alert('CSS Selector cannot be empty');
                    return;
                }

                try {
                    document.querySelector(newSelector);
                } catch (err) {
                    alert('This is not a valid CSS selector');
                    return;
                }

                onSave(newName, newSelector);
                closeDialog();
            });

            // Handle cancel
            cancelBtn.addEventListener('click', closeDialog);
        }

        function updateCustomElementsList(siteIdentifier, selectors) {
            console.log('updateCustomElementsList called for', siteIdentifier, 'with selectors:', selectors);
            const containerId = currentPlatform ? `${siteIdentifier}CustomElements` : 'genericCustomElements';
            const container = document.getElementById(containerId);
            if (!container) {
                console.error("Could not find custom elements container:", containerId);
                return;
            }
            container.innerHTML = '';

            if (!Array.isArray(selectors)) {
                console.warn("Selectors is not an array for", siteIdentifier, selectors);
                selectors = [];
            }

            selectors.forEach(item => {
                // Support both old format (string) and new format (object with name and selector)
                let selector, name;
                if (typeof item === 'string') {
                    selector = item;
                    name = '';
                } else {
                    selector = item.selector || item;
                    name = item.name || '';
                }

                const div = document.createElement('div');
                div.className = 'custom-element';

                const span = document.createElement('span');
                span.textContent = name || selector;
                span.title = selector;

                const buttonsContainer = document.createElement('div');
                buttonsContainer.className = 'custom-element-buttons';

                // Edit button
                const editButton = document.createElement('button');
                editButton.className = 'icon-btn edit-symbol';
                editButton.innerHTML = `
                    <svg width="14px" height="14px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                    </svg>`;
                editButton.title = 'Edit';
                editButton.addEventListener('click', function () {
                    showEditDialog(siteIdentifier, selector, name, function (newName, newSelector) {
                        // Always edit in BOTH session AND storage (in case data exists in either)
                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            if (!tabs || !tabs[0]) return;

                            // Edit in session memory
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: 'editSessionSelector',
                                oldSelector: selector,
                                newSelector: newSelector,
                                newName: newName
                            }, function (response) {
                                // Also edit in storage (regardless of rememberSettingsEnabled)
                                const storageKey = `${siteIdentifier}CustomHiddenElements`;
                                chrome.storage.sync.get(storageKey, function (result) {
                                    let currentSelectors = result[storageKey] || [];
                                    const index = currentSelectors.findIndex(s =>
                                        (typeof s === 'string' ? s : s.selector) === selector
                                    );

                                    if (index !== -1) {
                                        // Selector was in storage, update it
                                        currentSelectors[index] = { name: newName, selector: newSelector };
                                        chrome.storage.sync.set({ [storageKey]: currentSelectors }, function () {
                                            // Merge storage with any session selectors
                                            const sessionSelectors = (response && response.customSelectors) || [];
                                            const allItems = [...currentSelectors, ...sessionSelectors];
                                            const uniqueItems = allItems.filter((item, idx) => {
                                                const sel = typeof item === 'string' ? item : item.selector;
                                                return allItems.findIndex(i => (typeof i === 'string' ? i : i.selector) === sel) === idx;
                                            });
                                            updateCustomElementsList(siteIdentifier, uniqueItems);
                                        });
                                    } else {
                                        // Selector was only in session, use response
                                        if (response && response.customSelectors) {
                                            updateCustomElementsList(siteIdentifier, response.customSelectors);
                                        }
                                    }
                                });
                            });
                        });
                    });
                });

                // Remove button
                const removeButton = document.createElement('button');
                removeButton.className = 'icon-btn remove-symbol';
                removeButton.innerHTML = `
                    <svg width="14px" height="14px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>`;
                removeButton.title = 'Remove';
                removeButton.addEventListener('click', function () {
                    // Always remove from BOTH session AND storage (in case data exists in either)
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        if (!tabs || !tabs[0]) return;

                        // First remove from storage
                        const storageKey = `${siteIdentifier}CustomHiddenElements`;
                        chrome.storage.sync.get(storageKey, function (result) {
                            let currentSelectors = result[storageKey] || [];
                            currentSelectors = currentSelectors.filter(s =>
                                (typeof s === 'string' ? s : s.selector) !== selector
                            );

                            chrome.storage.sync.set({ [storageKey]: currentSelectors }, function () {
                                // Then remove from session memory and reapply styles
                                chrome.tabs.sendMessage(tabs[0].id, {
                                    type: 'removeSessionSelector',
                                    selector: selector
                                }, function (response) {
                                    // Use the fresh response from content script
                                    if (response && response.customSelectors) {
                                        updateCustomElementsList(siteIdentifier, response.customSelectors);
                                    } else {
                                        // Fallback to just storage
                                        updateCustomElementsList(siteIdentifier, currentSelectors);
                                    }
                                });
                            });
                        });
                    });
                });

                buttonsContainer.appendChild(editButton);
                buttonsContainer.appendChild(removeButton);
                div.appendChild(buttonsContainer);
                div.appendChild(span);

                container.appendChild(div);
            });

            console.log('Updated container content for', containerId, ':', container.innerHTML);
            setupPopupTabOrder();
        }

        function setupGrayscaleToggle(siteIdentifier) {
            const platformSpecific = platformsWeTarget.includes(siteIdentifier);
            const anchorContainer = platformSpecific
                ? document.querySelector(`.dropdown.${siteIdentifier} .toggle-group`)
                : document.querySelector('#generic-site-options .toggle-group');
            if (!anchorContainer) return;

            const existing = document.getElementById('grayscale-toggle-row');
            if (existing) existing.remove();
            const existingWrapper = anchorContainer.querySelector('.grayscale-controls');
            if (existingWrapper) existingWrapper.remove();
            const existingFeatures = anchorContainer.querySelector('.site-feature-controls');
            if (existingFeatures) existingFeatures.remove();

            const wrapper = document.createElement('div');
            wrapper.className = 'hide-checkboxes grayscale-controls';

            const row = document.createElement('div');
            row.id = 'grayscale-toggle-row';
            row.className = 'a-toggle grayscale-toggle';
            row.innerHTML = `
                <input type="checkbox" id="grayscaleToggle" name="grayscaleToggle" aria-label="Greyscale">
                <label id="grayscaleToggleLabel">Greyscale</label>`;

            wrapper.appendChild(row);

            // Greyscale, Delay and Redirect open the section, as a row of cards.
            anchorContainer.prepend(wrapper);

            setupAccessDelayToggle(siteIdentifier, wrapper);
            setupRedirectToggle(siteIdentifier, wrapper);
            buildFeatureCards(wrapper);

            const toggle = document.getElementById('grayscaleToggle');
            if (!toggle) return;

            // Initial checked state is applied in initializePopupUI() before the popup is shown.

            toggle.addEventListener('change', function () {
                const enabled = toggle.checked;
                const protectKey = `${siteIdentifier}Grayscale`;
                if (isSettingsLocked && protectedHiddenAtLock.has(protectKey) && !enabled) {
                    toggle.checked = true;
                    return;
                }
                applySettingChange(`${siteIdentifier}Grayscale`, enabled);
                // Tell the active tab to apply immediately. Relying on storage
                // sync alone is too slow/unreliable from the popup.
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                    if (!tabs || !tabs[0]) return;
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'setGrayscale', enabled: enabled }, function () {
                        // Content script may not be loaded on this tab yet — ignore.
                        void chrome.runtime.lastError;
                    });
                });
                updateLockProtectedUI();
            });
        }

        const HOURGLASS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>';

        /**
         * Greyscale, Delay and Redirect as three cards. The cards drive the
         * same checkboxes and inputs as before (their rows stay in the DOM,
         * visually hidden), so saving, locking and the redirect-loop check are
         * unchanged.
         *
         * Greyscale toggles on click. Delay and Redirect open an editor panel
         * below the cards: clicking an off card turns it on and opens the
         * panel; clicking an on card opens the panel to edit it. The panel's
         * "Turn off" unticks the checkbox; "Done" closes it.
         */
        function buildFeatureCards(wrapper) {
            const grayscaleToggle = document.getElementById('grayscaleToggle');
            const delayToggle = document.getElementById('accessDelayToggle');
            const redirectToggle = document.getElementById('redirectToggle');
            const secondsInput = document.getElementById('accessDelaySeconds');
            const redirectDetails = document.getElementById('redirect-details');
            const urlInput = document.getElementById('redirectUrl');
            if (!grayscaleToggle || !delayToggle || !redirectToggle) return;

            ['grayscale-toggle-row', 'access-delay-toggle-row', 'redirect-toggle-row'].forEach(function (id) {
                const row = document.getElementById(id);
                if (row) row.classList.add('feature-row');
            });

            const grid = document.createElement('div');
            grid.className = 'feature-cards';
            wrapper.prepend(grid);

            const panels = document.createElement('div');
            panels.className = 'feature-panels';
            grid.insertAdjacentElement('afterend', panels);

            let openFeature = null;

            function makeCard(feature, name, iconHtml) {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'feature-card';
                card.dataset.feature = feature;
                card.innerHTML = `
                    <span class="feature-card-name">${name}</span>
                    <span class="feature-card-foot">
                        <span class="feature-card-state">Off</span>
                        <span class="feature-tile">${iconHtml}</span>
                    </span>`;
                grid.appendChild(card);
                return card;
            }

            const cards = {
                grayscale: makeCard('grayscale', 'Greyscale', '<img src="images/feature-greyscale.svg" alt="">'),
                delay: makeCard('delay', 'Delay', HOURGLASS_ICON),
                redirect: makeCard('redirect', 'Redirect', '<img src="images/feature-redirect.svg" alt="">')
            };
            const toggles = { grayscale: grayscaleToggle, delay: delayToggle, redirect: redirectToggle };

            function panelFooter(feature) {
                const footer = document.createElement('div');
                footer.className = 'feature-panel-actions';
                const off = document.createElement('button');
                off.type = 'button';
                off.className = 'feature-panel-off';
                off.textContent = 'Turn off';
                off.addEventListener('click', function () {
                    setToggle(toggles[feature], false);
                    if (!toggles[feature].checked) openPanel(null);
                });
                const done = document.createElement('button');
                done.type = 'button';
                done.className = 'feature-panel-done';
                done.textContent = 'Done';
                done.addEventListener('click', function () { openPanel(null); });
                footer.appendChild(off);
                footer.appendChild(done);
                return footer;
            }

            const delayPanel = document.createElement('div');
            delayPanel.className = 'feature-panel';
            delayPanel.hidden = true;
            const delayLine = document.createElement('div');
            delayLine.className = 'feature-panel-line';
            delayLine.appendChild(document.createTextNode('Delay by'));
            if (secondsInput) delayLine.appendChild(secondsInput);
            delayLine.appendChild(document.createTextNode('sec'));
            delayPanel.appendChild(delayLine);
            delayPanel.appendChild(panelFooter('delay'));
            panels.appendChild(delayPanel);
            // The old "by N seconds" line is now the panel.
            const oldSuffix = document.getElementById('access-delay-suffix');
            if (oldSuffix) oldSuffix.remove();

            const redirectPanel = document.createElement('div');
            redirectPanel.className = 'feature-panel';
            redirectPanel.hidden = true;
            const redirectTitle = document.createElement('label');
            redirectTitle.className = 'feature-panel-title';
            redirectTitle.htmlFor = 'redirectUrl';
            redirectTitle.textContent = 'Redirect to';
            redirectPanel.appendChild(redirectTitle);
            if (redirectDetails) redirectPanel.appendChild(redirectDetails);
            redirectPanel.appendChild(panelFooter('redirect'));
            panels.appendChild(redirectPanel);

            const panelFor = { delay: delayPanel, redirect: redirectPanel };

            function openPanel(feature) {
                openFeature = feature;
                Object.keys(panelFor).forEach(function (key) {
                    panelFor[key].hidden = key !== feature;
                    cards[key].classList.toggle('is-editing', key === feature);
                    cards[key].setAttribute('aria-expanded', key === feature ? 'true' : 'false');
                });
                if (feature === 'redirect' && urlInput && !urlInput.value) urlInput.focus();
                if (feature === 'delay' && secondsInput) secondsInput.focus();
            }

            function setToggle(toggle, value) {
                if (toggle.checked === value) return;
                toggle.checked = value;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function shortDestination(url) {
                return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
            }

            function sync() {
                const lockedRows = {
                    grayscale: document.getElementById('grayscale-toggle-row'),
                    delay: document.getElementById('access-delay-toggle-row'),
                    redirect: document.getElementById('redirect-toggle-row')
                };
                Object.keys(cards).forEach(function (key) {
                    const on = toggles[key].checked;
                    const card = cards[key];
                    card.classList.toggle('is-on', on);
                    card.setAttribute('aria-pressed', on ? 'true' : 'false');
                    const row = lockedRows[key];
                    card.classList.toggle('lock-protected', !!(row && row.classList.contains('lock-protected')));
                    let state = 'Off';
                    if (on && key === 'grayscale') state = 'On';
                    if (on && key === 'delay') state = `${secondsInput ? secondsInput.value : 10} sec`;
                    if (on && key === 'redirect') {
                        const dest = urlInput ? shortDestination(urlInput.value.trim()) : '';
                        state = dest || 'Set page';
                    }
                    const stateEl = card.querySelector('.feature-card-state');
                    stateEl.textContent = state;
                    stateEl.title = state;
                });
                if (openFeature && !toggles[openFeature].checked) openPanel(null);
            }

            // Code elsewhere sets .checked and .value directly (load, reset,
            // lock). Watching the property setters keeps the cards in step
            // with every one of those paths, not only with user clicks.
            function watch(el, prop) {
                if (!el) return;
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, prop);
                Object.defineProperty(el, prop, {
                    configurable: true,
                    get: function () { return desc.get.call(this); },
                    set: function (v) { desc.set.call(this, v); sync(); }
                });
            }
            [grayscaleToggle, delayToggle, redirectToggle].forEach(function (t) {
                watch(t, 'checked');
                t.addEventListener('change', sync);
            });
            watch(secondsInput, 'value');
            watch(urlInput, 'value');
            if (secondsInput) secondsInput.addEventListener('input', sync);
            if (urlInput) urlInput.addEventListener('input', sync);

            cards.grayscale.addEventListener('click', function () {
                setToggle(grayscaleToggle, !grayscaleToggle.checked);
            });
            ['delay', 'redirect'].forEach(function (key) {
                cards[key].addEventListener('click', function () {
                    if (!toggles[key].checked) {
                        setToggle(toggles[key], true);
                        if (toggles[key].checked) openPanel(key);
                        return;
                    }
                    openPanel(openFeature === key ? null : key);
                });
            });

            sync();
        }

        function getPopupDisplayHost() {
            const el = document.getElementById('currentSiteName');
            const name = el && el.textContent ? el.textContent.trim() : '';
            return name || currentSiteIdentifier || 'this site';
        }

        function updateAccessDelaySuffixVisibility() {
            const toggle = document.getElementById('accessDelayToggle');
            const suffix = document.getElementById('access-delay-suffix');
            if (!toggle || !suffix) return;
            suffix.hidden = !toggle.checked;
        }

        function setupAccessDelayToggle(siteIdentifier, grayscaleWrapper) {
            if (!grayscaleWrapper) return;

            const row = document.createElement('div');
            row.id = 'access-delay-toggle-row';
            row.className = 'a-toggle access-delay-toggle';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.id = 'accessDelayToggle';
            toggle.name = 'accessDelayToggle';

            const label = document.createElement('label');
            label.id = 'accessDelayToggleLabel';
            label.textContent = 'Delay opening ' + getPopupDisplayHost();
            toggle.setAttribute('aria-label', label.textContent);

            const suffix = document.createElement('div');
            suffix.id = 'access-delay-suffix';
            suffix.className = 'access-delay-suffix';
            suffix.hidden = true;
            suffix.appendChild(document.createTextNode('by '));

            const secondsInput = document.createElement('input');
            secondsInput.type = 'number';
            secondsInput.id = 'accessDelaySeconds';
            secondsInput.name = 'accessDelaySeconds';
            secondsInput.value = '10';
            secondsInput.min = '5';
            secondsInput.max = '600';
            secondsInput.inputMode = 'numeric';
            secondsInput.setAttribute('pattern', '[0-9]*');
            secondsInput.className = 'access-delay-seconds-input compact-seconds-input';
            secondsInput.setAttribute('aria-label', 'Delay seconds');

            suffix.appendChild(secondsInput);
            suffix.appendChild(document.createTextNode(' seconds'));

            row.appendChild(toggle);
            row.appendChild(label);
            row.appendChild(suffix);
            grayscaleWrapper.appendChild(row);

            const secondsKey = `${siteIdentifier}AccessDelaySeconds`;
            chrome.storage.sync.get(secondsKey, function (result) {
                secondsInput.value = clampSecondsField(result[secondsKey] !== undefined ? result[secondsKey] : 10);
            });

            toggle.addEventListener('change', function () {
                const enabled = toggle.checked;
                const protectKey = `${siteIdentifier}AccessDelay`;
                if (isSettingsLocked && protectedHiddenAtLock.has(protectKey) && !enabled) {
                    toggle.checked = true;
                    updateAccessDelaySuffixVisibility();
                    return;
                }
                updateAccessDelaySuffixVisibility();
                applySettingChange(`${siteIdentifier}AccessDelay`, enabled);
                updateLockProtectedUI();
            });

            secondsInput.addEventListener('click', function (e) {
                e.stopPropagation();
            });
            bindSecondsFieldCommit(secondsInput, {
                isProtected: function () {
                    return isSettingsLocked && protectedHiddenAtLock.has(`${siteIdentifier}AccessDelay`);
                },
                getRestoreValue: function () { return secondsInput.value; },
                onCommit: function (seconds) {
                    chrome.storage.sync.set({ [secondsKey]: seconds });
                }
            });
        }

        function updateRedirectDetailsVisibility() {
            const toggle = document.getElementById('redirectToggle');
            const details = document.getElementById('redirect-details');
            if (!toggle || !details) return;
            details.hidden = !toggle.checked;
            refreshRedirectRulesToCurrentSiteList();
        }

        function normalizeRedirectHost(host) {
            return String(host || '').toLowerCase().replace(/^www\./, '');
        }

        function extractRedirectDestinationHost(rawInput) {
            const raw = (rawInput || '').trim();
            if (!raw || raw.startsWith('/')) return null;
            try {
                const hostname = /^https?:\/\//i.test(raw)
                    ? new URL(raw).hostname
                    : new URL('https://' + raw).hostname;
                // Ignore partial domains (e.g. "youtube") — warn only once a TLD is present
                if (!hostname || !hostname.includes('.')) return null;
                return hostname;
            } catch (e) {
                return null;
            }
        }

        function redirectSiteIdCandidatesForHost(hostname) {
            const bare = normalizeRedirectHost(hostname);
            const candidates = [];
            function add(id) {
                if (id && candidates.indexOf(id) === -1) candidates.push(id);
            }
            add(bare);
            add('www.' + bare);
            add(String(hostname || '').toLowerCase());
            for (const platform in platformHostnames) {
                const hosts = platformHostnames[platform] || [];
                if (hosts.some(function (h) { return normalizeRedirectHost(h) === bare; })) {
                    add(platform);
                }
            }
            return candidates;
        }

        function currentSiteHostSet() {
            const hosts = new Set();
            function add(host) {
                const bare = normalizeRedirectHost(host);
                if (bare) hosts.add(bare);
            }
            add(currentPageHostname);
            add(currentSiteIdentifier);
            if (currentPlatform && platformHostnames[currentPlatform]) {
                platformHostnames[currentPlatform].forEach(add);
            }
            return hosts;
        }

        function displayHostLabel(host) {
            return normalizeRedirectHost(host) || host || 'this site';
        }

        function displayNameForRedirectSite(siteId) {
            if (platformHostnames[siteId] && platformHostnames[siteId][0]) {
                return platformHostnames[siteId][0].replace(/^www\./, '');
            }
            return String(siteId || '').replace(/^www\./, '');
        }

        function siteIdFromRedirectFromInput(raw) {
            let value = (raw || '').trim();
            if (!value) return null;
            value = value.replace(/^https?:\/\//i, '');
            const hostPart = value.split('/')[0].split('?')[0].toLowerCase();
            if (!hostPart) return null;
            const bare = hostPart.replace(/^www\./, '');
            for (let i = 0; i < platformsWeTarget.length; i++) {
                const platform = platformsWeTarget[i];
                const hosts = platformHostnames[platform] || [];
                if (hosts.some(function (h) {
                    return h === hostPart || h.replace(/^www\./, '') === bare;
                })) {
                    return platform;
                }
            }
            return bare;
        }

        function collectRedirectRulesToCurrentSite(all) {
            const currentHosts = currentSiteHostSet();
            const rules = [];
            Object.keys(all || {}).forEach(function (key) {
                if (!key.endsWith('RedirectStatus') || all[key] !== true) return;
                const siteId = key.slice(0, -'RedirectStatus'.length);
                if (!siteId) return;
                if (siteId === currentSiteIdentifier) return;
                const siteIdHost = normalizeRedirectHost(siteId);
                if (siteIdHost && currentHosts.has(siteIdHost)) return;
                const urlKey = `${siteId}RedirectUrl`;
                const url = typeof all[urlKey] === 'string' ? all[urlKey].trim() : '';
                if (!url) return;
                const destHost = extractRedirectDestinationHost(url);
                if (!destHost) return;
                if (!currentHosts.has(normalizeRedirectHost(destHost))) return;
                rules.push({
                    siteId: siteId,
                    from: displayNameForRedirectSite(siteId),
                    url: url
                });
            });
            rules.sort(function (a, b) {
                return String(a.from).localeCompare(String(b.from)) ||
                    String(a.url).localeCompare(String(b.url));
            });
            return rules;
        }

        function saveRedirectRule(siteId, destination, callback) {
            if (!siteId) {
                if (callback) callback();
                return;
            }
            const url = (destination || '').trim();
            chrome.storage.sync.set({
                [`${siteId}RedirectStatus`]: !!url,
                [`${siteId}RedirectUrl`]: url
            }, function () {
                if (siteId === currentSiteIdentifier) {
                    const redirectToggle = document.getElementById('redirectToggle');
                    const redirectUrl = document.getElementById('redirectUrl');
                    if (redirectToggle) redirectToggle.checked = !!url;
                    if (redirectUrl) redirectUrl.value = url;
                    updateRedirectDetailsVisibility();
                    updateLockProtectedUI();
                }
                if (callback) callback();
                else refreshRedirectRulesToCurrentSiteList();
            });
        }

        function deleteRedirectRule(siteId, callback) {
            if (!siteId) {
                if (callback) callback();
                return;
            }
            chrome.storage.sync.set({
                [`${siteId}RedirectStatus`]: false,
                [`${siteId}RedirectUrl`]: ''
            }, function () {
                if (siteId === currentSiteIdentifier) {
                    const redirectToggle = document.getElementById('redirectToggle');
                    const redirectUrl = document.getElementById('redirectUrl');
                    if (redirectToggle) redirectToggle.checked = false;
                    if (redirectUrl) redirectUrl.value = '';
                    updateRedirectDetailsVisibility();
                    updateLockProtectedUI();
                }
                if (callback) callback();
                else refreshRedirectRulesToCurrentSiteList();
            });
        }

        function createRedirectPairRow(options) {
            const opts = options || {};
            const pair = document.createElement('div');
            pair.className = 'redirect-pair';

            const fromInput = document.createElement('input');
            fromInput.type = 'text';
            fromInput.className = 'redirect-url-input redirect-from-input';
            fromInput.spellcheck = false;
            fromInput.autocomplete = 'off';
            fromInput.placeholder = opts.fromPlaceholder || 'instagram.com';
            fromInput.setAttribute('aria-label', opts.fromLabel || 'Redirect from');
            if (opts.fromValue != null) fromInput.value = opts.fromValue;

            const arrow = document.createElement('span');
            arrow.className = 'redirect-pair-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '→';

            const toInput = document.createElement('input');
            toInput.type = 'text';
            toInput.className = 'redirect-url-input redirect-to-input';
            toInput.spellcheck = false;
            toInput.autocomplete = 'off';
            toInput.placeholder = opts.toPlaceholder || 'wikipedia.org';
            toInput.setAttribute('aria-label', opts.toLabel || 'Redirect destination');
            if (opts.toValue != null) toInput.value = opts.toValue;

            pair.appendChild(fromInput);
            pair.appendChild(arrow);
            pair.appendChild(toInput);

            if (opts.showRemove) {
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'redirect-rule-remove';
                removeButton.textContent = '×';
                removeButton.setAttribute('aria-label', 'Remove redirect');
                removeButton.title = 'Remove redirect';
                if (typeof opts.onRemove === 'function') {
                    removeButton.addEventListener('click', function (e) {
                        e.stopPropagation();
                        opts.onRemove();
                    });
                }
                pair.appendChild(removeButton);
                pair._removeButton = removeButton;
            }

            pair._fromInput = fromInput;
            pair._toInput = toInput;
            return pair;
        }

        function renderRedirectRulesToCurrentSiteList(rules) {
            const list = document.getElementById('redirect-to-current-site-list');
            const group = document.getElementById('redirect-to-current-site-group');
            if (!list || !group) return;
            list.innerHTML = '';

            if (!rules || rules.length === 0) {
                group.hidden = true;
                return;
            }

            group.hidden = false;

            rules.forEach(function (rule) {
                let activeSiteId = rule.siteId;
                const pair = createRedirectPairRow({
                    fromValue: rule.from,
                    toValue: rule.url,
                    showRemove: true,
                    onRemove: function () {
                        deleteRedirectRule(activeSiteId, function () {
                            refreshRedirectRulesToCurrentSiteList();
                            updateLockProtectedUI();
                        });
                    }
                });

                function commitRule() {
                    const fromRaw = pair._fromInput.value.trim();
                    const toRaw = pair._toInput.value.trim();
                    pair._fromInput.value = fromRaw;
                    pair._toInput.value = toRaw;

                    if (!fromRaw || !toRaw) {
                        return;
                    }

                    const newSiteId = siteIdFromRedirectFromInput(fromRaw);
                    if (!newSiteId) {
                        return;
                    }

                    if (newSiteId === activeSiteId) {
                        saveRedirectRule(activeSiteId, toRaw, function () {
                            refreshRedirectRulesToCurrentSiteList();
                            updateLockProtectedUI();
                        });
                        return;
                    }

                    const previousSiteId = activeSiteId;
                    activeSiteId = newSiteId;
                    deleteRedirectRule(previousSiteId, function () {
                        saveRedirectRule(newSiteId, toRaw, function () {
                            refreshRedirectRulesToCurrentSiteList();
                            updateLockProtectedUI();
                        });
                    });
                }

                [pair._fromInput, pair._toInput].forEach(function (input) {
                    input.addEventListener('click', function (e) {
                        e.stopPropagation();
                    });
                    input.addEventListener('change', commitRule);
                    input.addEventListener('blur', commitRule);
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            input.blur();
                        }
                    });
                });

                list.appendChild(pair);
            });
        }

        function refreshRedirectRulesToCurrentSiteList() {
            const list = document.getElementById('redirect-to-current-site-list');
            if (!list) return;
            chrome.storage.sync.get(null, function (all) {
                if (!document.getElementById('redirect-to-current-site-list')) return;
                renderRedirectRulesToCurrentSiteList(collectRedirectRulesToCurrentSite(all));
            });
        }

        function setupRedirectToggle(siteIdentifier, wrapper) {
            if (!wrapper) return;

            const row = document.createElement('div');
            row.id = 'redirect-toggle-row';
            row.className = 'a-toggle redirect-toggle';
            row.innerHTML = `
                <input type="checkbox" id="redirectToggle" name="redirectToggle" aria-label="Redirect to another page / website">
                <label id="redirectToggleLabel">Redirect to another page / website</label>
                <div id="redirect-details" class="redirect-details" hidden>
                    <input type="text" id="redirectUrl" name="redirectUrl" class="redirect-url-input" placeholder="/feed/subscriptions" spellcheck="false" autocomplete="off" aria-label="Redirect destination">
                    <p id="redirect-loop-warning" class="redirect-loop-warning" hidden role="alert"></p>
                    <p class="how-to-description redirect-help">Either a page on this site (e.g. <code>/feed/subscriptions</code>) or another website (e.g. <code>wikipedia.org</code>).</p>
                </div>
                <div id="redirect-to-current-site-group" class="redirect-to-current-site-group">
                    <p id="redirect-to-current-site-heading" class="redirect-to-current-site-heading"></p>
                    <div id="redirect-to-current-site-list" class="redirect-to-current-site-list"></div>
                </div>`;
            wrapper.appendChild(row);

            const toggle = document.getElementById('redirectToggle');
            const urlInput = document.getElementById('redirectUrl');
            const loopWarning = document.getElementById('redirect-loop-warning');
            const redirectToCurrentSiteHeading = document.getElementById('redirect-to-current-site-heading');
            if (!toggle || !urlInput || !loopWarning || !redirectToCurrentSiteHeading) return;

            redirectToCurrentSiteHeading.textContent = `Redirects to ${getPopupDisplayHost()}`;

            const urlKey = `${siteIdentifier}RedirectUrl`;
            let redirectLoopConflict = null;
            let loopCheckGeneration = 0;

            function setLoopWarning(conflict) {
                redirectLoopConflict = conflict;
                if (!conflict) {
                    loopWarning.hidden = true;
                    loopWarning.textContent = '';
                    urlInput.removeAttribute('aria-invalid');
                    return;
                }
                const fromHost = displayHostLabel(conflict.fromHost);
                const toHost = displayHostLabel(conflict.toHost);
                loopWarning.textContent =
                    `You are already redirecting from ${fromHost} to ${toHost}.`;
                loopWarning.hidden = false;
                urlInput.setAttribute('aria-invalid', 'true');
            }

            function refreshRedirectLoopWarning() {
                const generation = ++loopCheckGeneration;
                const destHost = extractRedirectDestinationHost(urlInput.value);
                if (!destHost) {
                    setLoopWarning(null);
                    return;
                }

                const currentHosts = currentSiteHostSet();
                const destBare = normalizeRedirectHost(destHost);
                // Same-site destination can't form a reverse loop with another site's rule
                if (currentHosts.has(destBare)) {
                    setLoopWarning(null);
                    return;
                }

                const candidateIds = redirectSiteIdCandidatesForHost(destHost);
                const keys = [];
                candidateIds.forEach(function (id) {
                    keys.push(`${id}RedirectStatus`, `${id}RedirectUrl`);
                });

                chrome.storage.sync.get(keys, function (result) {
                    if (generation !== loopCheckGeneration) return;

                    let conflict = null;
                    for (let i = 0; i < candidateIds.length; i++) {
                        const id = candidateIds[i];
                        if (result[`${id}RedirectStatus`] !== true) continue;
                        const storedUrl = typeof result[`${id}RedirectUrl`] === 'string'
                            ? result[`${id}RedirectUrl`]
                            : '';
                        const storedDestHost = extractRedirectDestinationHost(storedUrl);
                        if (!storedDestHost) continue;
                        if (!currentHosts.has(normalizeRedirectHost(storedDestHost))) continue;
                        conflict = {
                            fromHost: destBare,
                            toHost: normalizeRedirectHost(currentPageHostname) || destBare
                        };
                        break;
                    }
                    setLoopWarning(conflict);
                });
            }

            chrome.storage.sync.get(urlKey, function (result) {
                urlInput.value = typeof result[urlKey] === 'string' ? result[urlKey] : '';
                refreshRedirectLoopWarning();
                refreshRedirectRulesToCurrentSiteList();
            });

            toggle.addEventListener('change', function () {
                const enabled = toggle.checked;
                const protectKey = `${siteIdentifier}Redirect`;
                if (isSettingsLocked && protectedHiddenAtLock.has(protectKey) && !enabled) {
                    toggle.checked = true;
                    updateRedirectDetailsVisibility();
                    return;
                }
                updateRedirectDetailsVisibility();
                applySettingChange(`${siteIdentifier}Redirect`, enabled);
                updateLockProtectedUI();
            });

            function isUrlProtected() {
                return isSettingsLocked && protectedHiddenAtLock.has(`${siteIdentifier}RedirectUrl`);
            }

            function commitRedirectUrl() {
                if (isUrlProtected()) {
                    chrome.storage.sync.get(urlKey, function (result) {
                        urlInput.value = typeof result[urlKey] === 'string' ? result[urlKey] : '';
                        refreshRedirectLoopWarning();
                    });
                    return;
                }

                const rawValue = urlInput.value.trim();
                const destHost = extractRedirectDestinationHost(rawValue);
                const currentHosts = currentSiteHostSet();

                function saveValue(value) {
                    urlInput.value = value;
                    setLoopWarning(null);
                    chrome.storage.sync.set({ [urlKey]: value });
                    updateLockProtectedUI();
                }

                function clearRejectedValue() {
                    urlInput.value = '';
                    setLoopWarning(null);
                    chrome.storage.sync.set({ [urlKey]: '' });
                    updateLockProtectedUI();
                }

                // Already flagged, or no cross-site host to check
                if (redirectLoopConflict) {
                    clearRejectedValue();
                    return;
                }
                if (!destHost || currentHosts.has(normalizeRedirectHost(destHost))) {
                    saveValue(rawValue);
                    return;
                }

                // Re-check storage before save (covers blur before input check finishes)
                const candidateIds = redirectSiteIdCandidatesForHost(destHost);
                const keys = [];
                candidateIds.forEach(function (id) {
                    keys.push(`${id}RedirectStatus`, `${id}RedirectUrl`);
                });
                chrome.storage.sync.get(keys, function (result) {
                    const hasConflict = candidateIds.some(function (id) {
                        if (result[`${id}RedirectStatus`] !== true) return false;
                        const storedUrl = typeof result[`${id}RedirectUrl`] === 'string'
                            ? result[`${id}RedirectUrl`]
                            : '';
                        const storedDestHost = extractRedirectDestinationHost(storedUrl);
                        return storedDestHost && currentHosts.has(normalizeRedirectHost(storedDestHost));
                    });
                    if (hasConflict) {
                        clearRejectedValue();
                        return;
                    }
                    saveValue(rawValue);
                });
            }

            urlInput.addEventListener('click', function (e) {
                e.stopPropagation();
            });
            urlInput.addEventListener('input', refreshRedirectLoopWarning);
            urlInput.addEventListener('change', commitRedirectUrl);
            urlInput.addEventListener('blur', commitRedirectUrl);
            urlInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    urlInput.blur();
                }
            });
        }

        /**
         * The Custom section is no longer collapsible and has no heading:
         * the feature cards open it, then a divider, then "Hide distractions"
         * with its Pick… button, then the user's picks under "Your picks".
         */
        function setupCustomSectionCollapse(siteIdentifier) {
            const group = currentPlatform
                ? document.querySelector('.dropdown.' + currentPlatform + ' > .toggle-group')
                : document.querySelector('#generic-site-options > .toggle-group');
            if (!group || group.dataset.customLayoutBound === 'true') return;
            group.dataset.customLayoutBound = 'true';
            group.classList.add('custom-section');

            const heading = Array.prototype.find.call(group.children, function (el) {
                return el.tagName === 'H2' && el.textContent.trim().toLowerCase() === 'custom';
            });
            if (heading) heading.remove();

            const controls = group.querySelector('.custom-elements-controls');
            if (controls) {
                const divider = document.createElement('hr');
                divider.className = 'custom-section-divider';
                controls.insertAdjacentElement('beforebegin', divider);

                const title = document.createElement('div');
                title.className = 'hide-distractions-title';
                title.textContent = 'Hide distractions';
                controls.prepend(title);
            }

            const list = group.querySelector('.custom-elements');
            if (list) {
                const picksHeading = document.createElement('h2');
                picksHeading.className = 'your-picks-heading';
                picksHeading.textContent = 'Your picks';
                list.insertAdjacentElement('beforebegin', picksHeading);
            }
            setupPopupTabOrder();
        }

        function addCustomSelector(siteIdentifier, name, selector) {
            const storageKey = `${siteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(storageKey, function (result) {
                let currentSelectors = result[storageKey] || [];
                if (!Array.isArray(currentSelectors)) currentSelectors = [];

                const alreadyExists = currentSelectors.some(s =>
                    (typeof s === 'string' ? s : s.selector) === selector
                );
                if (alreadyExists) {
                    alert('This selector is already in the list');
                    return;
                }

                currentSelectors.push({ name: name, selector: selector });
                chrome.storage.sync.set({ [storageKey]: currentSelectors }, function () {
                    // The content script picks up the storage change and hides the
                    // element; ask it for the merged list (storage + session) so the
                    // popup list stays in sync.
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        if (!tabs || !tabs[0]) {
                            updateCustomElementsList(siteIdentifier, currentSelectors);
                            return;
                        }
                        chrome.tabs.sendMessage(tabs[0].id, { type: 'getSessionOverrides' }, function (response) {
                            if (chrome.runtime.lastError || !response || !Array.isArray(response.customSelectors)) {
                                updateCustomElementsList(siteIdentifier, currentSelectors);
                            } else {
                                updateCustomElementsList(siteIdentifier, response.customSelectors);
                            }
                        });
                    });
                });
            });
        }

        function setupCustomElementControls(siteIdentifier) {
            const platformSpecific = platformsWeTarget.includes(siteIdentifier);
            const addButtonId = platformSpecific ? `${siteIdentifier}AddElementButton` : 'genericAddElementButton';
            const addButton = document.getElementById(addButtonId);

            if (addButton) {
                addButton.addEventListener('click', function () {
                    if (isSelectionModeActive) {
                        isSelectionModeActive = false;
                        addButton.classList.remove('active');
                        addButton.textContent = 'Pick…';
                        chrome.storage.sync.set({ [`${siteIdentifier}SelectionActive`]: false });
                    } else {
                        isSelectionModeActive = true;
                        addButton.classList.add('active');
                        addButton.textContent = 'Click to hide';
                        chrome.storage.sync.set({ [`${siteIdentifier}SelectionActive`]: true });
                    }
                });
            } else { console.error("Add button not found:", addButtonId); }

            const manualAddButtonId = platformSpecific ? `${siteIdentifier}ManualAddButton` : 'genericManualAddButton';
            const manualAddButton = document.getElementById(manualAddButtonId);

            if (manualAddButton) {
                manualAddButton.addEventListener('click', function () {
                    showEditDialog(siteIdentifier, '', '', function (newName, newSelector) {
                        addCustomSelector(siteIdentifier, newName, newSelector);
                    }, { title: 'Add CSS Selector', saveLabel: 'Add', focusSelector: true });
                });
            } else { console.error("Manual add button not found:", manualAddButtonId); }
        }

        function isBlockedPageUrl(url) {
            if (typeof url !== 'string') return false;
            if (url.startsWith(chrome.runtime.getURL('blocked.html'))) return true;
            try {
                const parsed = new URL(url);
                const isExtensionPage = [
                    'chrome-extension:',
                    'moz-extension:',
                    'safari-web-extension:',
                ].includes(parsed.protocol);
                return isExtensionPage && parsed.pathname.replace(/^\/+/, '') === 'blocked.html';
            } catch {
                return false;
            }
        }

        function normalizeBlockedPageUrl(blockedPageUrl) {
            try {
                const parsed = new URL(blockedPageUrl);
                return chrome.runtime.getURL('blocked.html') + parsed.search;
            } catch {
                return blockedPageUrl;
            }
        }

        function renderBlockedPagePopup(blockedPageUrl) {
            const popupContainer = document.getElementById('popup-content');
            const delayContent = document.getElementById('delay-content');
            const saveFooter = document.getElementById('save-controls');
            const reviewPrompt = document.getElementById('reviewPrompt');
            const errorPrompt = document.getElementById('error-prompt');
            const foot = document.querySelector('footer');
            if (delayContent) delayContent.style.display = 'none';
            if (saveFooter) saveFooter.style.display = 'none';
            if (reviewPrompt) reviewPrompt.style.display = 'none';
            if (errorPrompt) errorPrompt.style.display = 'none';
            if (foot) foot.style.display = 'none';
            document.body.classList.add('popup-showing-blocked-page');

            popupContainer.innerHTML = '';
            popupContainer.classList.add('blocked-page-popup');
            popupContainer.style.display = 'block';

            const frame = document.createElement('iframe');
            frame.className = 'blocked-page-frame';
            frame.title = 'Blocked by Digital Habits: Blocker';
            try {
                const frameUrl = new URL(normalizeBlockedPageUrl(blockedPageUrl));
                frameUrl.searchParams.set('popup', '1');
                frame.src = frameUrl.toString();
            } catch {
                frame.src = blockedPageUrl;
            }
            popupContainer.appendChild(frame);
            dismissPopupLoading();
        }

        function showUnsupportedPageMessage(message) {
            const popupContent = document.getElementById('popup-content');
            const delayContent = document.getElementById('delay-content');
            const errorContainer = document.getElementById('error-prompt');
            // Hide the "needs to initialise" fallback — this is an intentional unsupported-page state.
            if (errorContainer) errorContainer.style.display = 'none';
            if (popupContent) {
                popupContent.innerHTML = `<p class='error-message'>${message}</p>`;
                popupContent.style.display = 'block';
            }
            if (delayContent) delayContent.style.display = 'none';
            dismissPopupLoading();
        }

        chrome.tabs.query({ active: true, currentWindow: true }, function (tab) {
            if (chrome.runtime.lastError || !tab || tab.length === 0 || !tab[0].url) {
                console.error("Could not get active tab information.");
                showUnsupportedPageMessage('Could not get tab information. Try reloading the page.');
                return;
            }

            let currentURL;
            try {
                currentURL = new URL(tab[0].url);
            } catch (e) {
                console.warn("Invalid URL:", tab[0].url);
                showUnsupportedPageMessage(`Cannot run on this page (${tab[0].url.split('/')[0]}...).`);
                return;
            }

            if (isBlockedPageUrl(tab[0].url)) {
                renderBlockedPagePopup(tab[0].url);
                return;
            }

            // Extension pages aren't sites (Safari uses the extension UUID as hostname).
            if (/^(chrome|chrome-extension|moz-extension|safari-web-extension|about):/.test(currentURL.protocol)) {
                showUnsupportedPageMessage('Open a website tab to use Digital Habits: Focus.');
                return;
            }

            const currentHost = currentURL.hostname;
            currentPageHostname = currentHost;
            const displayHost = currentHost.replace(/^www\./, '');
            const currentSiteNameEl = document.getElementById('currentSiteName');
            if (currentSiteNameEl) currentSiteNameEl.textContent = displayHost;
            const currentSiteNameModalEl = document.getElementById('currentSiteNameModal');
            if (currentSiteNameModalEl) currentSiteNameModalEl.textContent = displayHost;

            // Precisely identify the platform using the shared platformHostnames map
            for (const platform in platformHostnames) {
                if (platformHostnames[platform].includes(currentHost)) {
                    currentPlatform = platform;
                    break; // Found it
                }
            }

            // If a platform was matched, use its name as the identifier.
            if (currentPlatform) {
                currentSiteIdentifier = currentPlatform;
            }

            if (currentPlatform) {
                document.querySelector('.dropdown.' + currentPlatform).classList.add('shown');
                const websiteToggles = document.getElementById('website-toggles');
                if (websiteToggles) websiteToggles.style.display = 'none';
                document.getElementById('generic-site-options').style.display = 'none';
                document.getElementById('currentSiteInfo').style.display = 'block';

                setSwitch(currentPlatform, currentPlatform + "Switch");
                setupPlatformSwitchListener(currentPlatform);

                setupCustomElementControls(currentPlatform);
                const storageKey = `${currentPlatform}CustomHiddenElements`;
                chrome.storage.sync.get(storageKey, function (result) {
                    updateCustomElementsList(currentPlatform, result[storageKey] || []);
                });

            } else if (currentHost) {
                currentSiteIdentifier = currentHost;
                const websiteToggles = document.getElementById('website-toggles');
                if (websiteToggles) websiteToggles.style.display = 'none';
                document.getElementById('generic-site-options').style.display = 'block';
                document.getElementById('currentSiteInfo').style.display = 'block';

                setupCustomElementControls(currentSiteIdentifier);
                const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
                chrome.storage.sync.get(storageKey, function (result) {
                    updateCustomElementsList(currentSiteIdentifier, result[storageKey] || []);
                });

                platformsWeTarget.forEach(p => {
                    const dropdown = document.querySelector(`.dropdown.${p}`);
                    if (dropdown) dropdown.classList.remove('shown');
                });

            } else {
                showUnsupportedPageMessage(`Extension cannot modify this page (${currentURL.protocol}//...).`);
            }

            if (currentSiteIdentifier) {
                setupFrictionDelay(currentSiteIdentifier);
                setupGrayscaleToggle(currentSiteIdentifier);
                setupCustomSectionCollapse(currentSiteIdentifier);
                setupSettingsLock(currentSiteIdentifier);
                initializePopupUI();
            }

            // Setup Remember settings UI now that we know the site identifier
            const rememberToggle = document.getElementById('rememberSettingsToggle');
            const saveFooter = document.getElementById('save-controls');
            const saveBtn = document.getElementById('saveButton');
            const saveStatus = document.getElementById('saveStatus');
            if (rememberToggle && saveFooter) {
                rememberToggle.addEventListener('change', function () {
                    rememberSettingsEnabled = rememberToggle.checked;
                    updateSaveFooterVisibility();
                    let obj = {};
                    obj[`${currentSiteIdentifier}RememberSettings`] = rememberSettingsEnabled;
                    chrome.storage.sync.set(obj);
                    if (!rememberSettingsEnabled) {
                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            if (!tabs || !tabs[0]) return;
                            chrome.tabs.sendMessage(tabs[0].id, { type: 'getSessionOverrides' }, function (response) {
                                if (response && response.overrides) {
                                    applyOverridesToUI(response.overrides);
                                }
                                if (isSettingsLocked) {
                                    setTimeout(function () {
                                        captureProtectedHiddenSnapshot();
                                        updateLockProtectedUI();
                                    }, 50);
                                }
                                // Also update custom elements list with session selectors
                                if (response && response.customSelectors && Array.isArray(response.customSelectors)) {
                                    updateCustomElementsList(currentSiteIdentifier, response.customSelectors);
                                }
                            });
                        });
                    }
                });
                if (saveBtn) {
                    saveBtn.addEventListener('click', function () {
                        const originalLabel = saveBtn.textContent;
                        saveBtn.textContent = 'Saving...';
                        saveBtn.disabled = true;

                        // Ask content script for current session overrides and persist them
                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            if (!tabs || !tabs[0]) {
                                saveBtn.textContent = 'Save as default';
                                saveBtn.disabled = false;
                                return;
                            }
                            chrome.tabs.sendMessage(tabs[0].id, { type: 'getSessionOverrides' }, function (response) {
                                if (!response) {
                                    saveBtn.textContent = originalLabel;
                                    saveBtn.disabled = false;
                                    return;
                                }
                                const toSet = {};
                                if (response.overrides) {
                                    Object.keys(response.overrides).forEach(k => { toSet[k] = response.overrides[k]; });
                                }
                                const writes = [];
                                if (Object.keys(toSet).length > 0) { writes.push(chrome.storage.sync.set(toSet)); }
                                if (response.customSelectors && Array.isArray(response.customSelectors)) {
                                    const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
                                    const obj = {}; obj[customKey] = response.customSelectors; writes.push(chrome.storage.sync.set(obj));
                                }
                                Promise.all(writes).then(() => {
                                    // Clear session selectors since they're now saved to storage
                                    chrome.tabs.sendMessage(tabs[0].id, { type: 'clearSessionSelectors' });

                                    saveBtn.textContent = 'Saved!';
                                    saveBtn.classList.add('is-success');
                                    setTimeout(() => {
                                        saveBtn.textContent = originalLabel;
                                        saveBtn.classList.remove('is-success');
                                        saveBtn.disabled = false;
                                    }, 1000);
                                }).catch(() => {
                                    saveBtn.textContent = originalLabel;
                                    saveBtn.disabled = false;
                                });
                            });
                        });
                    });
                }
            }
        });

        function applyOverridesToUI(overrides) {
            if (!overrides) return;
            // Apply grayscale override (available on all sites)
            const grayscaleKey = `${currentSiteIdentifier}GrayscaleStatus`;
            if (Object.prototype.hasOwnProperty.call(overrides, grayscaleKey)) {
                const grayscaleToggle = document.getElementById('grayscaleToggle');
                if (grayscaleToggle) grayscaleToggle.checked = overrides[grayscaleKey] === true;
            }
            const accessDelayKey = `${currentSiteIdentifier}AccessDelayStatus`;
            if (Object.prototype.hasOwnProperty.call(overrides, accessDelayKey)) {
                const accessDelayToggle = document.getElementById('accessDelayToggle');
                if (accessDelayToggle) {
                    accessDelayToggle.checked = overrides[accessDelayKey] === true;
                    updateAccessDelaySuffixVisibility();
                }
            }
            const redirectUrlKey = `${currentSiteIdentifier}RedirectUrl`;
            if (Object.prototype.hasOwnProperty.call(overrides, redirectUrlKey)) {
                const redirectUrlInput = document.getElementById('redirectUrl');
                if (redirectUrlInput && typeof overrides[redirectUrlKey] === 'string') {
                    redirectUrlInput.value = overrides[redirectUrlKey];
                }
            }
            const redirectKey = `${currentSiteIdentifier}RedirectStatus`;
            if (Object.prototype.hasOwnProperty.call(overrides, redirectKey)) {
                const redirectToggle = document.getElementById('redirectToggle');
                if (redirectToggle) {
                    redirectToggle.checked = overrides[redirectKey] === true;
                    updateRedirectDetailsVisibility();
                }
                if (overrides[redirectKey] !== true) {
                    const redirectUrlInput = document.getElementById('redirectUrl');
                    if (redirectUrlInput && !Object.prototype.hasOwnProperty.call(overrides, redirectUrlKey)) {
                        redirectUrlInput.value = '';
                    }
                }
            }
            // Apply platform status override
            if (currentPlatform) {
                const platformKey = `${currentPlatform}Status`;
                if (Object.prototype.hasOwnProperty.call(overrides, platformKey)) {
                    const platformSwitch = document.querySelector('#website-toggles #toggle-' + currentPlatform + ' input');
                    if (platformSwitch) platformSwitch.checked = overrides[platformKey] !== false;
                }
                // Apply element overrides
                elementsThatCanBeHidden.filter(e => e.startsWith(currentPlatform)).forEach(item => {
                    const statusKey = item + 'Status';
                    if (!Object.prototype.hasOwnProperty.call(overrides, statusKey)) return;
                    const toggleEl = document.getElementById(item + 'Toggle');
                    if (!toggleEl) return;
                    if (toggleEl.tagName === 'BUTTON') {
                        let state = overrides[statusKey] || 'On';
                        toggleEl.setAttribute('data-state', state);
                    } else if (toggleEl.type === 'checkbox') {
                        toggleEl.checked = !!overrides[statusKey];
                    }
                });
            }
        }

        function delay(time) {
            return new Promise(resolve => setTimeout(resolve, time));
        }

        function setupAccordion(triggerId, contentId, arrowRightId, arrowDownId) {
            const trigger = document.querySelector(triggerId);
            const content = document.querySelector(contentId);
            const arrowRight = document.querySelector(arrowRightId);
            const arrowDown = document.querySelector(arrowDownId);
            const previewsText = trigger && trigger.querySelector('.previews-text');

            if (!trigger || !content || !arrowRight || !arrowDown || !previewsText) return;

            const headerBtn = document.createElement('button');
            headerBtn.type = 'button';
            headerBtn.className = 'preview-accordion-trigger';
            headerBtn.setAttribute('aria-controls', content.id);
            headerBtn.setAttribute('aria-expanded', content.style.display === 'none' ? 'false' : 'true');

            headerBtn.appendChild(arrowRight);
            headerBtn.appendChild(arrowDown);
            headerBtn.appendChild(previewsText);
            trigger.insertBefore(headerBtn, content);

            function toggleAccordion() {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                arrowRight.style.display = isHidden ? 'none' : 'flex';
                arrowDown.style.display = isHidden ? 'flex' : 'none';
                headerBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            }

            headerBtn.addEventListener('click', toggleAccordion);
        }

        function setupHelpAndFAQ() {
            const helpBtn = document.getElementById('help-icon-btn');
            const faqDropdown = document.getElementById('faq-dropdown');
            const faqOverlay = document.getElementById('faq-overlay'); // Get the overlay
            const faqItems = document.querySelectorAll('.faq-item');

            // Make sure all elements exist
            if (!helpBtn || !faqDropdown || !faqOverlay) return;

            const versionEl = document.getElementById('settings-app-version');
            if (versionEl && chrome.runtime.getManifest) {
                versionEl.textContent = 'Version ' + chrome.runtime.getManifest().version;
            }

            // Toggle FAQ dropdown and overlay visibility
            helpBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const isVisible = faqDropdown.style.display === 'block';
                if (isVisible) {
                    closeSettingsPanel();
                } else {
                    openSettingsPanel();
                }
            });



            // Handle accordion items (no change here)
            faqItems.forEach(item => {
                const trigger = item.querySelector('.faq-trigger');
                if (trigger) {
                    trigger.addEventListener('click', () => {
                        const isOpen = item.dataset.state === 'open';
                        item.dataset.state = isOpen ? 'closed' : 'open';
                    });
                }
            });

            const firstFaqItem = document.querySelector('.settings-panel-faq .faq-item');
            if (firstFaqItem) {
                firstFaqItem.querySelectorAll('.faq-content a').forEach(function (link) {
                    link.tabIndex = -1;
                });
            }

            // handle the close button
            const closeBtn = document.getElementById('faq-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    closeSettingsPanel();
                });
            }

            // Close dropdown and overlay if clicking outside
            document.addEventListener('click', (event) => {
                if (!faqDropdown.contains(event.target) && !helpBtn.contains(event.target)) {
                    if (faqDropdown.style.display === 'block') {
                        closeSettingsPanel();
                    }
                }
            });
        }

        function setupButtonEnterKeyActivation() {
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter') return;
                const el = e.target;
                if (!(el instanceof HTMLButtonElement) || el.disabled) return;
                e.preventDefault();
                el.click();
            });
            document.addEventListener('keyup', function (e) {
                if (e.key !== 'Enter') return;
                if (e.target instanceof HTMLButtonElement) {
                    e.preventDefault();
                }
            });
        }

        // Setup all interactive elements at the end
        setupButtonEnterKeyActivation();
        setupHelpAndFAQ();
        setupAccordion('#hide-previews', '#how-to-description', '#how-to-arrow-right', '#how-to-arrow-down');
        setupAccordion('#hide-previews-not-mobile', '#how-to-description-not-mobile', '#how-to-arrow-right-not-mobile', '#how-to-arrow-down-not-mobile');

        // Listen for storage changes to update UI automatically
        chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace === 'sync' && currentSiteIdentifier) {
                if (Object.keys(changes).some(function (key) {
                    return key.endsWith('RedirectStatus') || key.endsWith('RedirectUrl');
                })) {
                    refreshRedirectRulesToCurrentSiteList();
                }

                // Check for custom element changes
                const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
                if (changes[customStorageKey]) {
                    const newSelectors = changes[customStorageKey].newValue || [];
                    updateCustomElementsList(currentSiteIdentifier, newSelectors);
                }

                // Check for selection state changes
                const selectionKey = `${currentSiteIdentifier}SelectionActive`;
                if (changes[selectionKey]) {
                    const isActive = changes[selectionKey].newValue === true;
                    isSelectionModeActive = isActive;

                    // Update button state
                    const addButtonId = currentPlatform ? `${currentSiteIdentifier}AddElementButton` : 'genericAddElementButton';
                    const addButton = document.getElementById(addButtonId);
                    if (addButton) {
                        if (isActive) {
                            addButton.classList.add('active');
                            addButton.textContent = 'Click to hide';
                        } else {
                            addButton.classList.remove('active');
                            addButton.textContent = 'Pick…';
                        }
                    }
                }
            }
        });

        // Listen for session-only selector changes from content script
        // This handles the case when auto-save is disabled but elements are being hidden
        chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
            if (message && message.type === 'sessionSelectorsChanged') {
                // Only update if the message is for the current site
                if (currentSiteIdentifier && message.siteIdentifier === currentSiteIdentifier) {
                    console.log('Session selectors changed, updating list:', message.selectors);
                    updateCustomElementsList(currentSiteIdentifier, message.selectors || []);
                }
            }
        });
        }

        chrome.storage.local.get(EULA_STORAGE_KEY, function (result) {
            const data = result[EULA_STORAGE_KEY];
            if (data && data.acceptedRevision === CURRENT_EULA_REVISION) {
                runMain();
            } else {
                showEulaOverlayThen(runMain);
            }
        });
    }
}, false);
