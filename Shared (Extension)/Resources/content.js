(function () {

    // --- All helper functions are defined first, making them available to the entire script ---
    // ReDD design language (light / dark surfaces) — align with design-language/redd-design-tokens.json
    const REDD = {
        canvas: '#faf8f5',
        navy: '#1e2d3e',
        body: '#2c2c35',
        muted: '#696977',
        borderSubtle: '#e1dcd6',
        teal: '#2a9d8f',
        tealHover: '#248a7e',
        card: '#ffffff',
        tealSoft: '#e5f5f3',
        dark: {
            surface: 'rgba(30, 41, 59, 0.96)',
            text: '#f1f5f9',
            border: 'rgba(51, 65, 85, 0.8)',
            teal: '#3dbfb0',
            tealHover: '#2a9d8f',
            selectorTipBg: 'rgba(15, 23, 42, 0.98)',
        },
    };

    const shadowSelectors = {
        "redditPopular": "left-nav-top-section",
        "redditChat": "left-nav-top-section",
        // LinkedIn messaging overlay (unread chip) lives under open shadow DOM on this host
        "linkedinNotifications": "#interop-outlet",
    };

    function createStyleElement(some_style_id, some_css) {
        const elementToHide = some_style_id.replace("Style", "");

        // Helper function to inject or update a style element in a given root
        function injectStyle(root, styleId, css) {
            if (!root) return;
            let styleElement = root.querySelector("#" + styleId);
            if (!styleElement) {
                styleElement = document.createElement("style");
                styleElement.id = styleId;
                styleElement.textContent = css;
                root.appendChild(styleElement);
            } else {
                if (styleElement.textContent !== css) {
                    styleElement.textContent = css;
                }
            }
        }

        // document.head may not exist yet at document_start
        const styleRoot = document.head || document.documentElement;
        injectStyle(styleRoot, some_style_id, some_css);

        // Additionally inject into shadow root if element is in shadowSelectors
        if (elementToHide in shadowSelectors) {
            const shadowHostSelector = shadowSelectors[elementToHide];
            const shadowHost = document.querySelector(shadowHostSelector);
            if (shadowHost && shadowHost.shadowRoot) {
                // Use a different ID for shadow root to avoid conflicts
                injectStyle(shadowHost.shadowRoot, some_style_id + "-shadow", some_css);
            }
        }
    }

    function generateCSSSelector(el) {
        if (!(el instanceof Element)) return null;
        if (el.id) {
            const idSelector = `#${CSS.escape(el.id)}`;
            try {
                if (document.querySelectorAll(idSelector).length === 1) return idSelector;
            } catch (e) { }
        }
        let path = [];
        let currentEl = el;
        while (currentEl && currentEl !== document.documentElement && currentEl !== document.body) {
            let selector = currentEl.nodeName.toLowerCase();
            let parent = currentEl.parentElement;
            if (!parent) break;
            let index = 1;
            let sibling = currentEl.previousElementSibling;
            while (sibling) {
                if (sibling.nodeName.toLowerCase() === selector) index++;
                sibling = sibling.previousElementSibling;
            }
            if (index > 1) {
                let ofTypeIndex = 1;
                let ofTypeSibling = currentEl.previousElementSibling;
                while (ofTypeSibling) {
                    if (ofTypeSibling.nodeName.toLowerCase() === selector) ofTypeIndex++;
                    ofTypeSibling = ofTypeSibling.previousElementSibling;
                }
                selector += (ofTypeIndex === index) ? `:nth-of-type(${index})` : `:nth-child(${index})`;
            } else {
                let nextSibling = currentEl.nextElementSibling;
                let hasSimilarNext = false;
                while (nextSibling) {
                    if (nextSibling.nodeName.toLowerCase() === selector) {
                        hasSimilarNext = true;
                        break;
                    }
                    nextSibling = nextSibling.nextElementSibling;
                }
                if (hasSimilarNext) selector += ':nth-of-type(1)';
            }
            path.unshift(selector);
            currentEl = parent;
        }
        if (path.length === 0) return null;
        const fullPath = path.join(' > ');
        try {
            const elements = document.querySelectorAll(fullPath);
            if (elements.length !== 1) {
                const bodyPath = `body > ${fullPath}`;
                if (document.querySelectorAll(bodyPath).length === 1) return bodyPath;
            }
            return fullPath;
        } catch (e) {
            console.error("Error validating generated selector:", fullPath, e);
            return null;
        }
    }

    let isSelecting = false;
    let highlightOverlay = null;
    let selectionCaptureLayer = null;
    let selectorDisplay = null;
    let feedbackContainer = null;
    let currentHighlightedElement = null;
    let lastTapTime = 0;
    let sessionHiddenSelectors = [];
    // Expose session-only selectors so other parts can read/merge
    window.__vfSessionCustomSelectors = sessionHiddenSelectors;
    const highlightStyleId = 'mindshield-highlight-style';
    let currentTheme = 'light';

    function updateTheme() {
        chrome.storage.sync.get('themePreference', (result) => {
            const pref = result.themePreference || 'system';
            if (pref === 'dark') {
                currentTheme = 'dark';
            } else if (pref === 'light') {
                currentTheme = 'light';
            } else {
                currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            if (feedbackContainer) {
                // Refresh colors if already visible
                const currentMsg = feedbackContainer.querySelector('span')?.textContent || 'Click element to hide it';
                const hasUndo = !!feedbackContainer.querySelector('button:nth-of-type(1)');
                const countMatch = currentMsg.match(/(\d+) elements? hidden/);
                const count = countMatch ? parseInt(countMatch[1]) : null;
                const isSessionOnly = currentMsg.includes('(session only)');
                updateFeedbackMessage('Click element to hide it', hasUndo, count, isSessionOnly);
            }
        });
    }

    // Initialize theme
    updateTheme();

    // Listen for theme changes specifically
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);

    function getMountParent() {
        // Content script runs at document_start; body can be missing briefly (and on some SPA navigations).
        return document.body || document.documentElement;
    }

    function ensureMounted(el) {
        const parent = getMountParent();
        if (!parent || !el) return false;
        if (el.parentNode !== parent) {
            parent.appendChild(el);
        }
        return true;
    }

    function createHighlightOverlay() {
        if (!highlightOverlay) {
            highlightOverlay = document.createElement('div');
            highlightOverlay.style.position = 'absolute';
            highlightOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            highlightOverlay.style.border = '1px dashed red';
            highlightOverlay.style.zIndex = '2147483646';
            highlightOverlay.style.pointerEvents = 'none';
            highlightOverlay.style.margin = '0';
            highlightOverlay.style.padding = '0';
            highlightOverlay.style.boxSizing = 'border-box';
        }
        return ensureMounted(highlightOverlay);
    }

    function createSelectionCaptureLayer() {
        if (!selectionCaptureLayer) {
            selectionCaptureLayer = document.createElement('div');
            selectionCaptureLayer.id = 'mindshield-selection-capture-layer';
            selectionCaptureLayer.style.position = 'fixed';
            selectionCaptureLayer.style.inset = '0';
            selectionCaptureLayer.style.zIndex = '2147483645';
            selectionCaptureLayer.style.background = 'transparent';
            selectionCaptureLayer.style.cursor = 'crosshair';
            selectionCaptureLayer.style.touchAction = 'auto';
        }
        return ensureMounted(selectionCaptureLayer);
    }

    function getEventClientPosition(event) {
        if (event.touches && event.touches.length > 0) {
            return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }
        if (event.changedTouches && event.changedTouches.length > 0) {
            return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
        }
        if (event.clientX !== undefined && event.clientY !== undefined) {
            return { x: event.clientX, y: event.clientY };
        }
        return null;
    }

    function getUnderlyingElementFromPosition(clientX, clientY) {
        if (!selectionCaptureLayer) {
            return document.elementFromPoint(clientX, clientY);
        }

        const previousPointerEvents = selectionCaptureLayer.style.pointerEvents;
        selectionCaptureLayer.style.pointerEvents = 'none';
        const el = document.elementFromPoint(clientX, clientY);
        selectionCaptureLayer.style.pointerEvents = previousPointerEvents || 'auto';
        return el;
    }

    function createSelectorDisplay() {
        if (!selectorDisplay) {
            selectorDisplay = document.createElement('div');
            selectorDisplay.style.position = 'fixed';
            selectorDisplay.style.background = currentTheme === 'dark' ? REDD.dark.selectorTipBg : 'rgba(255, 255, 255, 0.97)';
            selectorDisplay.style.color = currentTheme === 'dark' ? REDD.dark.text : REDD.navy;
            selectorDisplay.style.padding = '4px 8px';
            selectorDisplay.style.borderRadius = '8px';
            selectorDisplay.style.border = currentTheme === 'dark' ? `1px solid ${REDD.dark.border}` : `1px solid ${REDD.borderSubtle}`;
            selectorDisplay.style.zIndex = '2147483647';
            selectorDisplay.style.fontSize = '11px';
            selectorDisplay.style.fontFamily = 'monospace';
            selectorDisplay.style.pointerEvents = 'none';
            selectorDisplay.style.maxWidth = '300px';
            selectorDisplay.style.whiteSpace = 'nowrap';
            selectorDisplay.style.overflow = 'hidden';
            selectorDisplay.style.textOverflow = 'ellipsis';
            selectorDisplay.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)';
            selectorDisplay.style.backdropFilter = 'blur(4px)';
        }
        return ensureMounted(selectorDisplay);
    }

    function createFeedbackContainer() {
        if (!feedbackContainer) {
            feedbackContainer = document.createElement('div');
            feedbackContainer.id = 'mindshield-feedback-container';
            feedbackContainer.style.position = 'fixed';
            feedbackContainer.style.top = '100px';
            feedbackContainer.style.left = '10px';
            // Use theme colors
            feedbackContainer.style.background = currentTheme === 'dark' ? REDD.dark.surface : REDD.card;
            feedbackContainer.style.color = currentTheme === 'dark' ? REDD.dark.text : REDD.navy;
            feedbackContainer.style.padding = '10px 14px';
            feedbackContainer.style.borderRadius = '12px';

            const accentColor = currentTheme === 'dark' ? REDD.dark.teal : REDD.teal;
            feedbackContainer.style.border = currentTheme === 'dark' ? `1px solid ${REDD.dark.border}` : `1px solid ${REDD.borderSubtle}`;
            feedbackContainer.style.borderTop = `3px solid ${accentColor}`;

            feedbackContainer.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)';
            feedbackContainer.style.backdropFilter = 'blur(8px)';
            feedbackContainer.style.zIndex = '2147483647';
            feedbackContainer.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif';
            feedbackContainer.style.fontSize = '13px';
            feedbackContainer.style.display = 'flex';
            feedbackContainer.style.alignItems = 'center';
            feedbackContainer.style.gap = '8px';
            feedbackContainer.style.cursor = 'move';
            feedbackContainer.style.userSelect = 'none';
            feedbackContainer.style.minWidth = '230px';
            feedbackContainer.style.maxWidth = '400px';
            feedbackContainer.style.flexWrap = 'nowrap';
            feedbackContainer.style.transition = 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease';
        }
        if (!ensureMounted(feedbackContainer)) {
            return false;
        }
        if (feedbackContainer.dataset.reddInitialized === '1') {
            return true;
        }
        feedbackContainer.dataset.reddInitialized = '1';
        // Get initial count if elements are already hidden
        if (currentSiteIdentifier) {
            const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
            const rememberKey = `${currentSiteIdentifier}RememberSettings`;
            chrome.storage.sync.get([customStorageKey, rememberKey], function (result) {
                let customSelectors = result[customStorageKey] || [];
                if (!Array.isArray(customSelectors)) customSelectors = [];
                const rememberEnabled = result[rememberKey] !== false;
                const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                updateFeedbackMessage('Click element to hide it', merged.length > 0, merged.length, !rememberEnabled);
            });
        } else {
            updateFeedbackMessage('Click element to hide it');
        }
        setupDragEvents();
        return true;
    }

    let cleanupDragEvents = null;

    function setupDragEvents() {
        if (cleanupDragEvents) {
            cleanupDragEvents();
        }

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        const dragTarget = feedbackContainer;
        if (!dragTarget) return;

        function startDragging(e) {
            if (!feedbackContainer) return;
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            initialX = (e.clientX || e.touches[0].clientX) - currentX;
            initialY = (e.clientY || e.touches[0].clientY) - currentY;
            isDragging = true;
            feedbackContainer.style.transition = 'none';
        }

        function drag(e) {
            if (!isDragging || !feedbackContainer) return;
            e.preventDefault();
            let clientX = e.clientX || (e.touches && e.touches[0].clientX);
            let clientY = e.clientY || (e.touches && e.touches[0].clientY);
            currentX = clientX - initialX;
            currentY = clientY - initialY;
            currentX = Math.max(0, Math.min(currentX, window.innerWidth - feedbackContainer.offsetWidth));
            currentY = Math.max(0, Math.min(currentY, window.innerHeight - feedbackContainer.offsetHeight));
            feedbackContainer.style.left = `${currentX}px`;
            feedbackContainer.style.top = `${currentY}px`;
        }

        function stopDragging() {
            isDragging = false;
            if (feedbackContainer) {
                feedbackContainer.style.transition = 'all 0.2s ease';
            }
        }

        currentX = parseInt(dragTarget.style.left) || 10;
        currentY = parseInt(dragTarget.style.top) || 10;
        dragTarget.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
        dragTarget.addEventListener('touchstart', startDragging, { passive: false });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDragging);

        cleanupDragEvents = () => {
            dragTarget.removeEventListener('mousedown', startDragging);
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDragging);
            dragTarget.removeEventListener('touchstart', startDragging);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', stopDragging);
            cleanupDragEvents = null;
        };
    }

    function styleFeedbackButton(button, variant = 'primary') {
        button.style.borderRadius = '9999px';
        button.style.padding = '4px 12px';
        button.style.fontSize = '12px';
        button.style.fontWeight = '500';
        button.style.lineHeight = '1.4';
        button.style.borderWidth = '1px';
        button.style.borderStyle = 'solid';
        button.style.cursor = 'pointer';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.gap = '4px';
        button.style.backgroundClip = 'padding-box';
        button.style.transition = 'all 0.15s ease';

        if (variant === 'secondary') {
            // Mirror the "secondary" style from popup
            if (currentTheme === 'dark') {
                button.style.background = 'rgba(241, 245, 249, 0.05)';
                button.style.color = '#94a3b8';
                button.style.borderColor = 'rgba(241, 245, 249, 0.1)';
            } else {
                button.style.background = 'rgba(30, 45, 62, 0.05)';
                button.style.color = REDD.muted;
                button.style.borderColor = 'rgba(30, 45, 62, 0.12)';
            }
        } else {
            // Primary: brand teal (Done, etc.)
            if (currentTheme === 'dark') {
                button.style.background = REDD.dark.teal;
                button.style.color = '#ffffff';
                button.style.borderColor = REDD.dark.teal;
            } else {
                button.style.background = REDD.teal;
                button.style.color = '#ffffff';
                button.style.borderColor = REDD.teal;
            }
        }

        button.addEventListener('mouseenter', () => {
            if (variant === 'secondary') {
                if (currentTheme === 'dark') {
                    button.style.background = 'rgba(241, 245, 249, 0.1)';
                } else {
                    button.style.background = 'rgba(30, 45, 62, 0.08)';
                }
            } else {
                if (currentTheme === 'dark') {
                    button.style.background = REDD.dark.tealHover;
                    button.style.borderColor = REDD.dark.tealHover;
                } else {
                    button.style.background = REDD.tealHover;
                    button.style.borderColor = REDD.tealHover;
                }
            }
        });

        button.addEventListener('mouseleave', () => {
            if (variant === 'secondary') {
                if (currentTheme === 'dark') {
                    button.style.background = 'rgba(241, 245, 249, 0.05)';
                } else {
                    button.style.background = 'rgba(30, 45, 62, 0.05)';
                }
            } else {
                if (currentTheme === 'dark') {
                    button.style.background = REDD.dark.teal;
                    button.style.borderColor = REDD.dark.teal;
                } else {
                    button.style.background = REDD.teal;
                    button.style.borderColor = REDD.teal;
                }
            }
        });
    }

    function updateFeedbackMessage(message, showUndo = false, count = null, sessionOnly = false) {
        if (!feedbackContainer) return;
        feedbackContainer.innerHTML = '';

        let displayMessage = message;
        if (count !== null && count > 0) {
            displayMessage = `${count} ${count === 1 ? 'element' : 'elements'} hidden`;
            if (sessionOnly) {
                displayMessage += ' (session only)';
            }
        }

        const messageSpan = document.createElement('span');
        messageSpan.textContent = displayMessage;
        messageSpan.style.fontSize = '14px';
        messageSpan.style.fontWeight = '500';
        messageSpan.style.flex = '1';
        messageSpan.style.minWidth = '100px';
        messageSpan.style.color = currentTheme === 'dark' ? REDD.dark.text : REDD.navy;
        messageSpan.style.marginRight = showUndo ? '6px' : '4px';
        messageSpan.style.whiteSpace = 'nowrap';
        feedbackContainer.appendChild(messageSpan);

        if (showUndo) {
            const undoButton = document.createElement('button');
            undoButton.textContent = 'Undo';
            styleFeedbackButton(undoButton, 'secondary');
            undoButton.addEventListener('click', handleUndo);
            undoButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleUndo();
            });
            feedbackContainer.appendChild(undoButton);
        }

        const doneButton = document.createElement('button');
        doneButton.textContent = 'Done';
        styleFeedbackButton(doneButton, 'primary');
        doneButton.addEventListener('click', () => stopSelecting(false));
        doneButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            stopSelecting(false);
        });
        feedbackContainer.appendChild(doneButton);
    }

    function handleUndo() {
        if (sessionHiddenSelectors.length === 0 || !currentSiteIdentifier) return;
        const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        const rememberKey = `${currentSiteIdentifier}RememberSettings`;
        chrome.storage.sync.get([customStorageKey, rememberKey], function (result) {
            let customSelectors = result[customStorageKey] || [];
            if (!Array.isArray(customSelectors)) customSelectors = [];
            const selectorToRemove = sessionHiddenSelectors.pop();
            const rememberEnabled = result[rememberKey] !== false; // default true

            if (rememberEnabled) {
                // Remove from persistent storage if present
                customSelectors = customSelectors.filter(s => s !== selectorToRemove);
                chrome.storage.sync.set({ [customStorageKey]: customSelectors }, function () {
                    if (chrome.runtime.lastError) {
                        console.error("Error removing custom selector from storage:", chrome.runtime.lastError);
                    }
                    // Reapply merged (persistent + remaining session)
                    const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                    applyCustomElementStyles(currentSiteIdentifier, merged);
                    updateFeedbackMessage('Click element to hide it', merged.length > 0, merged.length, false);
                });
            } else {
                // Session-only: just reapply merged without touching storage
                const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                applyCustomElementStyles(currentSiteIdentifier, merged);
                updateFeedbackMessage('Click element to hide it', merged.length > 0, merged.length, true);
                // Notify popup that session selectors changed
                chrome.runtime.sendMessage({ type: 'sessionSelectorsChanged', siteIdentifier: currentSiteIdentifier, selectors: merged });
            }
        });
    }

    function startSelecting() {
        if (isSelecting) return;

        // Wait until we have a mount point (body may be null at document_start).
        if (!getMountParent()) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (!isSelecting) startSelecting();
                }, { once: true });
            }
            return;
        }

        const mounted =
            createHighlightOverlay() &&
            createSelectionCaptureLayer() &&
            createSelectorDisplay() &&
            createFeedbackContainer();

        if (!mounted || !selectionCaptureLayer) {
            // Avoid sticky isSelecting=true with no UI if mounting somehow failed.
            return;
        }

        isSelecting = true;
        selectionCaptureLayer.addEventListener('mousemove', highlightElement);
        selectionCaptureLayer.addEventListener('touchstart', highlightElement, { passive: true });
        selectionCaptureLayer.addEventListener('touchmove', highlightElement, { passive: true });
        selectionCaptureLayer.addEventListener('click', selectElementOnClick);
        selectionCaptureLayer.addEventListener('touchend', selectElementOnTap, { passive: false });
        document.addEventListener('keydown', handleKeydown, { capture: true });

        // Update storage to reflect that selection has started
        if (currentSiteIdentifier) {
            chrome.storage.sync.set({ [`${currentSiteIdentifier}SelectionActive`]: true });
        }
    }

    function stopSelecting(cancelled = false) {
        if (!isSelecting) return;
        isSelecting = false;
        selectionCaptureLayer?.removeEventListener('mousemove', highlightElement);
        selectionCaptureLayer?.removeEventListener('touchstart', highlightElement);
        selectionCaptureLayer?.removeEventListener('touchmove', highlightElement);
        selectionCaptureLayer?.removeEventListener('click', selectElementOnClick);
        selectionCaptureLayer?.removeEventListener('touchend', selectElementOnTap);
        document.removeEventListener('keydown', handleKeydown, { capture: true });
        if (cleanupDragEvents) cleanupDragEvents();
        if (selectionCaptureLayer) selectionCaptureLayer.remove();
        if (feedbackContainer) feedbackContainer.remove();
        if (highlightOverlay) highlightOverlay.remove();
        if (selectorDisplay) selectorDisplay.remove();
        const tempStyle = document.getElementById(highlightStyleId);
        if (tempStyle) tempStyle.remove();
        feedbackContainer = highlightOverlay = selectionCaptureLayer = selectorDisplay = currentHighlightedElement = null;
        // Keep sessionHiddenSelectors so session rules persist until refresh

        // Update storage to reflect that selection has stopped
        if (currentSiteIdentifier) {
            chrome.storage.sync.set({ [`${currentSiteIdentifier}SelectionActive`]: false });
        }
    }

    function handleKeydown(event) {
        if (event.key === 'Escape' && isSelecting) {
            event.preventDefault();
            event.stopImmediatePropagation();
            stopSelecting(true);
        }
    }

    function highlightElement(event) {
        if (!isSelecting) return;
        const position = getEventClientPosition(event);
        if (!position) return;

        const el = getUnderlyingElementFromPosition(position.x, position.y);
        if (!el || el === highlightOverlay || el === selectorDisplay || el.closest('#mindshield-feedback-container')) {
            if (highlightOverlay) highlightOverlay.style.display = 'none';
            if (selectorDisplay) selectorDisplay.style.display = 'none';
            currentHighlightedElement = null;
            return;
        }
        currentHighlightedElement = el;
        const selector = generateCSSSelector(el);
        const posX = position.x;
        const posY = position.y;
        if (selectorDisplay) {
            selectorDisplay.textContent = selector || "Cannot select this element";
            const displayPosX = posX + 15;
            const displayPosY = posY + 15;
            selectorDisplay.style.left = `${Math.min(displayPosX, window.innerWidth - selectorDisplay.offsetWidth - 10)}px`;
            selectorDisplay.style.top = `${Math.min(displayPosY, window.innerHeight - selectorDisplay.offsetHeight - 10)}px`;
            selectorDisplay.style.display = 'block';
        }
        if (highlightOverlay) {
            const rect = el.getBoundingClientRect();
            highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
            highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
            highlightOverlay.style.width = `${rect.width}px`;
            highlightOverlay.style.height = `${rect.height}px`;
            highlightOverlay.style.display = 'block';
        }
    }

    function selectElementOnClick(event) {
        if (Date.now() - lastTapTime < 500) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (!isSelecting) return;
        highlightElement(event);
        if (!currentHighlightedElement) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        processSelectedElement(currentHighlightedElement);
    }

    function selectElementOnTap(event) {
        lastTapTime = Date.now();
        if (!isSelecting) return;
        highlightElement(event);
        if (!currentHighlightedElement) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        processSelectedElement(currentHighlightedElement);
    }

    function processSelectedElement(el) {
        if (!el || el === document.body || el === document.documentElement) return;
        const selector = generateCSSSelector(el);
        if (!selector || !currentSiteIdentifier) {
            console.warn("Could not generate a reliable selector for the element or site identifier is missing.");
            return;
        }
        const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        const rememberKey = `${currentSiteIdentifier}RememberSettings`;
        chrome.storage.sync.get([storageKey, rememberKey], function (result) {
            let customSelectors = result[storageKey] || [];
            if (!Array.isArray(customSelectors)) customSelectors = [];
            const rememberEnabled = result[rememberKey] !== false; // default true
            const alreadyHas = customSelectors.includes(selector) || sessionHiddenSelectors.includes(selector);
            if (alreadyHas) {
                const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                updateFeedbackMessage('Element already hidden', false, merged.length, !rememberEnabled);
                return;
            }
            sessionHiddenSelectors.push(selector);
            if (rememberEnabled) {
                // Persist
                const toSave = Array.from(new Set([...customSelectors, selector]));
                chrome.storage.sync.set({ [storageKey]: toSave }, function () {
                    if (chrome.runtime.lastError) {
                        console.error("Error saving custom selectors:", chrome.runtime.lastError);
                    }
                    // Apply merged to ensure immediate effect
                    const merged = Array.from(new Set([...toSave, ...sessionHiddenSelectors]));
                    applyCustomElementStyles(currentSiteIdentifier, merged);
                    updateFeedbackMessage('Element hidden', true, merged.length, false);
                });
            } else {
                // Session only — apply without saving
                const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                applyCustomElementStyles(currentSiteIdentifier, merged);
                updateFeedbackMessage('Element hidden', true, merged.length, true);
                // Notify popup that session selectors changed
                chrome.runtime.sendMessage({ type: 'sessionSelectorsChanged', siteIdentifier: currentSiteIdentifier, selectors: merged });
            }
        });
    }

    const GRAYSCALE_STYLE_ID = 'siteGrayscaleStyle';
    const GRAYSCALE_OVERLAY_ID = 'redd-focus-grayscale-overlay';

    function ensureGrayscaleCssInjected() {
        createStyleElement(GRAYSCALE_STYLE_ID, `
            html.redd-focus-grayscale {
                -webkit-filter: grayscale(100%) !important;
                filter: grayscale(100%) !important;
            }
            #${GRAYSCALE_OVERLAY_ID} {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                pointer-events: none !important;
                z-index: 2147483646 !important;
                backdrop-filter: grayscale(100%) !important;
                -webkit-backdrop-filter: grayscale(100%) !important;
                background: transparent !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
            }
        `);
    }

    function applyGrayscaleStyle(enabled) {
        ensureGrayscaleCssInjected();
        document.documentElement.classList.toggle('redd-focus-grayscale', !!enabled);

        const mountOverlay = function () {
            let overlay = document.getElementById(GRAYSCALE_OVERLAY_ID);
            if (enabled) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = GRAYSCALE_OVERLAY_ID;
                    overlay.setAttribute('aria-hidden', 'true');
                    (document.body || document.documentElement).appendChild(overlay);
                }
            } else if (overlay) {
                overlay.remove();
            }
        };

        if (enabled && !document.body) {
            document.addEventListener('DOMContentLoaded', mountOverlay, { once: true });
        } else {
            mountOverlay();
        }
    }

    const ACCESS_DELAY_STYLE_ID = 'reddFocusAccessDelayStyle';
    const ACCESS_DELAY_OVERLAY_ID = 'redd-focus-access-delay';
    let accessDelayActive = false;
    let accessDelayTimerId = null;

    function ensureAccessDelayCssInjected() {
        createStyleElement(ACCESS_DELAY_STYLE_ID, `
            html.redd-focus-access-delaying,
            html.redd-focus-access-delaying body {
                overflow: hidden !important;
            }
            #${ACCESS_DELAY_OVERLAY_ID} {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                z-index: 2147483647 !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 24px !important;
                background: ${REDD.canvas} !important;
                color: ${REDD.body} !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
                text-align: center !important;
                opacity: 0;
                transition: opacity 0.35s ease-in-out;
            }
            #${ACCESS_DELAY_OVERLAY_ID}.show {
                opacity: 1;
            }
            #${ACCESS_DELAY_OVERLAY_ID} .redd-focus-access-delay-message {
                margin: 20px auto 10px auto !important;
                width: min(92vw, 84rem) !important;
                max-width: min(92vw, 84rem) !important;
                box-sizing: border-box !important;
                color: ${REDD.body} !important;
                font-size: clamp(2.25rem, 6.5vw, 3.5rem) !important;
                font-style: italic !important;
                font-weight: 400 !important;
                line-height: 140% !important;
                text-align: center !important;
                white-space: pre-wrap !important;
                overflow-wrap: break-word !important;
                word-wrap: break-word !important;
            }
            #${ACCESS_DELAY_OVERLAY_ID} img {
                width: min(40vw, 180px) !important;
                height: auto !important;
                margin: 40px 0 !important;
                animation: redd-focus-access-breathe 6s ease-in-out infinite;
            }
            #${ACCESS_DELAY_OVERLAY_ID} .redd-focus-access-delay-time {
                margin: 0 !important;
                color: ${REDD.muted} !important;
                font-size: 1.5em !important;
                font-weight: 600 !important;
                line-height: 1.2 !important;
            }
            @keyframes redd-focus-access-breathe {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
        `);
    }

    function endAccessDelayGate() {
        if (accessDelayTimerId) {
            clearInterval(accessDelayTimerId);
            accessDelayTimerId = null;
        }
        accessDelayActive = false;
        document.documentElement.classList.remove('redd-focus-access-delaying');
        const overlay = document.getElementById(ACCESS_DELAY_OVERLAY_ID);
        if (overlay) overlay.remove();
    }

    function startAccessDelayGate(seconds, message) {
        const countdownSeconds = Math.max(5, Math.min(600, parseInt(seconds, 10) || 10));
        const trimmed = typeof message === 'string' ? message.trim() : '';
        const delayMessage = trimmed || "What's your intention?";
        if (accessDelayActive) return;
        accessDelayActive = true;
        ensureAccessDelayCssInjected();
        document.documentElement.classList.add('redd-focus-access-delaying');

        const mountGate = function () {
            if (!accessDelayActive) return;
            let overlay = document.getElementById(ACCESS_DELAY_OVERLAY_ID);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = ACCESS_DELAY_OVERLAY_ID;
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-live', 'polite');
                overlay.setAttribute('aria-label', 'Opening site after a short delay');

                const messageEl = document.createElement('p');
                messageEl.className = 'redd-focus-access-delay-message';
                messageEl.textContent = delayMessage;
                overlay.appendChild(messageEl);

                const img = document.createElement('img');
                img.src = chrome.runtime.getURL('images/calm.svg');
                img.alt = '';
                img.setAttribute('aria-hidden', 'true');

                const timeEl = document.createElement('p');
                timeEl.className = 'redd-focus-access-delay-time';
                timeEl.textContent = String(countdownSeconds);

                overlay.appendChild(img);
                overlay.appendChild(timeEl);
                (document.body || document.documentElement).appendChild(overlay);
                requestAnimationFrame(function () {
                    overlay.classList.add('show');
                });

                let countdown = countdownSeconds;
                accessDelayTimerId = setInterval(function () {
                    countdown -= 1;
                    if (countdown >= 0) {
                        timeEl.textContent = String(countdown);
                    } else {
                        endAccessDelayGate();
                    }
                }, 1000);
            }
        };

        if (!document.body) {
            // Cover immediately even before <body> exists, then remount into body when ready.
            mountGate();
            document.addEventListener('DOMContentLoaded', function () {
                if (!accessDelayActive) return;
                const existing = document.getElementById(ACCESS_DELAY_OVERLAY_ID);
                if (existing && existing.parentElement !== document.body && document.body) {
                    document.body.appendChild(existing);
                } else if (!existing) {
                    mountGate();
                }
            }, { once: true });
        } else {
            mountGate();
        }
    }

    function maybeStartAccessDelayFromStorage() {
        if (!currentSiteIdentifier || accessDelayActive) return;
        const statusKey = `${currentSiteIdentifier}AccessDelayStatus`;
        const secondsKey = `${currentSiteIdentifier}AccessDelaySeconds`;
        const waitTextKey = `${currentSiteIdentifier}WaitText`;
        chrome.storage.sync.get([statusKey, secondsKey, waitTextKey, 'waitText'], function (result) {
            let enabled = result[statusKey] === true;
            if (Object.prototype.hasOwnProperty.call(sessionOverrides, statusKey)) {
                enabled = sessionOverrides[statusKey] === true;
            }
            if (!enabled) return;
            const seconds = result[secondsKey] !== undefined ? result[secondsKey] : 10;
            const message = result[waitTextKey] !== undefined ? result[waitTextKey] : result.waitText;
            startAccessDelayGate(seconds, message);
        });
    }

    function resolveRedirectTarget(rawInput) {
        const raw = (rawInput || '').trim();
        if (!raw) return null;

        if (/^https?:\/\//i.test(raw)) {
            try {
                return new URL(raw).href;
            } catch (e) {
                return null;
            }
        }

        if (raw.startsWith('/')) {
            try {
                return new URL(raw, window.location.origin).href;
            } catch (e) {
                return null;
            }
        }

        // Domain, domain/path, or subdomain/path without protocol
        try {
            return new URL('https://' + raw).href;
        } catch (e) {
            return null;
        }
    }

    function isAlreadyAtRedirectTarget(targetHref) {
        try {
            const target = new URL(targetHref);
            const current = window.location;
            return current.protocol === target.protocol &&
                current.hostname === target.hostname &&
                current.port === target.port &&
                current.pathname === target.pathname &&
                current.search === target.search;
        } catch (e) {
            return false;
        }
    }

    function maybeRedirectFromStorage() {
        if (!currentSiteIdentifier) return;

        const candidateIds = [currentSiteIdentifier];
        if (currentHostname) {
            const bare = currentHostname.replace(/^www\./, '');
            if (bare && candidateIds.indexOf(bare) === -1) candidateIds.push(bare);
            if (currentHostname !== bare && candidateIds.indexOf(currentHostname) === -1) {
                candidateIds.push(currentHostname);
            }
        }

        const keys = [];
        candidateIds.forEach(function (id) {
            keys.push(`${id}RedirectStatus`, `${id}RedirectUrl`);
        });

        chrome.storage.sync.get(keys, function (result) {
            let enabled = false;
            let rawUrl = '';
            for (let i = 0; i < candidateIds.length; i++) {
                const statusKey = `${candidateIds[i]}RedirectStatus`;
                const urlKey = `${candidateIds[i]}RedirectUrl`;
                let status = result[statusKey] === true;
                if (Object.prototype.hasOwnProperty.call(sessionOverrides, statusKey)) {
                    status = sessionOverrides[statusKey] === true;
                }
                if (!status) continue;
                enabled = true;
                rawUrl = typeof result[urlKey] === 'string' ? result[urlKey] : '';
                if (Object.prototype.hasOwnProperty.call(sessionOverrides, urlKey)) {
                    rawUrl = sessionOverrides[urlKey];
                }
                break;
            }

            if (!enabled) {
                maybeStartAccessDelayFromStorage();
                return;
            }

            const targetHref = resolveRedirectTarget(rawUrl);
            if (!targetHref || isAlreadyAtRedirectTarget(targetHref)) {
                maybeStartAccessDelayFromStorage();
                return;
            }

            window.location.replace(targetHref);
        });
    }

    function applyCustomElementStyles(siteIdentifier, selectors) {
        const styleId = `customHidden_${siteIdentifier.replace(/\./g, '_')}Style`;
        // Support both old format (string) and new format (object with name and selector)
        const css = selectors.length > 0 ? selectors.map(item => {
            const selector = typeof item === 'string' ? item : (item.selector || item);
            return `${selector} { display: none !important; }`;
        }).join('\n') : '';
        createStyleElement(styleId, css);
    }

    // --- Calculate site-specific identifiers ---
    let currentPlatform = null;
    const currentHostname = window.location.hostname;

    for (const platform in platformHostnames) {
        if (platformHostnames[platform].includes(currentHostname)) {
            currentPlatform = platform;
            break;
        }
    }
    const currentSiteIdentifier = currentPlatform || currentHostname;

    // Session-only overrides for this page lifetime
    let sessionOverrides = {};

    // --- Listen for storage changes to apply settings immediately ---
    let lastAppliedSettings = {};
    let lastAppliedCustomElements = {};

    function applySettingsFromStorage() {
        if (!chrome.runtime?.id) // don't run if disconnected
            return;

        if (currentPlatform) {
            const platformStatusKey = `${currentPlatform}Status`;
            chrome.storage.sync.get(platformStatusKey, function (platformResult) {
                let platformIsOn = platformResult[platformStatusKey] !== false;
                if (Object.prototype.hasOwnProperty.call(sessionOverrides, platformStatusKey)) {
                    platformIsOn = sessionOverrides[platformStatusKey] !== false;
                }

                elementsThatCanBeHidden
                    .filter(element => element.startsWith(currentPlatform))
                    .forEach(function (item) {
                        const styleName = item + "Style";
                        const itemStatusKey = item + "Status";

                        // Check if we need to update this element
                        let currentSetting = platformIsOn ? (lastAppliedSettings[item] || "default") : "platformDisabled";

                        // For multi-state elements, we need to get the actual stored value
                        if (platformIsOn && item === "youtubeThumbnails") {
                            chrome.storage.sync.get(itemStatusKey, function (itemResult) {
                                let statusValue = itemResult[itemStatusKey];
                                if (Object.prototype.hasOwnProperty.call(sessionOverrides, itemStatusKey)) {
                                    statusValue = sessionOverrides[itemStatusKey];
                                }
                                let newSetting = statusValue || "On";

                                if (currentSetting !== newSetting) {
                                    let cssToApply = cssSelectors[item + "Css" + newSetting];
                                    lastAppliedSettings[item] = newSetting;
                                    createStyleElement(styleName, cssToApply);
                                }
                            });
                        } else {
                            let storedDefault = platformResult[itemStatusKey];
                            if (Object.prototype.hasOwnProperty.call(sessionOverrides, itemStatusKey)) {
                                storedDefault = sessionOverrides[itemStatusKey];
                            }
                            let newSetting = platformIsOn ? (storedDefault || "On") : "platformDisabled";

                            if (currentSetting !== newSetting) {
                                if (!platformIsOn) {
                                    // Platform is disabled, show all elements
                                    createStyleElement(styleName, cssSelectors[item + "CssOn"]);
                                    lastAppliedSettings[item] = "platformDisabled";
                                } else {
                                    // Platform is enabled, check individual element status
                                    chrome.storage.sync.get(itemStatusKey, function (itemResult) {
                                        let statusValue = itemResult[itemStatusKey];
                                        if (Object.prototype.hasOwnProperty.call(sessionOverrides, itemStatusKey)) {
                                            statusValue = sessionOverrides[itemStatusKey];
                                        }
                                        let cssToApply;

                                        if (item === "youtubeThumbnails") {
                                            let state = statusValue || "On";
                                            cssToApply = cssSelectors[item + "Css" + state];
                                            lastAppliedSettings[item] = state;
                                        } else if (item === "linkedinFeed") {
                                            let isMainFeed = window.location.pathname === '/' || window.location.pathname === '/feed' || window.location.pathname === '/feed/';
                                            let isViewingPost = window.location.pathname.includes('/feed/update') || window.location.search.includes('highlightedUpdateUrn');

                                            if (statusValue === true) {
                                                // User wants feed Hidden
                                                if (isViewingPost) {
                                                    cssToApply = cssSelectors[item + "CssFocused"];
                                                    lastAppliedSettings[item] = "focused";
                                                } else if (isMainFeed) {
                                                    cssToApply = cssSelectors[item + "CssOff"];
                                                    lastAppliedSettings[item] = "hidden";
                                                } else {
                                                    cssToApply = cssSelectors[item + "CssOn"];
                                                    lastAppliedSettings[item] = "visible";
                                                }
                                            } else {
                                                // User wants feed Visible
                                                cssToApply = cssSelectors[item + "CssOn"];
                                                lastAppliedSettings[item] = "visible";
                                            }
                                        } else if (item === "redditFeed") {
                                            // Only hide feed on home page, not on subreddits or other pages
                                            let isHomePage = window.location.pathname === '/' ||
                                                window.location.pathname.startsWith('/r/popular') ||
                                                (window.location.pathname === '/' && window.location.search.includes('feed=home'));

                                            if (statusValue === true) {
                                                // User wants feed hidden
                                                if (isHomePage) {
                                                    cssToApply = cssSelectors[item + "CssOff"];
                                                    lastAppliedSettings[item] = "hidden";
                                                } else {
                                                    // Not on home page, show feed
                                                    cssToApply = cssSelectors[item + "CssOn"];
                                                    lastAppliedSettings[item] = "visible";
                                                }
                                            } else {
                                                // User wants feed visible
                                                cssToApply = cssSelectors[item + "CssOn"];
                                                lastAppliedSettings[item] = "visible";
                                            }
                                        } else {
                                            cssToApply = (statusValue === true) ? cssSelectors[item + "CssOff"] : cssSelectors[item + "CssOn"];
                                            lastAppliedSettings[item] = statusValue === true ? "hidden" : "visible";
                                        }
                                        createStyleElement(styleName, cssToApply);
                                    });
                                }
                            }
                        }
                    });
            });
        }

        // Also check for custom element changes
        if (currentSiteIdentifier) {
            const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customStorageKey, function (result) {
                let customSelectors = result[customStorageKey] || [];
                if (!Array.isArray(customSelectors)) customSelectors = [];
                // Merge session-only selectors for this page
                const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
                // Check if custom elements have changed
                const currentCustomElements = lastAppliedCustomElements[currentSiteIdentifier] || [];
                if (JSON.stringify(merged) !== JSON.stringify(currentCustomElements)) {
                    applyCustomElementStyles(currentSiteIdentifier, merged);
                    lastAppliedCustomElements[currentSiteIdentifier] = [...merged];
                }
            });

            // Check for selection state changes
            const selectionKey = `${currentSiteIdentifier}SelectionActive`;
            chrome.storage.sync.get(selectionKey, function (result) {
                const shouldBeSelecting = result[selectionKey] === true;
                if (shouldBeSelecting && !isSelecting) {
                    startSelecting();
                } else if (!shouldBeSelecting && isSelecting) {
                    stopSelecting(false);
                }
            });

            // Check grayscale setting
            const grayscaleStatusKey = `${currentSiteIdentifier}GrayscaleStatus`;
            chrome.storage.sync.get(grayscaleStatusKey, function (result) {
                let grayscaleEnabled = result[grayscaleStatusKey] === true;
                if (Object.prototype.hasOwnProperty.call(sessionOverrides, grayscaleStatusKey)) {
                    grayscaleEnabled = sessionOverrides[grayscaleStatusKey] === true;
                }
                applyGrayscaleStyle(grayscaleEnabled);
            });
        }
    }

    // Listen for storage changes to be responsive
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (namespace === 'sync') {
            let hasRelevantChanges = false;

            // Check platform-specific changes
            if (currentPlatform) {
                for (let key in changes) {
                    if (key === `${currentPlatform}Status` ||
                        (key.endsWith('Status') && elementsThatCanBeHidden.some(elem => elem.startsWith(currentPlatform) && elem + 'Status' === key))) {
                        hasRelevantChanges = true;
                        break;
                    }
                }
            }

            // Check custom element changes
            if (currentSiteIdentifier) {
                const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
                const selectionKey = `${currentSiteIdentifier}SelectionActive`;
                const grayscaleStatusKey = `${currentSiteIdentifier}GrayscaleStatus`;
                if (changes[customStorageKey] || changes[selectionKey] || changes[grayscaleStatusKey]) {
                    hasRelevantChanges = true;
                }
            }
            // Check for theme changes
            if (changes['themePreference']) {
                updateTheme();
            }

            if (hasRelevantChanges) {
                // Apply changes immediately
                setTimeout(applySettingsFromStorage, 100);
            }

            if (currentSiteIdentifier) {
                const grayscaleStatusKey = `${currentSiteIdentifier}GrayscaleStatus`;
                if (changes[grayscaleStatusKey]) {
                    applyGrayscaleStyle(changes[grayscaleStatusKey].newValue === true);
                }
            }
        }
    });

    // Also poll every 1 second as a safety net
    setInterval(applySettingsFromStorage, 1000);

    // --- Handle session override messages and export for Save ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.type) return;
        if (message.type === 'sessionOverride') {
            sessionOverrides[message.key] = message.value;
            if (typeof message.key === 'string' && message.key.endsWith('GrayscaleStatus')) {
                applyGrayscaleStyle(message.value === true);
            }
            setTimeout(applySettingsFromStorage, 50);
        } else if (message.type === 'setGrayscale') {
            applyGrayscaleStyle(message.enabled === true);
            sendResponse({ success: true });
        } else if (message.type === 'getSessionOverrides') {
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = Array.from(new Set([...baseSelectors, ...sessionHiddenSelectors]));
                sendResponse({ overrides: sessionOverrides, customSelectors: mergedSelectors });
            });
            return true; // async response
        } else if (message.type === 'removeSessionSelector') {
            // Remove a specific selector from session memory
            const selectorToRemove = message.selector;
            // Use findIndex to handle both string and object formats
            const index = sessionHiddenSelectors.findIndex(s =>
                (typeof s === 'string' ? s : s.selector) === selectorToRemove
            );
            if (index > -1) {
                sessionHiddenSelectors.splice(index, 1);
            }
            // Reapply styles so element immediately reappears
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = Array.from(new Set([...baseSelectors, ...sessionHiddenSelectors]));
                applyCustomElementStyles(currentSiteIdentifier, mergedSelectors);
                lastAppliedCustomElements[currentSiteIdentifier] = [...mergedSelectors];
                sendResponse({ success: true, customSelectors: mergedSelectors });
            });
            return true; // async response
        } else if (message.type === 'editSessionSelector') {
            // Edit/rename a specific selector in session memory
            const oldSelector = message.oldSelector;
            const newSelector = message.newSelector;
            const newName = message.newName;
            const index = sessionHiddenSelectors.findIndex(s =>
                (typeof s === 'string' ? s : s.selector) === oldSelector
            );
            if (index > -1) {
                // Replace with object format { name, selector }
                sessionHiddenSelectors[index] = { name: newName, selector: newSelector };
            }
            // Reapply styles with updated selectors
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = Array.from(new Set([...baseSelectors, ...sessionHiddenSelectors]));
                applyCustomElementStyles(currentSiteIdentifier, mergedSelectors);
                sendResponse({ success: true, customSelectors: mergedSelectors });
            });
            return true; // async response
        } else if (message.type === 'reapplyCustomStyles') {
            // Force immediate reapplication of custom element styles
            console.log('reapplyCustomStyles message received');
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = Array.from(new Set([...baseSelectors, ...sessionHiddenSelectors]));
                console.log('Reapplying styles with selectors:', mergedSelectors);
                applyCustomElementStyles(currentSiteIdentifier, mergedSelectors);
                lastAppliedCustomElements[currentSiteIdentifier] = [...mergedSelectors];
                sendResponse({ success: true });
            });
            return true; // async response
        } else if (message.type === 'clearSessionSelectors') {
            // Clear session selectors after saving to storage (to prevent duplicates)
            console.log('Clearing session selectors');
            sessionHiddenSelectors.length = 0; // Clear the array
            sendResponse({ success: true });
        }
    });

    // --- Perform one-time initial setup, protected by the flag ---
    if (window.hasRun) {
        console.log(`ReDD Focus listener re-established for: ${currentSiteIdentifier}. Page already initialized.`);
        return;
    }
    window.hasRun = true;

    console.log(`ReDD Focus running on: ${currentSiteIdentifier}. (Detected Platform: ${currentPlatform || 'None'})`);

    // Initial application of settings (polling will handle subsequent changes)
    if (currentPlatform) {
        const platformStatusKey = `${currentPlatform}Status`;
        chrome.storage.sync.get(platformStatusKey, function (platformResult) {
            let platformIsOn = platformResult[platformStatusKey] !== false;
            elementsThatCanBeHidden
                .filter(element => element.startsWith(currentPlatform))
                .forEach(function (item) {
                    const styleName = item + "Style";
                    const itemStatusKey = item + "Status";
                    if (!platformIsOn) {
                        createStyleElement(styleName, cssSelectors[item + "CssOn"]);
                        lastAppliedSettings[item] = "platformDisabled";
                    } else {
                        chrome.storage.sync.get(itemStatusKey, function (itemResult) {
                            let statusValue = itemResult[itemStatusKey];
                            let cssToApply;
                            if (item === "youtubeThumbnails") {
                                let state = statusValue || "On";
                                cssToApply = cssSelectors[item + "Css" + state];
                                lastAppliedSettings[item] = state;
                            } else if (item === "linkedinFeed") {
                                // 3-state logic: Hidden (Main Feed) / Focused (View Post) / Visible (User ON)
                                let isMainFeed = window.location.pathname === '/' ||
                                    window.location.pathname === '/feed' ||
                                    window.location.pathname === '/feed/';
                                let isViewingPost = window.location.pathname.includes('/feed/update') || window.location.search.includes('highlightedUpdateUrn');

                                if (statusValue === true) {
                                    if (isViewingPost) {
                                        cssToApply = cssSelectors[item + "CssFocused"];
                                        lastAppliedSettings[item] = "focused";
                                    } else if (isMainFeed) {
                                        cssToApply = cssSelectors[item + "CssOff"];
                                        lastAppliedSettings[item] = "hidden";
                                    } else {
                                        cssToApply = cssSelectors[item + "CssOn"];
                                        lastAppliedSettings[item] = "visible";
                                    }
                                } else {
                                    cssToApply = cssSelectors[item + "CssOn"];
                                    lastAppliedSettings[item] = "visible";
                                }
                            } else if (item === "redditFeed") {
                                // Only hide feed on home page, not on subreddits or other pages
                                let isHomePage = window.location.pathname === '/' ||
                                    window.location.pathname.startsWith('/r/popular') ||
                                    (window.location.pathname === '/' && window.location.search.includes('feed=home'));

                                if (statusValue === true) {
                                    // User wants feed hidden
                                    if (isHomePage) {
                                        cssToApply = cssSelectors[item + "CssOff"];
                                        lastAppliedSettings[item] = "hidden";
                                    } else {
                                        // Not on home page, show feed
                                        cssToApply = cssSelectors[item + "CssOn"];
                                        lastAppliedSettings[item] = "visible";
                                    }
                                } else {
                                    // User wants feed visible
                                    cssToApply = cssSelectors[item + "CssOn"];
                                    lastAppliedSettings[item] = "visible";
                                }
                            } else {
                                cssToApply = (statusValue === true) ? cssSelectors[item + "CssOff"] : cssSelectors[item + "CssOn"];
                                lastAppliedSettings[item] = statusValue === true ? "hidden" : "visible";
                            }
                            createStyleElement(styleName, cssToApply);
                        });
                    }
                });
        });
    }

    if (currentSiteIdentifier) {
        const customStorageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        chrome.storage.sync.get(customStorageKey, function (result) {
            if (chrome.runtime.lastError) {
                console.error(`Storage error for ${customStorageKey}:`, chrome.runtime.lastError);
                return;
            }
            let customSelectors = result[customStorageKey] || [];
            if (!Array.isArray(customSelectors)) customSelectors = [];
            const merged = Array.from(new Set([...customSelectors, ...sessionHiddenSelectors]));
            applyCustomElementStyles(currentSiteIdentifier, merged);
            if (merged.length > 0) {
                console.log(`Applied ${merged.length} custom rules for ${currentSiteIdentifier}`);
            }
        });

        const grayscaleStatusKey = `${currentSiteIdentifier}GrayscaleStatus`;
        chrome.storage.sync.get(grayscaleStatusKey, function (result) {
            applyGrayscaleStyle(result[grayscaleStatusKey] === true);
        });

        maybeRedirectFromStorage();
    }

})();
