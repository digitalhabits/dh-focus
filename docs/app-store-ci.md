# App Store & add-on store CI

One App Store Connect record (`id1660218371`, `com.ulriklyngs.mind-shield`)
covers Mac and iPhone/iPad. Browser add-on stores use separate secrets below.

**Tag pushes never auto-submit** to Mac, iOS, Chrome, Firefox, or Edge. Use
manual checkboxes on **Release build**, or the standalone submit workflows.

What's new / notes come from [`changelog.md`](../changelog.md) via
`scripts/changelog-to-store-whats-new.js` (see [`changelog-style.md`](../changelog-style.md)):

- `--platform macos` → untagged + `[macos]`
- `--platform ios` → untagged + `[ios]`
- `--platform firefox` → untagged + `[firefox]` → AMO `release_notes` (`en-GB`)
- `--platform chrome` / `--platform edge` → preview only (no public What’s New via our APIs)

Excludes **Internal**. Copies the author-written “This update comes with…” line,
keeps section headings, strips markdown and platform tags. Legacy
`### BY PLATFORM` nesting is still understood for older entries.

Mac / iOS listing description and promotional text live in
[`store-listing/`](../store-listing/) and are stamped on every Apple submit.

## Secrets (`digitalhabits/dh-focus`)

### App Store Connect (Mac + iOS)

| Secret | Source |
| --- | --- |
| `APP_STORE_CONNECT_API_KEY_ID` | ASC API Key ID (Admin role for cloud signing) |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_API_KEY_P8` | `base64 -i AuthKey_*.p8` |
| `ASC_PRIMARY_LOCALE` | optional; default `en-GB`. Confirm Primary Language in ASC → App Information first |

### Firefox Add-ons

| Secret | Notes |
| --- | --- |
| `FIREFOX_EXTENSION_ID` | `mindshield@example.com` |
| `FIREFOX_JWT_ISSUER` | AMO JWT issuer (`user:…:…`) |
| `FIREFOX_JWT_SECRET` | AMO JWT secret |

### Chrome Web Store (API v2)

| Secret | Notes |
| --- | --- |
| `CHROME_EXTENSION_ID` | `hhblkhfdjijdinijakbmcpkmdfhoadcd` |
| `CHROME_PUBLISHER_ID` | CWS publisher ID |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | GCP service account email |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account PEM private key |

### Edge Add-ons (Publish API v1.1)

| Secret | Notes |
| --- | --- |
| `EDGE_PRODUCT_ID` | Partner Center product **GUID** (not listing id `gmjfgjdh…`) |
| `EDGE_CLIENT_ID` | Publish API client ID |
| `EDGE_API_KEY` | Publish API key |

## Workflows

- [`Release build`](../.github/workflows/release.yml) — shared zip + Edge zip + `.pkg` / `.ipa`; checkboxes `submit_mac_app_store` / `submit_ios_app_store` / `submit_addon_stores` (manual default off). Tag `v*` builds/releases only — no store submits.
- [`Submit to add-on stores (Chrome, Firefox, Edge).`](../.github/workflows/addon-store-submit.yml) — standalone / retry from tag; parallel per-store jobs (missing secrets for an enabled store fail that job).
- [`Mac App Store submission`](../.github/workflows/mac-app-store-submit.yml) — retry from Release `.pkg`
- [`iOS App Store submission`](../.github/workflows/ios-app-store-submit.yml) — retry from Release `.ipa`

Packages: `digital-habits-focus-vX.Y.Z.zip` (Chrome/Firefox), `digital-habits-focus-edge-vX.Y.Z.zip` (Edge; strips `background.scripts`). Both attach to GitHub Releases on new Release builds (same names — not `*-chrome-firefox.zip`).

Build Mac/iOS: `scripts/build-appstore.sh ios|macos`.  
Submit Mac/iOS: `fastlane/Fastfile` lanes `submit_mac_app_store` / `submit_ios_app_store`.

**Fail-fast before upload:** each Apple lane refuses to run if that platform
already has a version waiting for review / in review / with unresolved review
issues. It does **not** auto-withdraw — fix App Store Connect manually, then
re-run. Mac and iOS are checked separately (same ASC app, different platforms).

## Local preview

```bash
VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('Shared (Extension)/Resources/manifest.json','utf8')).version)")"
node scripts/changelog-to-store-whats-new.js "$VERSION" --platform macos
node scripts/changelog-to-store-whats-new.js "$VERSION" --platform ios
node scripts/changelog-to-store-whats-new.js "$VERSION" --platform firefox
node scripts/changelog-to-store-whats-new.js "$VERSION" --platform chrome
node scripts/changelog-to-store-whats-new.js "$VERSION" --platform edge
```

Version bump: `./scripts/bump-version.sh X.Y.Z` then add `## vX.Y.Z` to
`changelog.md`. Tag must be `vX.Y.Z` matching `manifest.json`.
