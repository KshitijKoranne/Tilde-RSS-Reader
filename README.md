# Tilde

All the sites you read, in one place.

Tilde collects new posts from the blogs, news sites and newsletters you pick — and nothing else. It is free, there is no account, and everything stays on your own device. The unread count goes down and only down; when it reaches zero the list says so and stops. Every article you open is kept in full text locally, searchable to the sentence.

It runs in two places, and they are the same program: a web page you can open right now, and a Mac app you can put in the Dock.

**Live:** [tilde-rss-reader.vercel.app](https://tilde-rss-reader.vercel.app)
**Mac app:** [latest release](https://github.com/KshitijKoranne/Tilde-RSS-Reader/releases/latest) — universal, free, unsigned (see [Opening it the first time](#opening-it-the-first-time))

Built from the [Claude Design](https://claude.ai/design/p/680e868d-d6bc-45da-974f-39fdf18818bb) project *Tilde RSS reader design* — the "Modernist" design system, the landing page, and the three-column reader.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` and `npm run preview` both mount `api/feed.js` as real middleware (see `vite-api-plugin.ts`), so local runs exercise the same fetch path as production. No `vercel dev` needed.

```bash
npm run build        # typecheck + production build into dist/
npm run typecheck
```

For the Mac app you also need a Rust toolchain ([rustup](https://rustup.rs), 1.77 or newer) and the Xcode command line tools:

```bash
npm run mac:dev      # the app, with the same hot reload as the web build
npm run mac:build    # a universal .app and .dmg
cargo test --manifest-path src-tauri/Cargo.toml
```

`mac:build` needs both architectures installed once:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

## Deploying

The repo is a stock Vercel project: a Vite static build plus one function.

```bash
npx vercel            # preview
npx vercel --prod     # production
```

`vercel.json` sets the SPA rewrite (so `/app` resolves) and the function's timeout. Nothing else is configured, and there is nothing to provision — no database, no environment variables, no secrets.

---

## How it is put together

```
api/feed.js            The only server code: a byte proxy, ~100 lines — web only
src-tauri/src/lib.rs   The Mac shell: four commands, and no proxy at all
src/lib/platform.ts    The four things a browser and a Mac app do differently
src/lib/fetcher.ts     The only place that calls fetch()
src/lib/parse.ts       RSS 2.0 / Atom 1.0 / RDF → articles, in the browser
src/lib/sanitize.ts    Allowlist sanitiser for untrusted feed HTML
src/lib/db.ts          IndexedDB: feeds, articles, settings
src/lib/store.tsx      All application state, one React context
src/lib/suggested.ts   The catalogue offered on first run — offered, not applied
src/styles/            modernist.css is the design system; app.css is layout
```

**Why there is a server at all.** A browser cannot request a third-party feed — CORS forbids it. `api/feed.js` fetches the bytes and hands them back, and does nothing else: no parsing, no storage, no logging. It rejects non-HTTP schemes and private address ranges, caps responses at 5 MB, and times out at 12 seconds.

**Parsing stays on the client** on purpose. That is what makes the native build a deletion rather than a rewrite.

**Feed HTML is untrusted.** `sanitize.ts` runs an allowlist over tags and attributes, re-resolves and scheme-checks every URL, and strips images entirely unless you turn them on. Articles are re-sanitised at render time, not at fetch time, so flipping the images setting applies to what is already stored.

**Feed *metadata* is untrusted too.** A feed's `<link>` is not markup, so it skips the sanitiser, but it still ends up in an `href` — and React does not block `javascript:` URLs. `parse.ts` scheme-checks at `resolve()`, the one point where every feed URL is built.

## Where the app deviates from the design

Four places, all deliberate:

1. **Nothing is subscribed for you.** The mock ships with fixture articles. A real install opens on a source picker and fetches nothing until you choose.
2. **Read articles stay put.** In the design mock, opening an article marks it read, and since the inbox lists only unread items the row vanishes underneath you. The app keeps a "sticky" set — an article marked read while you are looking at it stays in the list until you change view. The unread count still drops immediately.
3. **Feeds are never renamed behind your back.** A refresh adopts the source's own title only when there is nothing better; a feed you already see in the rail keeps its name. Otherwise "Craig Mod" becomes "Craig Mod — Writer + Photographer" on first fetch.
4. **Two of the design's editor props became real settings.** List density and the keyboard-hint strip are toggles in Settings rather than build-time props.

## Keyboard

| Key | |
|---|---|
| `j` / `k` | Next, previous article |
| `o` | Open in the reader |
| `m` | Mark read or unread |
| `s` | Save for later |
| `/` | Search the archive |
| `a` | Add a feed |
| `r` | Refresh every source |
| `f` | Full-screen reading |
| `Esc` | Leave full screen, close a dialog |

## Feeds

**A new install subscribes to nothing.** It opens on a source picker offering 18 widely-read feeds across News, Technology, Science, Programming, and Writing & culture — every one checked live. Nothing is fetched until you subscribe to something. The picker stays put while you pick several, and the same list stays available in Settings; entries drop off it as you follow them.

Adding a feed accepts either a feed URL or an ordinary site address. Tilde tries the address, then any `<link rel="alternate">` the page advertises, then the usual paths (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`). OPML imports and exports from Settings.

Everything lives in IndexedDB under the origin. Clearing site data deletes all of it.

---

## Installing it

Tilde is installable from the browser — "Install" in Chrome's address bar, or Share → Add to Home Screen on iOS. The manifest sets `start_url: /app`, so an installed Tilde launches **straight into the reader** while the web address keeps its landing page. Nobody has to choose between the two.

`public/sw.js` caches the app shell, which means an installed Tilde **opens and reads offline** — your articles were already on the device in IndexedDB; the shell was the only thing that needed the network. Two rules keep it honest: HTML is network-first, so a deploy is never held back by a stale cache, and `/api/feed` is never cached, because feeds are the one thing that must be live.

If you want a real application rather than an installed web page, that is what [the Mac app](#the-mac-app) is — and it has no service worker to go stale, because it has nothing to cache.

Returning to the landing page is cheap either way: it reads a small `localStorage` crumb (counts only, no titles or URLs) written by the reader, so a returning visitor sees **"Continue reading — 12 unread"** instead of the pitch. No redirect, no flash, and the page stays shareable.

## The Mac app

The Mac build is not a port and not a fork. It is the same bundle `npm run build` produces for the website, loaded into a [Tauri 2](https://tauri.app) window — one Rust binary around a WKWebView, about 12 MB installed. No Chromium, no Node, no second copy of the app to keep in step with the first.

Three things follow from that, and they are the reasons to prefer it:

**There is no proxy.** On the web, `api/feed.js` exists for exactly one reason: a browser is forbidden from requesting a third-party feed. A native process is not, so `src-tauri/src/lib.rs` fetches each source directly and the function stops being part of the picture. Your reading list never passes through this project's servers, because it never touches a server at all. That is also why the Mac build handles feeds the web build cannot: it honours a feed's declared charset, so a decade-old `ISO-8859-1` blog reads correctly instead of arriving full of replacement characters.

**There is no service worker.** The web build caches its own shell so it can open offline, and a cache is a thing that can go stale, fail to update, or serve you yesterday's bundle. The Mac app has nothing to cache: the shell is a file on your disk. It opens offline because that is the only way it opens.

**There is no address bar to lose.** Article links open in your real browser rather than replacing the app with a website.

### How little had to change

The web app was already built with the seam in place, so the shell fills it rather than cutting a new one.

| | |
|---|---|
| `src/lib/fetcher.ts` | Already checked for `window.__TILDE_NATIVE_FETCH__` before falling back to the proxy. Untouched. |
| `src/lib/platform.ts` | New. The four capabilities that genuinely differ: fetching, saving a file, picking a file, opening a link. |
| `src-tauri/src/lib.rs` | New. Four `#[tauri::command]`s and about 200 lines, most of it charset handling. |
| Everything else | The parser, the sanitiser, the store, every component and every stylesheet run unmodified in both. |

The webview's own content security policy blocks it from making network requests at all, apart from the font stylesheet. Feeds are fetched by Rust, and the page is not granted the dialog or opener plugins — those are called from the Rust side, so a compromised page cannot open a file or launch anything.

### Opening it the first time

Signing and notarising Mac software requires an Apple Developer account at $99 a year. There is not one behind this, so macOS cannot tell you who built the app and will say so. The warning is about a missing signature, not about anything the app does.

Drag Tilde to Applications, then:

1. **Right-click it and choose Open**, then Open again in the dialog.
2. If macOS refuses outright — recent versions often do — open **System Settings → Privacy & Security**, scroll down to the note about Tilde, and press **Open Anyway**.
3. Failing both, `xattr -dr com.apple.quarantine /Applications/Tilde.app` removes the download flag by hand.

Once, not every launch. The app is signed ad-hoc, which is what lets it run on Apple silicon at all; what it lacks is Apple's countersignature.

If you would rather not take a stranger's binary on trust, `npm run mac:build` produces the same app from this source in one command.

### Where it keeps your reading

Feeds, read state and the full-text archive live in the webview's own store, at
`~/Library/WebKit/in.kjrlabs.tilde` (with a cache alongside it in `~/Library/Caches`).
Nothing is written inside the app bundle, so moving Tilde to the Trash leaves your
reading behind — delete that folder as well for a clean uninstall.

### Moving your feeds between the web and the Mac

The two builds do not talk to each other, by design — there is no account to tie them together and no server holding your list. To move a subscription list across, **Settings → Export OPML** on one side and **Import OPML** on the other. It is one file, it is the same format every other reader speaks, and it is already there in both builds.

What does *not* travel is read state, saved articles, and the local full-text archive. Those are per-install, and they stay that way.

There has been a question about whether a QR code could stand in for that file. It could, with real limits, and the limits are worth stating plainly before anyone builds it:

- **A QR holds about 2.9 kB.** A subscription list compresses to roughly 15 bytes a feed, so 60–80 feeds fit in one code. Read state does not: a few hundred article identifiers overrun it even hashed, so the honest scope of a QR is *the same thing OPML carries*, not more.
- **A QR needs a second camera.** If the Mac app and the browser are on the same Mac — which is the usual case — there is nothing to scan with, and the file is simply faster. QR only earns its place across devices: your Mac's screen, your phone's camera.
- **In that one direction it works well, and needs no scanner code.** If the Mac app renders a QR containing `https://tilde-rss-reader.vercel.app/app#feeds=<compressed>`, the built-in iOS or Android camera opens it in the browser and Tilde reads the list out of `location.hash`. A URL fragment is never sent to the server, so nothing about what you read reaches Vercel even though the link points at it. No camera permission, no scanner library, no account.
- **The other direction needs the clipboard, not a camera.** Browser to Mac is "Copy sync code" / "Paste sync code" — the same compressed payload as text.
- **Continuous two-way sync is a different thing entirely, and it does need a server.** Two devices that are not online at the same moment need a rendezvous point that holds the data in between, and that point needs some way to know which two devices belong together. That token is a credential whether or not it is called a login. This is the line: a one-time handoff can be accountless; ongoing sync cannot be serverless.

So: a QR is a nicer-looking OPML export for one hop, phone-shaped. It is not sync, and calling it sync would be the only real mistake available here.

---

## Verified

`npm run build` typechecks clean. Beyond that, this build was checked against reality rather than assumed:

- Every one of the 18 suggested feeds fetched and parsed live, covering RSS 2.0, Atom 1.0 and RDF.
- The sanitiser was run against ten hostile inputs — `<script>`, `onerror`, `javascript:` and `data:text/html` hrefs, `<iframe>`, `<form>`, inline `style`, `<svg>` — all neutralised.
- The proxy's guards were exercised: `localhost`, `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`, `file://` and malformed URLs are all refused with a readable message.
- 41 end-to-end browser assertions, including regression tests for each bug fixed in the audit: that a first run makes **zero** network requests, that search ignores markup, that unsubscribing mid-refresh sticks across a reload, and that no `javascript:` href ever reaches the DOM.
- 25 further assertions for the installable build: manifest shape, every icon fetched, the service worker taking control, the shell cached while `/api/` is not, the landing CTA switching for a returning reader, and — with the network switched off — the app booting and 30 stored articles still readable. No console errors in either suite.

## Licence

MIT.
