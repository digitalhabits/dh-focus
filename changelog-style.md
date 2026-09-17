# Changelog style guide

How to write entries in `changelog.md` for **Digital Habits: Focus**.

The changelog is the source for GitHub release notes, Mac / iOS App Store
“What’s New” text, Firefox Add-ons release notes, and the public open-source
history. Write for **everyday people using the extension** — not developers,
and not “tech people”. Automation should format and filter these entries, not
rewrite them into polished prose.

Empty sections are omitted from each release.

---

## Approved headings

Use only these `###` headings, in this order. Prefer the most specific product
heading that fits.

| Heading | What belongs here |
| --- | --- |
| **Branding** | App/extension name, icons, Centre for Digital Habits identity, store listing naming, companion-product renaming when it is identity only, protected hosts for the org site. |
| **Hide Distracting Elements** | Built-in site hide options, custom selectors, element picker, custom CSS, show/hide behaviour, per-site Custom options that change what is hidden on a page. |
| **Delay Opening Websites** | Delay-before-open, delay length, delay screen behaviour/copy, shared unlock/delay message when it is about the pause before a site opens. |
| **Redirects** | Redirect rules (relative page or other website), adding/editing/removing redirects, infinite-redirect protection, anything that changes where opening a site sends you. |
| **Accountability** | Settings lock, unlock wait, unlock challenges/messages when about locking settings (not the delay pause itself), other accountability behaviour that is not hide/delay/redirect. |
| **Digital Habits: Blocker Integration** | Using Focus with Digital Habits: Blocker — allowlist alignment, extension-as-blocking-method behaviour, setup/messaging that makes Blocker blocking work through Focus. |
| **Fixes & Polish** | Popup/Settings layout, theme, accessibility, translations, review prompts, scrolling, typography, and other user-visible polish that does not change hide/delay/redirect/accountability/Blocker behaviour. |
| **Internal** | Refactors, dependencies, tests, build/CI, signing, store packaging, docs-only — no meaningful effect for people using the extension. Same bullet format as other sections. GitHub only; exclude from store “What’s New”. |

Do **not** add headings per screen or site (no separate Popup, YouTube, or
Settings sections). Fold those into the table above.

Do **not** use a nested `### BY PLATFORM` tree. Group by product area; mark
platform limits on the bullet.

---

## Platform tags

Public store What’s New / notes are generated for **macOS** (Mac App Store),
**iOS** (iOS App Store), and **Firefox** (AMO). The extension also ships on
Chrome and Edge; tag those when a change is browser-specific so GitHub notes
stay accurate.

Optional tags go at the start of the bullet:

| Tag | Meaning |
| --- | --- |
| `[macos]` | Mac Safari / Mac App Store only |
| `[ios]` | iOS Safari / iOS App Store only |
| `[firefox]` | Firefox Add-ons only |
| `[chrome]` | Chrome Web Store only |
| `[edge]` | Edge Add-ons only |

Rules:

- Before tagging, **read the extension architecture** (README / store matrix:
  Safari Mac, Safari iOS, Firefox, Chrome, Edge). Tag from where users
  experience the change — not from the PR machine, a single browser test, or
  where the code file lives. Same Mac+iOS Safari change needs `[macos]` and
  `[ios]` bullets, not one invented Safari tag.
- Tags describe **where users experience the change**, not where the code lives.
- Omit the tag when the change applies on every supported browser/app.
- Prefer the narrowest accurate tag.
- Do not invent a combined Safari tag. If the same change ships on Mac and iOS
  but not Firefox, use two bullets — one `[macos]`, one `[ios]`.
- Do not duplicate the same change under multiple sections.

```markdown
- [macos] Existing Mac users now get a one-time announcement on first launch
  explaining the new app name.
- [ios] Existing iPhone and iPad users now get a one-time announcement on first
  launch explaining the new app name.
- [firefox] "Leave a review" opens the Firefox Add-ons page correctly.
```

Untagged bullets apply everywhere.

---

## Writing style

Write **plain sentences** for every section — including Branding, Hide
Distracting Elements, Delay Opening Websites, Redirects, Accountability,
Digital Habits: Blocker Integration, Fixes & Polish, and Internal. Do **not**
use a bold lead-in (`**Short title.** …`). Bold is only for product names or UI
labels inside the sentence when needed.

