(function () {

    // --- All helper functions are defined first, making them available to the entire script ---
    // Centre for Digital Habits design system (light), as in popup.css and
    // To-Do: cream, ink, green. Dark surfaces keep their own colours.
    const REDD = {
        canvas: '#f5f1ea',
        navy: '#1b3d4a',
        body: '#1b3d4a',
        muted: '#586f77',
        borderSubtle: '#d2d4d0',
        teal: '#005d53',
        tealHover: '#004d45',
        card: '#ffffff',
        tealSoft: '#dbf0ea',
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
    let selectionCaptureLayer = null;
    // Hovering: a dashed outline, with a small tag on it saying what to do.
    let highlightOverlay = null;
    let hoverTag = null;
    let currentHighlightedElement = null;
    /*
     * Hiding takes two steps, like Safari's Hide Distracting Items: a click
     * chooses an area, then Hide (or Enter) hides it. Until then the area is
     * pending, with a tab on its outline. "Smaller" steps into the item
     * nearest pendingPoint (where it was chosen, in page coordinates).
     */
    let selectionOverlay = null;
    let pickTab = null;
    let pendingElement = null;
    let pendingPoint = null;
    /*
     * Once hidden, the area keeps its space for a moment, outlined, with a
     * field to name the pick and an Undo:
     * { selector, element, box, card, input, styleId }
     */
    let naming = null;
    // Picks hidden since the picker opened, for the note when it closes.
    let hiddenThisRound = 0;
    let touchBar = null;      // phones and tablets: "Tap to select" and Done
    let pickerNote = null;    // "2 items hidden on this page"
    let pickerNoteTimer = null;
    let lastTapTime = 0;
    let sessionHiddenSelectors = [];
    // Expose session-only selectors so other parts can read/merge
    window.__vfSessionCustomSelectors = sessionHiddenSelectors;
    const highlightStyleId = 'mindshield-highlight-style';
    let currentTheme = 'light';

    /*
     * After the extension is reloaded or updated, this script lives on in
     * tabs that were already open, but every chrome.* call throws "Extension
     * context invalidated". Check before calling from event handlers.
     */
    function extensionAlive() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    /** The picker can't save anything once the extension is gone, so close it. */
    function pickerStillWorks() {
        if (extensionAlive()) return true;
        stopSelecting(true);
        return false;
    }

    function updateTheme() {
        if (!extensionAlive()) return;
        chrome.storage.sync.get('themePreference', (result) => {
            const pref = result.themePreference || 'system';
            if (pref === 'dark') {
                currentTheme = 'dark';
            } else if (pref === 'light') {
                currentTheme = 'light';
            } else {
                currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            // The naming card is the one piece of picker UI that follows the theme.
            if (naming) paintNamingCard();
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

    /*
     * Our in-page UI (picker bar, highlight, selector tip, delay screen) lives
     * in one transparent container in the browser's top layer, shown as a
     * manual popover. The top layer is painted outside the page's own
     * rendering, so the greyscale filter on <html> does not reach it, and no
     * site element can sit above it. Browsers without popovers (Chrome < 114,
     * Safari < 17, Firefox < 125) mount the UI in <body> as before.
     */
    const SUPPORTS_TOP_LAYER = typeof HTMLElement !== 'undefined' &&
        typeof HTMLElement.prototype.showPopover === 'function';
    const UI_LAYER_ID = 'redd-focus-ui-layer';
    let uiLayer = null;

    function getUiLayer() {
        if (!SUPPORTS_TOP_LAYER) return null;
        if (!uiLayer) {
            uiLayer = document.createElement('div');
            uiLayer.id = UI_LAYER_ID;
            uiLayer.setAttribute('popover', 'manual');
            // Undo the browser's popover box (centred, bordered, opaque) with
            // inline !important, which page stylesheets cannot override.
            const reset = {
                position: 'fixed', inset: '0', width: '100vw', height: '100vh',
                'max-width': 'none', 'max-height': 'none', margin: '0', padding: '0',
                border: '0', background: 'transparent', overflow: 'visible',
                'pointer-events': 'none', color: 'inherit'
            };
            Object.keys(reset).forEach(function (prop) {
                uiLayer.style.setProperty(prop, reset[prop], 'important');
            });
            // Popovers get a ::backdrop. A site that styles backdrops for its
            // own dialogs would otherwise dim the whole page while we pick.
            createStyleElement('reddFocusUiLayerStyle', `
                #${UI_LAYER_ID}::backdrop {
                    background: transparent !important;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                    filter: none !important;
                }
            `);
        }
        const parent = getMountParent();
        if (!parent) return null;
        if (uiLayer.parentNode !== parent) {
            parent.appendChild(uiLayer);
        }
        // Moving a popover in the DOM closes it, so show it again if needed.
        try {
            if (!uiLayer.matches(':popover-open')) uiLayer.showPopover();
        } catch (e) {
            return null;
        }
        return uiLayer;
    }

    /** Close and remove the top-layer container once nothing is in it. */
    function releaseUiLayerIfEmpty() {
        if (!uiLayer || uiLayer.firstElementChild) return;
        try { uiLayer.hidePopover(); } catch (e) { /* already closed */ }
        uiLayer.remove();
    }

    function ensureMounted(el) {
        if (!el) return false;
        const parent = getUiLayer() || getMountParent();
        if (!parent) return false;
        if (el.parentNode !== parent) {
            parent.appendChild(el);
        }
        refreshGrayscaleFilter();
        return true;
    }

    const PICKER_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif';
    const PICK_ORANGE = '#e07a3f';      // outlines: dashed on hover, solid once chosen
    const PICK_GREEN = '#005d53';       // the tab on a chosen area, and the hidden-area box
    const PICK_GREEN_HOVER = '#004d45';
    const PICK_CHIP = '#dbf0ea';        // Hide, light on the green tab
    const PICK_CHIP_HOVER = '#c6e6dd';
    const PICK_INK = '#1b3d4a';         // the hint tag and the closing note
    const PICK_UI_ATTR = 'data-redd-picker-ui';

    function namingColors() {
        const dark = currentTheme === 'dark';
        return {
            surface: dark ? REDD.dark.surface : REDD.card,
            text: dark ? REDD.dark.text : REDD.navy,
            muted: dark ? '#94a3b8' : REDD.muted,
            border: dark ? REDD.dark.border : REDD.borderSubtle,
            link: dark ? REDD.dark.teal : PICK_GREEN,
        };
    }

    function makeOverlay() {
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.zIndex = '2147483646';
        overlay.style.pointerEvents = 'none';
        overlay.style.margin = '0';
        overlay.style.padding = '0';
        overlay.style.boxSizing = 'border-box';
        overlay.style.display = 'none';
        return overlay;
    }

    function createHighlightOverlay() {
        if (!highlightOverlay) {
            highlightOverlay = makeOverlay();
            highlightOverlay.style.border = `2px dashed ${PICK_ORANGE}`;
            highlightOverlay.style.borderRadius = '4px';
            highlightOverlay.style.backgroundColor = 'rgba(224, 122, 63, 0.08)';
        }
        return ensureMounted(highlightOverlay);
    }

    function createSelectionOverlay() {
        if (!selectionOverlay) {
            selectionOverlay = makeOverlay();
            selectionOverlay.style.border = `3px solid ${PICK_ORANGE}`;
            selectionOverlay.style.backgroundColor = 'rgba(224, 122, 63, 0.14)';
        }
        return ensureMounted(selectionOverlay);
    }

    function positionOverlay(overlay, el) {
        if (!overlay || !el) return;
        const rect = el.getBoundingClientRect();
        // In the fixed top-layer container, coordinates are the viewport's;
        // in <body>, the page's.
        const inLayer = overlay.parentNode === uiLayer;
        overlay.style.top = `${rect.top + (inLayer ? 0 : window.scrollY)}px`;
        overlay.style.left = `${rect.left + (inLayer ? 0 : window.scrollX)}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.display = 'block';
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
            selectionCaptureLayer.style.pointerEvents = 'auto';
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

    function isOurUi(el) {
        if (!el) return false;
        if (el === highlightOverlay || el === selectionOverlay || el === selectionCaptureLayer) return true;
        if (uiLayer && uiLayer.contains(el)) return true;
        return !!(el.closest && el.closest(`[${PICK_UI_ATTR}]`));
    }

    /** The page element at a point that the user may hide, or null. */
    function pickableElementAt(clientX, clientY) {
        const el = getUnderlyingElementFromPosition(clientX, clientY);
        if (!el || el === document.body || el === document.documentElement || isOurUi(el)) return null;
        if (naming && naming.element === el) return null;
        return el;
    }

    // Phones and tablets have no Enter, Esc or arrow keys to hint at.
    function isTouchOnly() {
        try {
            return window.matchMedia('(hover: none)').matches;
        } catch (e) {
            return false;
        }
    }

    function makeIcon(pathData) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.7');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.display = 'block';
        svg.style.flex = 'none';
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
        return svg;
    }
    // Arrows pointing out of the corners, and into them; a cross.
    const ICON_LARGER = 'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9';
    const ICON_SMALLER = 'M13.5 2.5 9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M6.5 13V9.5H3';
    const ICON_CLOSE = 'M4 4l8 8M12 4l-8 8';

    /** Our own element, styled inline so the page's CSS can't reshape it. */
    function makeUi(tag) {
        const el = document.createElement(tag);
        el.setAttribute(PICK_UI_ATTR, '');
        el.style.boxSizing = 'border-box';
        el.style.margin = '0';
        el.style.fontFamily = PICKER_FONT;
        el.style.letterSpacing = 'normal';
        el.style.textTransform = 'none';
        el.style.textAlign = 'left';
        return el;
    }

    /*
     * Buttons: 'chip' (Hide, light on the green tab), 'ghost' (white text on
     * the tab), 'primary' (Save), 'link' (Undo).
     */
    function styleButton(button, variant) {
        const s = button.style;
        s.borderRadius = '6px';
        s.padding = variant === 'link' ? '2px 0' : '6px 10px';
        s.minWidth = '0';
        s.minHeight = '0';
        s.height = 'auto';
        s.width = 'auto';
        s.fontSize = '14px';
        s.fontWeight = '600';
        s.lineHeight = '1.25';
        s.whiteSpace = 'nowrap';
        s.border = '0';
        s.boxShadow = 'none';
        s.cursor = 'pointer';
        s.display = 'inline-flex';
        s.alignItems = 'center';
        s.justifyContent = 'center';
        s.gap = '6px';
        s.transition = 'background-color 0.15s ease';
        s.outline = 'none';
        s.outlineOffset = '1px';
        s.textDecoration = variant === 'link' ? 'underline' : 'none';
        s.textUnderlineOffset = '3px';

        function paint(hover) {
            if (variant === 'chip') {
                s.background = hover ? PICK_CHIP_HOVER : PICK_CHIP;
                s.color = PICK_GREEN;
            } else if (variant === 'ghost') {
                s.background = hover ? 'rgba(255, 255, 255, 0.16)' : 'transparent';
                s.color = '#ffffff';
            } else if (variant === 'primary') {
                s.background = hover ? PICK_GREEN_HOVER : PICK_GREEN;
                s.color = '#ffffff';
                s.padding = '8px 16px';
            } else {
                s.background = 'transparent';
                s.color = namingColors().link;
            }
        }
        paint(false);
        button.addEventListener('mouseenter', () => paint(true));
        button.addEventListener('mouseleave', () => paint(false));
        // A ring only for keyboard focus, as :focus-visible can't be inline.
        button.addEventListener('focus', () => {
            let visible = true;
            try { visible = button.matches(':focus-visible'); } catch (e) { /* old browser */ }
            if (visible) s.outline = '2px solid #7fa8ff';
        });
        button.addEventListener('blur', () => { s.outline = 'none'; });
    }

    function makePickerButton(label, variant, onActivate, iconPath) {
        const button = makeUi('button');
        button.type = 'button';
        if (iconPath) button.appendChild(makeIcon(iconPath));
        if (label) button.appendChild(document.createTextNode(label));
        styleButton(button, variant);
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onActivate();
        });
        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onActivate();
        });
        return button;
    }

    /*
     * Put a tag or tab on an outline: sitting on its top edge, or under the
     * bottom edge if there's no room above, or just inside the top if the
     * area fills the screen. Returns which of those it used.
     */
    function attachToOutline(node, rect, gap) {
        // clientWidth/Height leave out scrollbars, which innerWidth/Height include.
        const viewWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewHeight = document.documentElement.clientHeight || window.innerHeight;
        node.style.maxWidth = `${viewWidth}px`;
        const height = node.offsetHeight;
        const width = node.offsetWidth;
        let top;
        let side;
        if (rect.top - height - gap >= 0) {
            top = rect.top - height - gap;
            side = 'above';
        } else if (rect.bottom + height + gap <= viewHeight) {
            top = rect.bottom + gap;
            side = 'below';
        } else {
            top = Math.max(0, rect.top);
            side = 'inside';
        }
        top = Math.min(top, Math.max(0, viewHeight - height));
        const left = Math.min(Math.max(rect.left, 0), Math.max(0, viewWidth - width));
        node.style.top = `${Math.round(top)}px`;
        node.style.left = `${Math.round(left)}px`;
        return side;
    }

    // --- Hovering ---

    function createHoverTag() {
        if (!hoverTag) {
            hoverTag = makeUi('div');
            const s = hoverTag.style;
            s.position = 'fixed';
            s.zIndex = '2147483647';
            // Clickable, for its Done button (see keepHoverForTag).
            s.pointerEvents = 'auto';
            s.cursor = 'default';
            s.display = 'none';
            s.alignItems = 'center';
            s.gap = '8px';
            s.padding = '3px 3px 3px 9px';
            s.borderRadius = '5px';
            s.background = PICK_INK;
            s.color = '#ffffff';
            s.fontSize = '13px';
            s.lineHeight = '1.3';
            s.whiteSpace = 'nowrap';
            const action = document.createElement('span');
            action.textContent = 'Click to select';
            action.style.fontWeight = '700';
            const exit = document.createElement('span');
            exit.textContent = 'Esc or';
            exit.style.opacity = '0.8';
            exit.style.marginLeft = '2px';
            // Esc doesn't always reach the page (the focus may be in the
            // browser's toolbar), so there is always a button to leave.
            const done = makePickerButton('Done', 'chip', () => stopSelecting(false));
            done.title = 'Stop choosing (Esc)';
            done.style.padding = '2px 8px';
            done.style.fontSize = '12px';
            done.style.borderRadius = '4px';
            hoverTag.appendChild(action);
            hoverTag.appendChild(exit);
            hoverTag.appendChild(done);
        }
        return ensureMounted(hoverTag);
    }

    function hideHover() {
        currentHighlightedElement = null;
        if (highlightOverlay) highlightOverlay.style.display = 'none';
        if (hoverTag) hoverTag.style.display = 'none';
    }

    function showHover(el) {
        currentHighlightedElement = el;
        positionOverlay(highlightOverlay, el);
        if (hoverTag) {
            hoverTag.style.display = 'flex';
            hoverTagSide = attachToOutline(hoverTag, el.getBoundingClientRect(), 0);
        }
    }

    /*
     * The tag sits on the outline's edge, but is shorter than the outline is
     * wide, so a pointer heading for its Done button crosses the strip
     * beside it, over other parts of the page. Hold the outline (and tag)
     * still while the pointer is in that strip.
     */
    let hoverTagSide = 'above';
    function keepHoverForTag(x, y) {
        if (!currentHighlightedElement || !hoverTag || hoverTag.style.display === 'none') return false;
        if (hoverTagSide === 'inside') return false;
        const outline = currentHighlightedElement.getBoundingClientRect();
        const tag = hoverTag.getBoundingClientRect();
        if (x < Math.min(outline.left, tag.left) || x > Math.max(outline.right, tag.right)) return false;
        return hoverTagSide === 'above'
            ? y >= tag.top && y <= outline.top
            : y >= outline.bottom && y <= tag.bottom;
    }

    // On a touch screen there's no hover, so a small bar says what to do.
    function createTouchBar() {
        if (!touchBar) {
            touchBar = makeUi('div');
            const s = touchBar.style;
            s.position = 'fixed';
            s.top = '12px';
            s.left = '50%';
            s.transform = 'translateX(-50%)';
            s.zIndex = '2147483647';
            s.pointerEvents = 'auto';
            s.display = 'flex';
            s.alignItems = 'center';
            s.gap = '12px';
            s.padding = '6px 6px 6px 14px';
            s.borderRadius = '10px';
            s.background = PICK_INK;
            s.color = '#ffffff';
            s.fontSize = '14px';
            s.fontWeight = '700';
            s.whiteSpace = 'nowrap';
            s.boxShadow = '0 8px 20px -6px rgba(0, 0, 0, 0.35)';
            const text = document.createElement('span');
            text.textContent = 'Tap something to select it';
            touchBar.appendChild(text);
            touchBar.appendChild(makePickerButton('Done', 'chip', () => stopSelecting(false)));
        }
        return ensureMounted(touchBar);
    }

    // --- The chosen area and its tab ---

    // Things a reader would count as one item in an area.
    const AREA_ITEM_SELECTOR = 'a[href], button, input, select, textarea, img, video, picture, svg, iframe, ' +
        '[role="button"], [role="link"], li, h1, h2, h3, h4, h5, h6, p';

    /** The outermost items in an area, so a link's image and text are one. */
    function areaItems(el) {
        const items = [];
        const nodes = el.querySelectorAll(AREA_ITEM_SELECTOR);
        for (let i = 0; i < nodes.length; i++) {
            const parent = nodes[i].parentElement;
            const outer = parent && parent.closest(AREA_ITEM_SELECTOR);
            if (outer && el.contains(outer)) continue;
            items.push(nodes[i]);
        }
        return items;
    }

    function shortText(el, max) {
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length <= max) return text;
        return `${text.slice(0, max - 1).trim()}…`;
    }

    function mediaName(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'img' || tag === 'picture' || tag === 'svg') return 'Image';
        if (tag === 'video') return 'Video';
        if (tag === 'iframe') return 'Embedded content';
        return '';
    }

    /** "Image" or "Video" when one fills most of the area, as a thumbnail with a badge on it. */
    function mainMediaName(el) {
        const media = el.querySelector('img, video, picture, iframe');
        if (!media) return '';
        const m = media.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return m.width * m.height >= 0.5 * r.width * r.height ? mediaName(media) : '';
    }

    /** What the tab calls an area: its text in quotes, or how many items it holds. */
    function describeArea(el) {
        const items = childAreas(el).length;
        const media = mediaName(el) || (items > 1 ? '' : mainMediaName(el));
        if (media) return media;
        if (items > 1) return `Area with ${items} items`;
        // No text: the name a screen reader would use, like "More actions" on a ⋮ button.
        const named = el.matches('[aria-label]') ? el : el.querySelector('[aria-label]');
        const text = shortText(el, 26) || (named && named.getAttribute('aria-label').trim().slice(0, 26));
        return text ? `“${text}”` : 'This area';
    }

    /** A name for a new pick, like "Safari + 4 more". */
    function defaultPickName(el) {
        const media = mediaName(el);
        if (media) return media;
        const items = areaItems(el);
        if (items.length > 1) {
            let first = '';
            for (let i = 0; i < items.length && !first; i++) first = shortText(items[i], 30);
            return first ? `${first} + ${items.length - 1} more` : `${items.length} items`;
        }
        return shortText(el, 60) || 'Hidden area';
    }

    /*
     * Areas: what Larger and Smaller step through. Pages nest many
     * elements in one box (a link around a span of the same size) or in no
     * box at all (display: contents), so stepping element by element repeats
     * boxes and puts siblings at different depths. An area is the outermost
     * element of a run showing the same box; its items are the next boxes
     * inside it. A box whose only item shows the same content (a heading
     * around its line of text, a menu around its button) is one level, not
     * two. Larger, Smaller and the tab's count all use this.
     */
    function sameBox(a, b) {
        return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 &&
            Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
    }

    function hasBox(r) {
        return r.width >= 1 && r.height >= 1;
    }

    function isPageRoot(el) {
        return !el || el === document.body || el === document.documentElement;
    }

    /** The outermost element showing the same box as el. */
    function boxAreaOf(el) {
        const rect = el.getBoundingClientRect();
        let area = el;
        for (let p = el.parentElement; !isPageRoot(p); p = p.parentElement) {
            const r = p.getBoundingClientRect();
            if (!hasBox(r)) continue;
            if (!sameBox(r, rect)) break;
            area = p;
        }
        return area;
    }

    /** The box around this one (before merging levels), or null at the page. */
    function rawParentArea(area) {
        const rect = area.getBoundingClientRect();
        for (let p = area.parentElement; !isPageRoot(p); p = p.parentElement) {
            const r = p.getBoundingClientRect();
            if (hasBox(r) && !sameBox(r, rect)) return boxAreaOf(p);
        }
        return null;
    }

    /** The boxes directly inside this one (before merging levels), in page order. */
    function rawChildAreas(area) {
        const rect = area.getBoundingClientRect();
        const items = [];
        (function look(el) {
            // An image or icon is the smallest level: not its drawing's shapes.
            if (el instanceof SVGElement) return;
            for (const child of el.children) {
                if (isOurUi(child)) continue;
                const r = child.getBoundingClientRect();
                // A wrapper with no box, or the same box, is not an item: look inside it.
                if (!hasBox(r) || sameBox(r, rect)) look(child);
                // Nor is an empty layer, like a click ripple or hover highlight.
                else if (hasContent(child)) items.push(child);
            }
        })(area);
        return items;
    }

    function hasContent(el) {
        return /\S/.test(el.textContent || '') || el.matches(MEDIA_SELECTOR) || !!el.querySelector(MEDIA_SELECTOR);
    }

    const MEDIA_SELECTOR = 'img, video, picture, svg, iframe, canvas';
    function sameContent(a, b) {
        const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
        return text(a) === text(b) &&
            a.querySelectorAll(MEDIA_SELECTOR).length === b.querySelectorAll(MEDIA_SELECTOR).length;
    }

    /** The one box inside area that shows all of its content, or null. */
    function onlyItem(area) {
        const items = rawChildAreas(area);
        return items.length === 1 && sameContent(area, items[0]) ? items[0] : null;
    }

    /** The level el belongs to: its area, merged up through boxes that only wrap it. */
    function areaOf(el) {
        let area = boxAreaOf(el);
        for (let p = rawParentArea(area); p && onlyItem(p) === area; p = rawParentArea(area)) area = p;
        return area;
    }

    /** The level around this one, or null when only the page is left. */
    function parentArea(area) {
        const p = rawParentArea(area);
        return p ? areaOf(p) : null;
    }

    /** The levels directly inside this one, in page order. */
    function childAreas(area) {
        let inner = area;
        for (let next = onlyItem(inner); next; next = onlyItem(inner)) inner = next;
        return rawChildAreas(inner);
    }

    /** The item inside this area nearest where it was chosen, or null. */
    function smallerArea(area) {
        const items = childAreas(area);
        if (items.length === 0) return null;
        const rect = area.getBoundingClientRect();
        const x = pendingPoint ? pendingPoint.x - window.scrollX : rect.left + rect.width / 2;
        const y = pendingPoint ? pendingPoint.y - window.scrollY : rect.top + rect.height / 2;
        let best = null, bestDistance = Infinity;
        items.forEach(function (item) {
            const r = item.getBoundingClientRect();
            const distance = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
            if (distance < bestDistance) [best, bestDistance] = [item, distance];
        });
        return best;
    }

    function createPickTab() {
        if (!pickTab) {
            pickTab = makeUi('div');
            pickTab.setAttribute('role', 'dialog');
            pickTab.setAttribute('aria-label', 'Hide this area?');
            const s = pickTab.style;
            s.position = 'fixed';
            s.zIndex = '2147483647';
            s.pointerEvents = 'auto';
            s.display = 'flex';
            s.alignItems = 'center';
            s.gap = '4px';
            s.maxWidth = '100vw';
            s.padding = '5px 6px 5px 12px';
            s.background = PICK_GREEN;
            s.color = '#ffffff';
            s.fontSize = '14px';
            s.cursor = 'default';
            s.userSelect = 'none';
            s.boxShadow = '0 4px 12px -4px rgba(0, 0, 0, 0.3)';
        }
        return ensureMounted(pickTab);
    }

    function showPickTab() {
        if (!pendingElement || !createPickTab()) return;
        pickTab.textContent = '';

        const label = document.createElement('span');
        label.textContent = describeArea(pendingElement);
        label.style.marginRight = '6px';
        label.style.opacity = '0.9';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.minWidth = '0';
        pickTab.appendChild(label);

        const hideButton = makePickerButton('Hide', 'chip', confirmPendingHide);
        hideButton.dataset.pickHide = '1';
        pickTab.appendChild(hideButton);
        if (parentArea(pendingElement)) {
            const larger = makePickerButton('Larger', 'ghost', growPendingArea, ICON_LARGER);
            larger.title = 'Select a larger area (↑)';
            pickTab.appendChild(larger);
        }
        if (childAreas(pendingElement).length > 0) {
            const smaller = makePickerButton('Smaller', 'ghost', shrinkPendingArea, ICON_SMALLER);
            smaller.title = 'Back to the smaller area (↓)';
            pickTab.appendChild(smaller);
        }
        const close = makePickerButton('', 'ghost', () => cancelPending(), ICON_CLOSE);
        close.setAttribute('aria-label', 'Cancel');
        close.title = 'Cancel (Esc)';
        pickTab.appendChild(close);

        placePickTab();
        // Enter hides, so focus starts on Hide. Again once the choosing click
        // has finished: Safari kept the arrow keys from the page until a
        // second click otherwise.
        const focusHide = () => {
            if (hideButton.isConnected) hideButton.focus({ preventScroll: true });
        };
        try { focusHide(); } catch (e) { /* not focusable yet */ }
        setTimeout(focusHide, 0);
    }

    function placePickTab() {
        if (!pickTab || !pendingElement) return;
        const side = attachToOutline(pickTab, pendingElement.getBoundingClientRect(), 0);
        pickTab.style.borderRadius = side === 'above' ? '8px 8px 0 0' : side === 'below' ? '0 0 8px 8px' : '0 0 8px 0';
    }

    function setPendingArea(el) {
        pendingElement = el;
        hideHover();
        if (createSelectionOverlay()) positionOverlay(selectionOverlay, el);
        showPickTab();
    }

    function clearPending() {
        pendingElement = null;
        pendingPoint = null;
        if (selectionOverlay) selectionOverlay.style.display = 'none';
        if (pickTab) {
            pickTab.remove();
            pickTab = null;
        }
    }

    /** Drop the chosen area without hiding it. */
    function cancelPending() {
        if (!pendingElement) return;
        clearPending();
    }

    // ↑: the area around. Where it was chosen stays inside, so ↓ comes back.
    function growPendingArea() {
        const larger = pendingElement && parentArea(pendingElement);
        if (larger) setPendingArea(larger);
    }

    // ↓: the item inside nearest where the area was chosen.
    function shrinkPendingArea() {
        const smaller = pendingElement && smallerArea(pendingElement);
        if (smaller) setPendingArea(smaller);
    }

    function confirmPendingHide() {
        const el = pendingElement;
        clearPending();
        if (!el || !el.isConnected) return;
        processSelectedElement(el);
    }

    // --- After hiding: name the pick, or undo it ---

    const selectorOf = s => (typeof s === 'string' ? s : s.selector);
    const NAMING_STYLE_ID = 'reddPickNamingStyle';

    /*
     * The pick is saved and its rule hides the area, but for now a later
     * rule keeps its space (invisible), so the page doesn't jump while the
     * dashed box sits there. It collapses once naming is finished.
     */
    function startNaming(el, selector, name, display) {
        finishNaming();
        createStyleElement(NAMING_STYLE_ID,
            `${selector} { display: ${display} !important; visibility: hidden !important; }`);

        const box = makeOverlay();
        box.setAttribute(PICK_UI_ATTR, '');
        box.style.border = `2px dashed ${PICK_GREEN}`;
        box.style.borderRadius = '6px';
        if (!ensureMounted(box)) return;

        const card = makeUi('div');
        const s = card.style;
        s.position = 'fixed';
        s.zIndex = '2147483647';
        s.pointerEvents = 'auto';
        s.padding = '12px';
        s.borderRadius = '10px';
        s.cursor = 'default';
        s.boxShadow = '0 8px 20px -8px rgba(0, 0, 0, 0.25)';

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        const input = makeUi('input');
        input.type = 'text';
        input.value = name;
        input.setAttribute('aria-label', 'Name for this hidden area');
        input.spellcheck = false;
        Object.assign(input.style, {
            flex: '1', minWidth: '0', width: 'auto', height: 'auto',
            padding: '8px 10px', borderRadius: '6px', fontSize: '15px', lineHeight: '1.3',
            outline: 'none', boxShadow: 'none'
        });
        input.addEventListener('focus', () => { input.style.borderColor = '#2f5fd0'; input.style.boxShadow = '0 0 0 1px #2f5fd0'; });
        input.addEventListener('blur', () => { input.style.boxShadow = 'none'; paintNamingCard(); });
        row.appendChild(input);
        row.appendChild(makePickerButton('Save', 'primary', finishNaming));
        card.appendChild(row);

        const meta = document.createElement('div');
        meta.style.display = 'flex';
        meta.style.alignItems = 'baseline';
        meta.style.gap = '12px';
        meta.style.marginTop = '8px';
        const code = document.createElement('code');
        code.textContent = selector;
        code.title = selector;
        Object.assign(code.style, {
            flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', background: 'none', padding: '0'
        });
        meta.appendChild(code);
        const undo = makePickerButton('Undo', 'link', undoNamingPick);
        meta.appendChild(undo);
        card.appendChild(meta);

        if (!ensureMounted(card)) {
            box.remove();
            return;
        }
        naming = { selector, element: el, box, card, input, code, undo };
        paintNamingCard();
        placeNaming();
        try {
            input.focus({ preventScroll: true });
            input.select();
        } catch (e) { /* not focusable */ }

        // While settings are locked a pick can't be undone, so grey Undo out.
        if (currentSiteIdentifier && extensionAlive()) {
            chrome.storage.sync.get(`${currentSiteIdentifier}SettingsLocked`, function (result) {
                if (result[`${currentSiteIdentifier}SettingsLocked`] !== true || !naming || naming.undo !== undo) return;
                undo.disabled = true;
                undo.title = 'Settings are locked';
                undo.style.opacity = '0.45';
                undo.style.cursor = 'not-allowed';
                undo.style.pointerEvents = 'none';
            });
        }
    }

    function paintNamingCard() {
        if (!naming) return;
        const c = namingColors();
        naming.card.style.background = c.surface;
        naming.card.style.color = c.text;
        naming.card.style.border = `1px solid ${c.border}`;
        naming.input.style.background = c.surface;
        naming.input.style.color = c.text;
        naming.input.style.border = `1px solid ${document.activeElement === naming.input ? '#2f5fd0' : c.border}`;
        naming.code.style.color = c.muted;
        naming.undo.style.color = c.link;
    }

    /** The dashed box over the area; the card inside it, or by it if it's small. */
    function placeNaming() {
        if (!naming) return;
        const rect = naming.element.getBoundingClientRect();
        positionOverlay(naming.box, naming.element);
        const card = naming.card;
        const edge = 8;
        const width = Math.min(window.innerWidth - edge * 2, Math.max(300, Math.min(440, rect.width - 32)));
        card.style.width = `${width}px`;
        const height = card.offsetHeight;
        let top;
        let left;
        if (rect.width >= width + 16 && rect.height >= height + 16) {
            top = rect.top + (rect.height - height) / 2;
            left = rect.left + (rect.width - width) / 2;
        } else {
            top = rect.bottom + 6;
            if (top + height > window.innerHeight - edge) top = rect.top - height - 6;
            left = rect.left;
        }
        top = Math.min(Math.max(top, edge), Math.max(edge, window.innerHeight - height - edge));
        left = Math.min(Math.max(left, edge), Math.max(edge, window.innerWidth - width - edge));
        card.style.top = `${Math.round(top)}px`;
        card.style.left = `${Math.round(left)}px`;
    }

    function closeNamingUi() {
        if (!naming) return;
        naming.box.remove();
        naming.card.remove();
        const style = document.getElementById(NAMING_STYLE_ID);
        if (style) style.remove();
        naming = null;
    }

    /** Keep the name as typed (Save, Enter, Esc, or moving on) and let the area collapse. */
    function finishNaming() {
        if (!naming) return;
        const selector = naming.selector;
        const name = naming.input.value.trim();
        closeNamingUi();
        if (name) renamePick(selector, name);
    }

    function undoNamingPick() {
        if (!naming) return;
        const selector = naming.selector;
        closeNamingUi();
        removePick(selector);
    }

    function renamePick(selector, name) {
        const index = sessionHiddenSelectors.findIndex(s => selectorOf(s) === selector);
        if (index > -1) {
            const old = sessionHiddenSelectors[index];
            sessionHiddenSelectors[index] = Object.assign(typeof old === 'string' ? { selector: old } : Object.assign({}, old), { name });
        }
        if (!currentSiteIdentifier || !extensionAlive()) return;
        const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        chrome.storage.sync.get(storageKey, function (result) {
            const saved = Array.isArray(result[storageKey]) ? result[storageKey] : [];
            const at = saved.findIndex(s => selectorOf(s) === selector);
            if (at === -1) {
                // A pick for this visit only; let an open popup know its new name.
                chrome.runtime.sendMessage({ type: 'sessionSelectorsChanged', siteIdentifier: currentSiteIdentifier, selectors: mergeWithSession(saved) }, function () { void chrome.runtime.lastError; });
                return;
            }
            const old = saved[at];
            if (typeof old !== 'string' && old.name === name) return;
            saved[at] = Object.assign(typeof old === 'string' ? { selector: old } : Object.assign({}, old), { name });
            chrome.storage.sync.set({ [storageKey]: saved });
        });
    }

    function removePick(selector) {
        if (!currentSiteIdentifier || !pickerStillWorks()) return;
        const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        const lockKey = `${currentSiteIdentifier}SettingsLocked`;
        chrome.storage.sync.get([storageKey, lockKey], function (result) {
            if (result[lockKey] === true) return;
            const index = sessionHiddenSelectors.findIndex(s => selectorOf(s) === selector);
            if (index > -1) sessionHiddenSelectors.splice(index, 1);
            hiddenThisRound = Math.max(0, hiddenThisRound - 1);
            let saved = Array.isArray(result[storageKey]) ? result[storageKey] : [];
            const wasSaved = saved.some(s => selectorOf(s) === selector);
            saved = saved.filter(s => selectorOf(s) !== selector);
            const merged = mergeWithSession(saved);
            applyCustomElementStyles(currentSiteIdentifier, merged);
            if (wasSaved) {
                chrome.storage.sync.set({ [storageKey]: saved });
            } else {
                chrome.runtime.sendMessage({ type: 'sessionSelectorsChanged', siteIdentifier: currentSiteIdentifier, selectors: merged }, function () { void chrome.runtime.lastError; });
            }
        });
    }

    // --- The note when the picker closes ---

    function hidePickerNote() {
        if (pickerNoteTimer) {
            clearTimeout(pickerNoteTimer);
            pickerNoteTimer = null;
        }
        if (pickerNote) {
            pickerNote.remove();
            pickerNote = null;
        }
        releaseUiLayerIfEmpty();
    }

    /*
     * "2 items hidden on this page", in the top corner nearest the toolbar,
     * so people know to open Focus to rename them or show them again.
     */
    function showPickerNote() {
        if (!currentSiteIdentifier || !extensionAlive()) return;
        const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        chrome.storage.sync.get(storageKey, function (result) {
            const saved = Array.isArray(result[storageKey]) ? result[storageKey] : [];
            const onPage = mergeWithSession(saved).filter(item => {
                if (!isPickEnabled(item)) return false;
                try {
                    return !!document.querySelector(selectorOf(item));
                } catch (e) {
                    return false;
                }
            }).length;
            if (onPage === 0 || isSelecting) return;
            hidePickerNote();

            const touchOnly = isTouchOnly();
            pickerNote = makeUi('div');
            pickerNote.setAttribute('role', 'status');
            const s = pickerNote.style;
            s.position = 'fixed';
            s.top = '10px';
            if (touchOnly) {
                s.left = '50%';
                s.transform = 'translateX(-50%)';
            } else {
                s.right = '16px';
            }
            s.zIndex = '2147483647';
            s.pointerEvents = 'auto';
            s.cursor = 'pointer';
            s.maxWidth = 'calc(100vw - 24px)';
            s.padding = '10px 14px';
            s.borderRadius = '10px';
            s.background = PICK_INK;
            s.color = '#ffffff';
            s.boxShadow = '0 10px 24px -8px rgba(0, 0, 0, 0.4)';
            s.fontSize = '14px';
            s.lineHeight = '1.35';

            // No arrow: a page can't tell where the browser puts Focus's icon
            // (pinned, in the extensions menu, or Safari's own toolbar).
            const title = document.createElement('div');
            title.textContent = `${onPage} ${onPage === 1 ? 'item' : 'items'} hidden on this page`;
            title.style.fontWeight = '700';
            const body = document.createElement('div');
            body.textContent = onPage === 1
                ? 'Open Focus to rename it or show it again.'
                : 'Open Focus to rename them or show them again.';
            body.style.opacity = '0.85';
            // A click anywhere closes the note; the × only shows that it can.
            const text = document.createElement('div');
            text.append(title, body);
            const close = makeIcon(ICON_CLOSE);
            close.style.opacity = '0.85';
            s.display = 'flex';
            s.alignItems = 'flex-start';
            s.gap = '12px';
            pickerNote.append(text, close);
            pickerNote.addEventListener('click', hidePickerNote);
            if (!ensureMounted(pickerNote)) return;
            pickerNoteTimer = setTimeout(hidePickerNote, 6000);
        });
    }

    // --- Starting and stopping ---

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

        hidePickerNote();
        const touchOnly = isTouchOnly();
        const mounted =
            createHighlightOverlay() &&
            createSelectionCaptureLayer() &&
            (touchOnly ? createTouchBar() : createHoverTag());

        if (!mounted || !selectionCaptureLayer) {
            // Avoid sticky isSelecting=true with no UI if mounting somehow failed.
            return;
        }

        isSelecting = true;
        hiddenThisRound = 0;
        selectionCaptureLayer.addEventListener('mousemove', highlightElement);
        selectionCaptureLayer.addEventListener('mouseleave', hideHoverIfIdle);
        selectionCaptureLayer.addEventListener('touchstart', highlightElement, { passive: true });
        selectionCaptureLayer.addEventListener('touchmove', highlightElement, { passive: true });
        selectionCaptureLayer.addEventListener('click', selectElementOnClick);
        selectionCaptureLayer.addEventListener('touchend', selectElementOnTap, { passive: false });
        // On window, in the capture phase, so it runs before the page's own
        // key handlers (YouTube's, say) can swallow Esc.
        window.addEventListener('keydown', handleKeydown, { capture: true });
        // Bring keyboard focus to the page, e.g. from the closed popup.
        try { window.focus(); } catch (e) { /* not allowed */ }
        window.addEventListener('scroll', followHighlightOnScroll, { capture: true, passive: true });
        window.addEventListener('resize', followHighlightOnScroll, { passive: true });
        document.addEventListener('visibilitychange', stopSelectingWhenTabLeft);

        notifySelectionState();
    }

    /*
     * Pick mode belongs to this tab alone: the popup starts and stops it with
     * a message, and the state lives in `isSelecting`. It used to be a key in
     * storage.sync, which put every tab on the site, and the user's other
     * computers, into pick mode at once.
     */
    function notifySelectionState() {
        try {
            chrome.runtime.sendMessage({
                type: 'selectionStateChanged',
                siteIdentifier: currentSiteIdentifier,
                active: isSelecting
            }, function () { void chrome.runtime.lastError; });
        } catch (e) { /* extension reloaded; nothing to tell */ }
    }

    /*
     * Going to another tab ends pick mode, as Done does: a name being typed
     * is kept, and an area chosen but not hidden is let go. Opening Focus's
     * own popup doesn't hide the page, so it doesn't end it.
     */
    function stopSelectingWhenTabLeft() {
        if (document.visibilityState === 'hidden') stopSelecting(true);
    }

    function stopSelecting(cancelled = false) {
        if (!isSelecting) return;
        isSelecting = false;
        clearPending();
        if (extensionAlive()) finishNaming();
        else closeNamingUi();
        selectionCaptureLayer?.removeEventListener('mousemove', highlightElement);
        selectionCaptureLayer?.removeEventListener('mouseleave', hideHoverIfIdle);
        selectionCaptureLayer?.removeEventListener('touchstart', highlightElement);
        selectionCaptureLayer?.removeEventListener('touchmove', highlightElement);
        selectionCaptureLayer?.removeEventListener('click', selectElementOnClick);
        selectionCaptureLayer?.removeEventListener('touchend', selectElementOnTap);
        window.removeEventListener('keydown', handleKeydown, { capture: true });
        window.removeEventListener('scroll', followHighlightOnScroll, { capture: true });
        window.removeEventListener('resize', followHighlightOnScroll);
        document.removeEventListener('visibilitychange', stopSelectingWhenTabLeft);
        [selectionCaptureLayer, highlightOverlay, hoverTag, selectionOverlay, touchBar].forEach(el => el && el.remove());
        const tempStyle = document.getElementById(highlightStyleId);
        if (tempStyle) tempStyle.remove();
        selectionCaptureLayer = highlightOverlay = hoverTag = selectionOverlay = touchBar = currentHighlightedElement = null;
        releaseUiLayerIfEmpty();
        refreshGrayscaleFilter();
        // Keep sessionHiddenSelectors so session rules persist until refresh

        // Not after leaving the tab: the note would fade before anyone saw it.
        if (hiddenThisRound > 0 && !cancelled) showPickerNote();
        hiddenThisRound = 0;
        notifySelectionState();
    }

    function handleKeydown(event) {
        if (!isSelecting) return;
        const consume = () => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const target = event.target;

        // Typing a name: Enter or Esc keeps it; other keys stay out of the page's shortcuts.
        if (naming && target === naming.input) {
            if (event.key === 'Enter' || event.key === 'Escape') {
                consume();
                finishNaming();
            } else {
                event.stopPropagation();
            }
            return;
        }

        if (event.key === 'Escape') {
            consume();
            // Esc steps back: drop the chosen area, then close naming, then leave.
            if (pendingElement) cancelPending();
            else if (naming) finishNaming();
            else stopSelecting(false);
            return;
        }
        if (!pendingElement) return;
        if (event.key === 'Enter') {
            // A focused "Larger", "Smaller" or × keeps its own Enter.
            const onOtherButton = target instanceof Element &&
                target.closest('button') && pickTab && pickTab.contains(target) && !target.hasAttribute('data-pick-hide');
            if (onOtherButton) return;
            consume();
            confirmPendingHide();
        } else if (event.key === 'ArrowUp') {
            consume();
            growPendingArea();
        } else if (event.key === 'ArrowDown') {
            consume();
            shrinkPendingArea();
        }
    }

    /** Outline whatever is under the pointer, until an area is chosen. */
    function highlightElement(event) {
        if (!isSelecting || pendingElement) return;
        const position = getEventClientPosition(event);
        if (!position) return;
        if (keepHoverForTag(position.x, position.y)) return;
        const el = pickableElementAt(position.x, position.y);
        if (el) showHover(areaOf(el));
        else hideHover();
    }

    // The pointer left the page, e.g. for the browser's toolbar. Moving onto
    // our own tag also leaves the capture layer, and must keep the hover.
    function hideHoverIfIdle(event) {
        if (pendingElement) return;
        if (event && event.relatedTarget instanceof Element && isOurUi(event.relatedTarget)) return;
        hideHover();
    }

    // Viewport coordinates go stale when the page (or any scroller) moves.
    function followHighlightOnScroll() {
        if (pendingElement) {
            if (!pendingElement.isConnected) {
                cancelPending();
            } else {
                positionOverlay(selectionOverlay, pendingElement);
                placePickTab();
            }
        } else if (currentHighlightedElement && highlightOverlay && highlightOverlay.style.display !== 'none') {
            showHover(currentHighlightedElement);
        }
        if (naming) {
            if (naming.element.isConnected) placeNaming();
            else finishNaming();
        }
    }

    /** A click or tap chooses an area; it is hidden only once confirmed. */
    function chooseAreaAt(event) {
        const position = getEventClientPosition(event);
        const el = position && pickableElementAt(position.x, position.y);
        if (!el) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        // Moving on keeps the name of the area just hidden.
        finishNaming();
        pendingPoint = { x: position.x + window.scrollX, y: position.y + window.scrollY };
        setPendingArea(areaOf(el));
    }

    function selectElementOnClick(event) {
        if (Date.now() - lastTapTime < 500) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (!isSelecting) return;
        chooseAreaAt(event);
    }

    function selectElementOnTap(event) {
        lastTapTime = Date.now();
        if (!isSelecting) return;
        chooseAreaAt(event);
    }

    /** Save a pick for el (named, e.g. "Safari + 4 more"), hide it, and offer to rename it. */
    function processSelectedElement(el) {
        if (!el || el === document.body || el === document.documentElement) return;
        if (!pickerStillWorks()) return;
        const selector = generateCSSSelector(el);
        if (!selector || !currentSiteIdentifier) {
            console.warn("Could not generate a reliable selector for the element or site identifier is missing.");
            return;
        }
        // Read these before the rule hides it.
        const display = getComputedStyle(el).display;
        const name = defaultPickName(el);
        const pick = { name, selector };
        const storageKey = `${currentSiteIdentifier}CustomHiddenElements`;
        const rememberKey = `${currentSiteIdentifier}RememberSettings`;
        chrome.storage.sync.get([storageKey, rememberKey], function (result) {
            let customSelectors = result[storageKey] || [];
            if (!Array.isArray(customSelectors)) customSelectors = [];
            const rememberEnabled = result[rememberKey] !== false; // default true
            const alreadyHas = customSelectors.some(s => selectorOf(s) === selector) ||
                sessionHiddenSelectors.some(s => selectorOf(s) === selector);
            if (alreadyHas) return;
            sessionHiddenSelectors.push(pick);
            hiddenThisRound++;
            reportIfRuleActive();
            const hideAndName = (merged) => {
                applyCustomElementStyles(currentSiteIdentifier, merged);
                if (isSelecting && el.isConnected) startNaming(el, selector, name, display);
            };
            if (rememberEnabled) {
                const toSave = customSelectors.concat([pick]);
                chrome.storage.sync.set({ [storageKey]: toSave }, function () {
                    if (chrome.runtime.lastError) {
                        console.error("Error saving custom selectors:", chrome.runtime.lastError);
                    }
                    hideAndName(mergeWithSession(toSave));
                });
            } else {
                // Session only — apply without saving
                const merged = mergeWithSession(customSelectors);
                hideAndName(merged);
                // Notify popup that session selectors changed
                chrome.runtime.sendMessage({ type: 'sessionSelectorsChanged', siteIdentifier: currentSiteIdentifier, selectors: merged }, function () { void chrome.runtime.lastError; });
            }
        });
    }

    const GRAYSCALE_STYLE_ID = 'siteGrayscaleStyle';
    let grayscaleOn = false;

    function ensureGrayscaleCssInjected() {
        createStyleElement(GRAYSCALE_STYLE_ID, `
            html.redd-focus-grayscale {
                -webkit-filter: grayscale(100%) !important;
                filter: grayscale(100%) !important;
            }
        `);
    }

    /**
     * Greyscale is a filter on <html>. It greys the whole page, including
     * sites' own top-most widgets, and it is cheap.
     *
     * Our own UI must stay in colour. In Chrome, Edge and Safari it does, as
     * it lives in the top layer (see getUiLayer), which the filter does not
     * reach. Firefox applies the filter to the top layer too, and older
     * browsers have no top layer, so there greyscale pauses while our UI is
     * on screen (picking, the delay screen) and returns when it closes.
     */
    const TOP_LAYER_ESCAPES_FILTER = SUPPORTS_TOP_LAYER && !/Firefox\//.test(navigator.userAgent);

    function ourUiIsShowing() {
        return !!(selectionCaptureLayer || highlightOverlay || hoverTag || selectionOverlay || pickTab || naming || touchBar || pickerNote ||
            // ACCESS_DELAY_OVERLAY_ID is declared further down; this can run first.
            document.getElementById('redd-focus-access-delay'));
    }

    function refreshGrayscaleFilter() {
        const root = document.documentElement;
        if (!root) return;
        const paused = !TOP_LAYER_ESCAPES_FILTER && ourUiIsShowing();
        root.classList.toggle('redd-focus-grayscale', grayscaleOn && !paused);
    }

    function applyGrayscaleStyle(enabled) {
        ensureGrayscaleCssInjected();
        grayscaleOn = !!enabled;
        refreshGrayscaleFilter();
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
                pointer-events: auto !important;
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
        releaseUiLayerIfEmpty();
        refreshGrayscaleFilter();
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
                (getUiLayer() || document.body || document.documentElement).appendChild(overlay);
                refreshGrayscaleFilter();
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
                if (existing) {
                    // Move the top-layer container (or the screen itself) into <body>.
                    const layer = getUiLayer();
                    if (layer) {
                        if (existing.parentNode !== layer) layer.appendChild(existing);
                    } else if (existing.parentElement !== document.body && document.body) {
                        document.body.appendChild(existing);
                    }
                } else {
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

    // Delay turned off (saved or session-only) while its countdown shows: open the
    // page now. Lock mode stops Delay being turned off, so it is unaffected.
    function endAccessDelayIfTurnedOff() {
        if (!accessDelayActive || !currentSiteIdentifier) return;
        const statusKey = `${currentSiteIdentifier}AccessDelayStatus`;
        chrome.storage.sync.get(statusKey, function (result) {
            let enabled = result[statusKey] === true;
            if (Object.prototype.hasOwnProperty.call(sessionOverrides, statusKey)) {
                enabled = sessionOverrides[statusKey] === true;
            }
            if (!enabled && accessDelayActive) endAccessDelayGate();
        });
    }

    function resolveRedirectTarget(rawInput) {
        const raw = (rawInput || '').trim();
        if (!raw) return null;
        try {
            // A full URL or a path on this site; anything else is a domain typed without https://
            const url = new URL(/^(https?:\/\/|\/)/i.test(raw) ? raw : 'https://' + raw, window.location.origin);
            // A known site's bare domain goes to its www address (bare instagram.com can time out)
            const www = 'www.' + url.hostname;
            if (Object.values(platformHostnames).some(hosts => hosts.includes(www))) url.hostname = www;
            return url.href;
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

    function redirectCandidateIds() {
        const candidateIds = [currentSiteIdentifier];
        if (currentHostname) {
            const bare = currentHostname.replace(/^www\./, '');
            if (bare && candidateIds.indexOf(bare) === -1) candidateIds.push(bare);
            if (currentHostname !== bare && candidateIds.indexOf(currentHostname) === -1) {
                candidateIds.push(currentHostname);
            }
        }
        return candidateIds;
    }

    function redirectKeys() {
        return redirectCandidateIds().flatMap(id => [`${id}RedirectStatus`, `${id}RedirectUrl`, `${id}RedirectAllPages`]);
    }

    // A redirect to elsewhere on this site fires only from its home page, unless "Always load" is ticked.
    function redirectAppliesHere(targetHref, result) {
        const site = host => host.replace(/^(www|m)\./, '');
        if (window.location.pathname === '/' || site(new URL(targetHref).hostname) !== site(window.location.hostname)) return true;
        return redirectCandidateIds().some(id => result[`${id}RedirectAllPages`] === true);
    }

    // Where this page's first enabled redirect rule points, or null.
    function redirectTargetFrom(result) {
        const candidateIds = redirectCandidateIds();
        for (let i = 0; i < candidateIds.length; i++) {
            const statusKey = `${candidateIds[i]}RedirectStatus`;
            const urlKey = `${candidateIds[i]}RedirectUrl`;
            let status = result[statusKey] === true;
            if (Object.prototype.hasOwnProperty.call(sessionOverrides, statusKey)) {
                status = sessionOverrides[statusKey] === true;
            }
            if (!status) continue;
            let rawUrl = typeof result[urlKey] === 'string' ? result[urlKey] : '';
            if (Object.prototype.hasOwnProperty.call(sessionOverrides, urlKey)) {
                rawUrl = sessionOverrides[urlKey];
            }
            return resolveRedirectTarget(rawUrl);
        }
        return null;
    }

    function maybeRedirectFromStorage() {
        if (!currentSiteIdentifier) return;

        chrome.storage.sync.get(redirectKeys(), function (result) {
            const targetHref = redirectTargetFrom(result);
            if (!targetHref || isAlreadyAtRedirectTarget(targetHref) || !redirectAppliesHere(targetHref, result)) {
                maybeStartAccessDelayFromStorage();
                return;
            }

            reportIfRuleActive(true);
            window.location.replace(targetHref);
        });
    }

    // A pick is on unless the popup switched it off (older picks are plain strings).
    function isPickEnabled(item) {
        return typeof item === 'string' || item.enabled !== false;
    }

    // Saved picks plus this page's session picks; a saved pick wins over a session copy of the same selector
    // (so switching a saved pick off in the popup isn't undone by the plain copy kept since it was picked).
    function mergeWithSession(saved) {
        const selectorOf = s => (typeof s === 'string' ? s : s.selector);
        const savedSelectors = new Set(saved.map(selectorOf));
        return [...saved, ...sessionHiddenSelectors.filter(s => !savedSelectors.has(selectorOf(s)))];
    }

    function applyCustomElementStyles(siteIdentifier, selectors) {
        const styleId = `customHidden_${siteIdentifier.replace(/\./g, '_')}Style`;
        // Support both old format (string) and new format (object with name and selector)
        const active = selectors.filter(isPickEnabled);
        const css = active.length > 0 ? active.map(item => {
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

    // Anonymous usage count (see background.js): a day counts only when the
    // user is on a site where one of their own rules is on. Defaults never count.
    let usageReported = false;

    function siteHasActiveRule(callback) {
        if (!currentSiteIdentifier) return callback(false);
        const value = (result, key) => Object.prototype.hasOwnProperty.call(sessionOverrides, key) ? sessionOverrides[key] : result[key];
        const items = currentPlatform ? elementsThatCanBeHidden.filter(item => item.startsWith(currentPlatform)) : [];
        const site = currentSiteIdentifier;
        const keys = items.map(item => item + 'Status').concat(`${site}CustomHiddenElements`, `${site}GrayscaleStatus`, `${site}AccessDelayStatus`, redirectKeys());
        if (currentPlatform) keys.push(`${currentPlatform}Status`);
        chrome.storage.sync.get(keys, function (result) {
            const hideOn = !!currentPlatform && value(result, `${currentPlatform}Status`) !== false && items.some(item => {
                const status = value(result, item + 'Status');
                return item === 'youtubeThumbnails' ? !!status && status !== 'On' : status === true;
            });
            const custom = result[`${site}CustomHiddenElements`];
            callback(hideOn || sessionHiddenSelectors.some(isPickEnabled) || (Array.isArray(custom) && custom.some(isPickEnabled)) ||
                value(result, `${site}GrayscaleStatus`) === true || value(result, `${site}AccessDelayStatus`) === true ||
                !!redirectTargetFrom(result));
        });
    }

    // At most once per page. ruleFired skips the check (a redirect is firing).
    // Never throws: it runs inside Focus's own handlers.
    function reportIfRuleActive(ruleFired) {
        try { reportNow(ruleFired); } catch (e) { /* the count never gets in Focus's way */ }
    }

    function reportNow(ruleFired) {
        if (usageReported || !chrome.runtime?.id) return;
        const report = () => {
            usageReported = true;
            try {
                chrome.runtime.sendMessage({ type: 'usagePing' }, function () { void chrome.runtime.lastError; });
            } catch (e) { /* extension reloaded */ }
        };
        if (ruleFired) return report();
        chrome.storage.local.get('usagePing', function (stored) {
            const state = stored && stored.usagePing;
            if (usageReported || (state && state.lastDay === new Date().toISOString().slice(0, 10))) return;
            siteHasActiveRule(active => { if (active && !usageReported) report(); });
        });
    }

    // --- Listen for storage changes to apply settings immediately ---
    let lastAppliedSettings = {};
    let lastAppliedCustomElements = {};

    function applySettingsFromStorage() {
        if (!chrome.runtime?.id) // don't run if disconnected
            return;

        endAccessDelayIfTurnedOff();

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
                                            // Hide global feeds (including the Best/Hot/New/Top/Rising sorts), but not subreddit feeds.
                                            let isHomePage = window.location.pathname === '/' ||
                                                window.location.pathname.startsWith('/r/popular') ||
                                                (window.location.pathname === '/' && window.location.search.includes('feed=home')) ||
                                                /^\/(?:best|hot|new|top|rising)(?:\/|$)/.test(window.location.pathname);

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
                const merged = mergeWithSession(customSelectors);
                // Check if custom elements have changed
                const currentCustomElements = lastAppliedCustomElements[currentSiteIdentifier] || [];
                if (JSON.stringify(merged) !== JSON.stringify(currentCustomElements)) {
                    applyCustomElementStyles(currentSiteIdentifier, merged);
                    lastAppliedCustomElements[currentSiteIdentifier] = [...merged];
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
            reportIfRuleActive();
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
                const grayscaleStatusKey = `${currentSiteIdentifier}GrayscaleStatus`;
                if (changes[customStorageKey] || changes[grayscaleStatusKey]) {
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

            if (currentSiteIdentifier && changes[`${currentSiteIdentifier}AccessDelayStatus`]) {
                endAccessDelayIfTurnedOff();
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
            reportIfRuleActive();
            if (typeof message.key === 'string' && message.key.endsWith('GrayscaleStatus')) {
                applyGrayscaleStyle(message.value === true);
            }
            setTimeout(applySettingsFromStorage, 50);
        } else if (message.type === 'setGrayscale') {
            applyGrayscaleStyle(message.enabled === true);
            sendResponse({ success: true });
        } else if (message.type === 'setSelectionActive') {
            if (message.active === true) startSelecting();
            else stopSelecting(false);
            sendResponse({ active: isSelecting });
        } else if (message.type === 'getSelectionState') {
            sendResponse({ active: isSelecting });
        } else if (message.type === 'getSessionOverrides') {
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = mergeWithSession(baseSelectors);
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
                const mergedSelectors = mergeWithSession(baseSelectors);
                applyCustomElementStyles(currentSiteIdentifier, mergedSelectors);
                lastAppliedCustomElements[currentSiteIdentifier] = [...mergedSelectors];
                sendResponse({ success: true, customSelectors: mergedSelectors });
            });
            return true; // async response
        } else if (message.type === 'setSessionSelectorEnabled') {
            // Tick or untick a pick that only lives in this page's session
            const index = sessionHiddenSelectors.findIndex(s =>
                (typeof s === 'string' ? s : s.selector) === message.selector
            );
            if (index > -1) {
                const item = sessionHiddenSelectors[index];
                const pick = typeof item === 'string' ? { name: '', selector: item } : { name: item.name || '', selector: item.selector };
                if (!message.enabled) pick.enabled = false;
                sessionHiddenSelectors[index] = pick;
            }
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = mergeWithSession(baseSelectors);
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
                // Replace with object format { name, selector }, keeping whether it is on
                const wasEnabled = isPickEnabled(sessionHiddenSelectors[index]);
                sessionHiddenSelectors[index] = { name: newName, selector: newSelector };
                if (!wasEnabled) sessionHiddenSelectors[index].enabled = false;
            }
            // Reapply styles with updated selectors
            const customKey = `${currentSiteIdentifier}CustomHiddenElements`;
            chrome.storage.sync.get(customKey, function (result) {
                let baseSelectors = result[customKey] || [];
                if (!Array.isArray(baseSelectors)) baseSelectors = [];
                const mergedSelectors = mergeWithSession(baseSelectors);
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
                const mergedSelectors = mergeWithSession(baseSelectors);
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
        } else if (message.type === 'hasActiveRule') {
            siteHasActiveRule(active => sendResponse({ active }));
            return true; // async response
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
                                // Hide global feeds (including the Best/Hot/New/Top/Rising sorts), but not subreddit feeds.
                                let isHomePage = window.location.pathname === '/' ||
                                    window.location.pathname.startsWith('/r/popular') ||
                                    (window.location.pathname === '/' && window.location.search.includes('feed=home')) ||
                                    /^\/(?:best|hot|new|top|rising)(?:\/|$)/.test(window.location.pathname);

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
            const merged = mergeWithSession(customSelectors);
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
        reportIfRuleActive();
    }

})();
