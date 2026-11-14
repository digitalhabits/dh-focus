# Digital Habits: Focus

> Formerly known as ReDD Focus, Viking Focus or MindShield.

<div align="center">
  <img src="Shared%20(Extension)/Resources/images/icon-512.png" alt="Digital Habits: Focus Logo" width="200"/>
</div>

Digital Habits: Focus is a browser extension that makes distracting websites less distracting. It can hide the feeds, recommendations and other parts of a site that pull your attention away, turn a site greyscale, add a delay before it opens, or redirect it somewhere else. It helps people use YouTube, Instagram, LinkedIn and other sites for what they came to do. It works in Safari on Mac, iPhone and iPad, and in Chrome, Edge and Firefox.

It is made by the not-for-profit [Centre for Digital Habits](https://digitalhabits.org) and [backed by research](https://arxiv.org/pdf/2001.04180.pdf) at the universities of Oxford, Copenhagen and Maastricht.

<a href='https://apps.apple.com/gb/app/redd-focus-hide-distractions/id1660218371'><img height=58 alt='Download on the App Store' src='https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg'/></a>
<a href='https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd'><img height=58 alt='Available in the Chrome Web Store' src='https://developer.chrome.com/static/docs/webstore/branding/image/UV4C4ybeBTsZt43U4xis.png'/></a>
<a href='https://microsoftedge.microsoft.com/addons/detail/digital-habits-focus/gmjfgjdhnhcegfelcddbdljdffiaepam'><img height=58 alt='Get it from Microsoft Edge' src='docs/badges/get-it-from-microsoft-edge.png'/></a>
<a href='https://addons.mozilla.org/firefox/addon/digitalhabits-focus/'><img height=58 alt='Get the add-on for Firefox' src='https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg'/></a>

## Demo

<a href="https://digitalhabits.org/tools/focus"><img src="docs/demo.gif" alt="Digital Habits: Focus hiding Shorts and recommended videos on YouTube" width="100%"/></a>

## What the Extension Does

Everywhere you go online, something tries to grab your attention. Digital Habits: Focus lets you decide what you see.

The extension can help you:
- hide feeds, recommendations, Shorts, comments and other distracting sections, with ready-made options for YouTube, Facebook, X, Instagram, LinkedIn, Reddit, Google Search and WhatsApp Web
- hide any part of any other website, by picking it on the page
- make a website greyscale, so it is less tempting
- add a delay before a website opens, with a message that asks what you came to do
- redirect a website to somewhere else
- lock your settings, so changing them takes a short wait

On iPhone and iPad, the extension changes how sites look in Safari. It cannot change the apps.

## How It Works

Click the Focus icon in your browser's toolbar to see the options for the website you are on. Tick the parts you want to hide, or turn on Greyscale, Delay or Redirect.

To hide anything else, click **Pick…** and click the part of the page you want gone. Before anything is hidden, you can make the area larger or smaller, then click **Hide**. You can give each hidden part a name, and show it again from the popup at any time.

Your choices are kept per website. To try something for one visit only, turn off **Auto-save changes to hidden elements** in Settings.

## Privacy

Digital Habits: Focus:
- runs entirely in your browser
- does not require an account
- does not collect personal data, the sites you visit or your settings
- keeps your settings in your browser's own storage

In Chrome, Edge and Safari, it sends one anonymous count a day, with an ID that changes every month, so we know how many people use it. You can turn this off in Settings, under Admin. Firefox sends no count.

## Documentation

- General project overview: this README
- Release notes: [`changelog.md`](changelog.md), written as [`changelog-style.md`](changelog-style.md) describes
- Releases and store uploads: [`docs/app-store-ci.md`](docs/app-store-ci.md)
- Built-in options for each site: [`Shared (Extension)/Resources/selectors.js`](Shared%20(Extension)/Resources/selectors.js)
- Security: [`SECURITY.md`](SECURITY.md)

## Development

The extension's code is in [`Shared (Extension)/Resources`](Shared%20(Extension)/Resources). The same files are used in every browser.

- **Safari (Mac, iPhone, iPad):** open `Digital Habits Focus.xcodeproj` in Xcode and click **Run**.
- **Chrome or Edge:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `Shared (Extension)/Resources`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and choose `Shared (Extension)/Resources/manifest.json`.

## Contributing

Contributions are welcome.

Websites change their pages often, and the built-in options then stop working. If you want to fix or add one:
1. Find the option in [`selectors.js`](Shared%20(Extension)/Resources/selectors.js).
2. Test the change on the website, logged in and logged out, on a computer and on a phone if you can.
3. Submit a pull request that says which part of the page the change affects.

You can also report a bug or suggest an idea in [Issues](https://github.com/digitalhabits/dh-focus/issues), or email [team@digitalhabits.org](mailto:team@digitalhabits.org).