One or two short sentences per bullet. State the change actively and clearly.
Keep it specific enough that people recognise the change, but not so detailed
that store notes become repetitive or run over character limits.

```markdown
- Take a breath before certain websites open by turning on delay from the
  Custom section.
- [macos] Existing users now get a one-time announcement on first launch
  explaining the new app name.
- The design of the Settings screen has been improved.
```

For UI/layout polish on a screen, prefer **one short screen-level bullet** over
listing each control move or label tweak:

```markdown
- The design of the Settings screen has been improved.
- The design of the popup has been improved.
- Danish translations have been improved.
- [ios] Scrolling in Settings is more stable on smaller screens.
```

Only spell out a specific detail when it is a real bug fix people need to
recognise (e.g. “Leave a review opens the store again”), not when several
small layout or copy tweaks landed together.

### Voice

- Write for everyday people. If a friend who is not technical would not
  understand a word, rewrite it.
- Prefer words they already see in the product: **Digital Habits: Focus**,
  **Digital Habits: Blocker**, **Centre for Digital Habits**, Custom, Settings,
  Theme, delay, redirect, hide.
- Say what changed in plain language. Add why it matters only when that helps.
- Sentence case. British spelling where the product UI does (e.g. Colour,
  greyscale).
- One meaningful change per bullet. Keep most entries to one or two short
  sentences.

### What to keep specific vs what to fold together

- Keep **behaviour** specific under product headings: new hide options, delay
  length, redirect rules, settings lock, Blocker allowlist alignment.
- Under **Fixes & Polish**, fold related UI/copy tweaks on the **same screen**
  into one bullet that names the screen
  (“The design of the Settings screen has been improved.”).
- Translations can be one bullet (“Danish translations have been improved.”)
  unless a new language ships (then say which language was added).
- Never flatten a real behaviour change into vague “improvements”.

### Product terms

Use consistently: **Digital Habits: Focus**, **Digital Habits: Blocker**,
**Centre for Digital Habits**, Custom, Settings, Theme, delay, redirect.

### Avoid

- Bold lead-ins (`**Short title.** Body…`) — they waste store character budget
  and read as repetitive once markdown is stripped.
- Developer jargon: selectors as implementation detail unless users configure
  them, content scripts, native messaging, “under the hood”.
- Hype or filler: “goes harder”, “enhancements”, “various improvements”,
  “polish throughout” with no screen or topic named.
- Technical paths or IDs unless users need them.
- Putting Settings layout under **Accountability** or **Delay Opening
  Websites** just because a label mentions unlock or delay.

Optional release summary: a leading `> …` blockquote under `## vX.Y.Z` is
allowed. Store automation uses the author-written update intro line instead.

---

## Classification rules

1. Classify by **what the user notices**, not by the code area touched.
2. Use a specific product heading before **Fixes & Polish**.
3. Use **Internal** only when there is no meaningful user-facing effect.
4. Popup/Settings layout and theme → **Fixes & Polish**.
5. Unlock message used on the **delay screen** → **Delay Opening Websites**;
   unlock used to open locked Settings → **Accountability**.
6. Hide / delay / redirect behaviour stays under those headings even if the
   plumbing was a content-script change.
7. Add a platform tag only when the change is not universal.
8. Never list the same change in more than one section.

### Good vs avoid

| Change | Put it under | Notes |
| --- | --- | --- |
| New built-in YouTube hide option | **Hide Distracting Elements** | Product behaviour. |
| Delay length default changed | **Delay Opening Websites** | Keep specific. |
| Redirect A→B blocked when B→A exists | **Redirects** | Everyday wording. |
| Settings lock / unlock wait | **Accountability** | Not delay. |
| Focus allowlist matches Digital Habits: Blocker | **Digital Habits: Blocker Integration** | Companion product. |
| Theme rename, popup spacing, review button polish | **Fixes & Polish** | One screen-level bullet when several tiny UI tweaks. |
| Meet Digital Habits: Focus / icons / protected digitalhabits.org | **Branding** | Identity. |
| CI / AMO submit plumbing | **Internal** | No user-facing effect. |
| Same Mac + iOS announcement, not Firefox | **Branding** + `[macos]` and `[ios]` bullets | No combined Safari tag. |
| ~~Various improvements~~ | Avoid | Name the screen or the behaviour. |

