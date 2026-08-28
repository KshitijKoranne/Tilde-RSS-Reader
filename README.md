# Tilde

An RSS reader that ends.

Tilde shows you the sources you chose and nothing else. The unread count goes down and only down; when it reaches zero the list says so and stops. Every article you open is kept in full text on your own machine, searchable to the sentence. There is no account, no ranking, and no server holding your reading.

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
api/feed.js            The only server code: a byte proxy, ~100 lines
src/lib/fetcher.ts     The only place that calls fetch()
src/lib/parse.ts       RSS 2.0 / Atom 1.0 / RDF → articles, in the browser
src/lib/sanitize.ts    Allowlist sanitiser for untrusted feed HTML
src/lib/db.ts          IndexedDB: feeds, articles, settings
src/lib/store.tsx      All application state, one React context
src/styles/            modernist.css is the design system; app.css is layout
```

**Why there is a server at all.** A browser cannot request a third-party feed — CORS forbids it. `api/feed.js` fetches the bytes and hands them back, and does nothing else: no parsing, no storage, no logging. It rejects non-HTTP schemes and private address ranges, caps responses at 5 MB, and times out at 12 seconds.

**Parsing stays on the client** on purpose. That is what makes the native build a deletion rather than a rewrite.

**Feed HTML is untrusted.** `sanitize.ts` runs an allowlist over tags and attributes, re-resolves and scheme-checks every URL, and strips images entirely unless you turn them on. Articles are re-sanitised at render time, not at fetch time, so flipping the images setting applies to what is already stored.

## Where the app deviates from the design

Three places, all deliberate:

1. **Read articles stay put.** In the design mock, opening an article marks it read, and since the inbox lists only unread items the row vanishes underneath you. The app keeps a "sticky" set — an article marked read while you are looking at it stays in the list until you change view. The unread count still drops immediately.
2. **Feeds are never renamed behind your back.** A refresh adopts the source's own title only when there is nothing better; a feed you already see in the rail keeps its name. Otherwise "Craig Mod" becomes "Craig Mod — Writer + Photographer" on first fetch.
3. **Two of the design's editor props became real settings.** List density and the keyboard-hint strip are toggles in Settings rather than build-time props.

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

A new install starts with six sources — Craig Mod, Robin Sloan, Ink & Switch, Low-tech Magazine, Julia Evans, The Whippet. They are ordinary subscriptions: unsubscribe in Settings and they stay gone.

Adding a feed accepts either a feed URL or an ordinary site address. Tilde tries the address, then any `<link rel="alternate">` the page advertises, then the usual paths (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`). OPML imports and exports from Settings.

Everything lives in IndexedDB under the origin. Clearing site data deletes all of it.

---

## The Mac app

The web build is already shaped for it. `src/lib/fetcher.ts` is the single network boundary and checks for `window.__TILDE_NATIVE_FETCH__` before falling back to the proxy, so a Tauri v2 shell needs to:

1. Wrap `dist/` in a Tauri window.
2. Install `window.__TILDE_NATIVE_FETCH__` on startup, backed by Tauri's HTTP plugin — native requests have no CORS restriction, so `api/feed.js` stops being used at all.
3. Optionally move the archive from IndexedDB to a file on disk via `src/lib/db.ts`, which is the only module that touches storage.

No component, no parser, and no stylesheet changes.

---

## Verified

`npm run build` typechecks clean. Beyond that, this build was checked against reality rather than assumed:

- All six starter feeds fetched, parsed, and rendered live (118 articles), covering RSS 2.0 and Atom.
- The sanitiser was run against ten hostile inputs — `<script>`, `onerror`, `javascript:` and `data:text/html` hrefs, `<iframe>`, `<form>`, inline `style`, `<svg>` — all neutralised.
- The proxy's guards were exercised: `localhost`, `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`, `file://` and malformed URLs are all refused with a readable message.
- 28 end-to-end browser assertions: first-run seeding, fetching, keyboard navigation, save, mark-read stickiness, full-screen, search, subscribe, unsubscribe, settings, reload persistence, and no horizontal overflow at 780px. No console errors.

## Licence

MIT.