---

## Filtering for releases and stores

| Destination | Include |
| --- | --- |
| **GitHub Release** | Exact `## vX.Y.Z` section as markdown: update intro line, all non-empty headings, platform tags, and **Internal** |
| **Any store “What’s New” / AMO notes** | Update intro line + non-empty user-facing sections with headings; **exclude Internal** |
| **Mac App Store** | Untagged + `[macos]` |
| **iOS App Store** | Untagged + `[ios]` |
| **Firefox AMO** | Untagged + `[firefox]` |
| **Chrome / Edge** | Script supports `--platform chrome\|edge` for preview; no public What’s New API in our CI |
| **Platform-specific store text** | Platform tags removed; plain sentences (no `*` / other markdown) |

### Update intro line (required in `changelog.md`)

Directly under `## vX.Y.Z`, before any `###` heading, write one sentence and
**delete the parts that do not apply**:

```markdown
This update comes with some useful new features, design improvements, and under-the-hood improvements.
```

How to choose the parts:

| Phrase | Use when | Do **not** use when |
| --- | --- | --- |
| **useful new features** | Something genuinely new ships — a capability people did not have before (e.g. delay opening websites, redirects as a new capability). | Improving, renaming, clarifying, or fixing something that already exists. |
| **design improvements** | UI, layout, copy, translations, or screen polish. | — |
| **under-the-hood improvements** | Reliability, install/store packaging, or other changes people feel indirectly. | — |

Only keep **useful new features** when there is at least one real new capability
in the release. Renames, clearer UI, and bug fixes are not new features.

Store and GitHub automation copy this line as written (after stripping
markdown). They do not invent it from section headings.

### Store body shape

```text
Hi folks,

This update comes with some design improvements and under-the-hood improvements.

Branding
- Existing users now get a one-time announcement on first launch explaining the new app name…

Fixes & Polish
- The design of the Settings screen has been improved.

Remember that the app is open source — keep your feedback and suggestions coming at https://github.com/digitalhabits/dh-focus

Cheers,
Ulrik & all of us at Centre for Digital Habits
```

Rules for that body:

- Blank line between sections (after the last bullet, before the next heading)
- No blank line between a heading and its first bullet
- No blank line between `Cheers,` and the signature
- Empty sections omitted; **Internal** omitted
- Bullets are plain sentences (no bold lead-ins in the source changelog)

When several versions are combined into one submission:

1. Gather unpublished entries.
2. Merge bullets under the same approved headings.
3. Keep the approved heading order.
4. Keep platform tags when the destination covers more than one platform (GitHub).
5. Remove duplicates.
6. Exclude **Internal** from store text.
7. Use one update-intro line and the standard store greeting/footer only once.

---

## Example release

```markdown
## v6.10.0

This update comes with some useful new features, design improvements, and under-the-hood improvements.

### Branding

- The Centre for Digital Habits site is not hidden or redirected by Focus.

### Hide Distracting Elements

- Per-site Custom options explain what will stay hidden before you turn them
  on.

### Delay Opening Websites

- Choose a delay between 5 and 600 seconds (default 10).

### Redirects

- A redirect from site A to site B is not allowed if site B already redirects
  back to site A.

### Fixes & Polish

- The design of the Settings screen has been improved.
- [ios] Scrolling in Settings is more stable on smaller screens.

### Internal

- Updated documentation and links to the current repository and product names.
```

---

## Checklist

- [ ] Update intro line under `## vX.Y.Z` — only the parts that apply; **new features** only for genuinely new capabilities
- [ ] Only approved headings; empty ones omitted
- [ ] Most specific heading used; **Internal** only when truly invisible
- [ ] Platform tags only where needed (`[macos]` / `[ios]` / `[firefox]` …); no `BY PLATFORM` nesting; no combined Safari tag; tags checked against extension architecture (README / store matrix)
- [ ] Plain sentences only — no bold lead-ins; related UI tweaks on one screen are one screen-level bullet
- [ ] Product terminology matches the extension
- [ ] Entries are already fit for public release notes
