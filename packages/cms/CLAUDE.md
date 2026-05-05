# BE5 CMS

## Language

**All code, comments, variable names, CSS classes, HTML attributes, titles, placeholders, and labels MUST be written in English.** This applies to every file in the project: TypeScript, HTML, CSS, configuration, skills, etc. No French in code.

## Architecture

Three independent layers under `src/`:

- **`src/control/`** — Admin UI + REST API + visual editor. Consumed through the `ControlCms` class. Authenticated, low-traffic, mounted under a runner-scoped prefix (typically `/cms`).
- **`src/delivery/`** — Public rendering layer. Consumed through `DeliveryCms`. Deployable alone: serves rendered pages, bloc bundles, theme CSS, the component runtime and the default favicon. Runs its own `PlaywrightSession` to post-render-enhance pages (srcset, loading, fetchpriority) on first visit.
- **`src/socle/`** — Shared contracts, providers, constants, infrastructure utilities. Both `control/` and `delivery/` depend on `socle/`; never the other way. `delivery/` must never import from `control/`.

Plus:
- **`src/cli/`** — the `p9r` CLI (bloc scaffolding, dev server, deploy).
- **`tests/human/`** — manual test harness (`InMemoryMediaServer`, `HttpMedia`, `InMemoryAuthentication`, runnable via `human.ts`).

Runtime stack — Web Components with Shadow DOM, TypeScript, Bun runtime.

- `Component` base class: `src/control/core/editorSystem/Component.ts` (re-exported from `@bernouy/cms/component`).
- `Editor` base class: `src/control/core/editorSystem/Editor/Editor.ts` (re-exported from `@bernouy/cms/editor`).
- Build placeholders `BE5_TAG_TO_BE_REPLACED`, `BE5_LABEL_TO_BE_REPLACED`, `BE5_GROUP_TO_BE_REPLACED` are injected by the CLI wrapper around the user's entry file; never write them in source.
- Component and editor are built as **separate bundles** — never cross-import between them.

## Multi-tenant / runner scoping

Both `ControlCms` and `DeliveryCms` derive their mount prefix from the runner they receive. Consumer scopes the runner **before** instantiating:

```ts
rootRunner.group("/cms", (scoped) => new ControlCms(scoped, repo, auth, media, cache));
rootRunner.group("/",    (scoped) => new DeliveryCms({ runner: scoped, media, repository }));
```

For multi-tenant, repeat the pattern under tenant-scoped groups (`/tenant-1/cms`, `/tenant-1`, …). Delivery shares a single `PlaywrightSession` across tenants by passing it in the config. No hard-coded `/cms` or `/.cms` survives in the runtime — everything derives from `runner.basePath`.

Routes inside Control:
- `<basePath>/admin/*` — server-rendered admin pages (static HTML files)
- `<basePath>/api/*` — REST admin API (file-routed)
- `<basePath>/resources/*` — fonts + CSS (served via `serveStaticFolder`)

Routes inside Delivery (relative to the delivery runner's basePath):
- `/` + any user page path — resolved on demand via the runner's default GET endpoint
- `<basePath>/.cms/bloc?tag=X` — compiled view bundle for a bloc
- `<basePath>/.cms/style` — theme CSS
- `<basePath>/.cms/assets/component.js` — component runtime
- `<basePath>/.cms/assets/favicon` — default SVG favicon
- `<basePath>/robots.txt`, `<basePath>/sitemap.xml` — crawler well-knowns

## Bloc authoring & deployment

- A bloc is a folder with a `manifest.json` at its root (discovered recursively by the CLI). The manifest declares `bloc` (view entry, default `./Bloc.ts`), `editor` (optional), `default-tag`, `default-group`, `meta.title`, `meta.description`. The `default-tag` is the custom element tag AND the DB primary key — must be globally unique.
- **Import contract — never cross the boundary:** `Bloc.ts` imports `Component` from `@bernouy/cms/component`, `BlocEditor.ts` imports from `@bernouy/cms/editor`. The two sub-entries are deliberately isolated so the view bundle visitors download cannot transitively reach `Editor`, `ObserverManager`, `BlocActions`, etc. There is no `@bernouy/cms/client` entry — it used to exist as a unified barrel and was split on purpose.
- When `manifest.editor` is absent the bloc is **opaque**: the CLI synthesizes a default editor bundle that calls `registerEditor_opaque()`. At runtime `ObserverManager` marks the element with `p9r-opaque="true"` after editorizing it — the bloc keeps its parent-level action bar but `make_it_editor` refuses to descend into the subtree.
- The dev CLI and the server-side `prepare_bloc` both wrap the user's entry in a tiny synthetic file before `Bun.build`. Tag/label/group come from the manifest, never from the user's source.
- `prepare_bloc(fileView, fileEditor, label, group, description, blocId)` lives at `src/socle/blocs/prepare_bloc.ts`. Every bloc is keyed by its manifest tag end to end — no UUID fallback.
- `bloc.post.ts` rejects any POST without a `tag` form field, and the `blocs` collection has a unique index on `id` — re-importing a tag that already exists returns 409. To redeploy, delete from the admin UI first.

## CLI (`p9r`)

Six commands wired in `package.json` bin:
- `p9r init <folder>` — scaffold a new bloc locally (copies `src/cli/resources/bloc-template/`).
- `p9r new <folder>` — scaffold a complete CMS app (Control + Delivery co-hosted) with in-memory providers and basic auth.
- `p9r install-skill` — install the bloc-creator Claude Code skill in the current project.
- `p9r dev` — local editor against a remote CMS with hot-reload.
- `p9r import` — deploy blocs via `POST {P9R_URL}/api/bloc`.
- `p9r list-blocs` — read-only listing of blocs registered on the remote CMS.

`dev`, `import`, `list-blocs` read `P9R_URL` (admin base, including the path prefix, e.g. `http://localhost:4999/cms`) and `P9R_TOKEN` (admin bearer) from env or `.env`. `init`, `new`, `install-skill` are offline.

- `init` and `install-skill` refuse to overwrite a non-empty target unless `--force` / `-f`.
- `dev` proxies everything to the remote except `/admin/editor` (assembled locally), `/bloc?tag=X` (served from local dev bundles when present), and `POST /api/page` (persisted to `.p9r-dev/scratch.json`). Watches bloc folders via `fs.watch` + a 1s polling rescan and pushes reloads over `GET /dev/reload` (SSE).
- `import` fetches `GET /api/blocs` first (fail-fast), splits local blocs into fresh/collision sets, only builds the fresh ones, and uploads. Flags: `--dry-run`, `--only=tag1,tag2`. Collisions are warned and skipped — never overwritten.
- `list-blocs` hits `GET /api/blocs-list`. Reserved prefixes `w13c-*` and `p9r-*` are system-only; never scaffold a bloc with those.

CLI source lives in `src/cli/`.

## Data layer

- Contracts live under `src/socle/contracts/`:
  - `Repository/CmsRepository.ts` — admin-side CRUD surface
  - `Repository/TModels.ts` — `TPage`, `TBloc`, `TTemplate`, `TSnippet`, `TSystem`, `TPageRef`, `PageLink`
  - `Cache/Cache.ts` — storage shape used by both control and delivery
  - `Media/*` — media contracts (re-exported from `@bernouy/socle`)
- Delivery has its own **read-only** repository contract at `src/delivery/interfaces/DeliveryRepository.ts` — strict subset of `CmsRepository` (no CRUD, no editor bundles). A `DefaultCmsRepository` instance satisfies `DeliveryRepository` by structural typing.
- `TBloc = { id, name, group, description, viewJS, editorJS }` — `group` and `description` persisted alongside compiled JS so queries like `getBlocsList()` can answer without parsing the editor bundle. `group` is also baked into `editorJS` via `BE5_GROUP_TO_BE_REPLACED` for the in-browser BlocLibrary; the DB column is the queryable copy.
- `TPage` is keyed by `path` alone. No `identifier` — one page per path.
- `TPageRef = { path } | null` — used for `system.site.notFound` / `system.site.serverError`.
- **Repository providers**: only `src/socle/providers/memory/CmsRepositoryInMemory.ts` ships in-tree today. A Mongo provider may be re-added; until then the in-memory store is the canonical implementation, used by `tests/human/human.ts` and `p9r new`.
- **Media providers**: `tests/human/InMemoryMediaServer.ts` (server-side store + endpoints) paired with `tests/human/HttpMedia.ts` (browser-side `Media` consumer). The consumer follows the `Media` portability contract (no module-level helpers, browser-only globals, serializable via `constructor.toString()` for hydration on the client as `window._cms.Media`).

## API endpoint convention

Reference: `src/control/api/page/*.ts` is the canonical example.

- **File name** — `<segment>.<method>.ts`, segment is the URL path tail (`page.get.ts` → `GET /api/page`, `links.get.ts` → `GET /api/page/links` when nested). Case-sensitive: `configDetail.get.ts` → `/configDetail`. Multi-segment via hyphen (router splits only on `.`): `blocs-list.get.ts` → `/blocs-list`.
- **Signature** — `export default async function <handlerName>(req: Request, cms: ControlCms): Promise<Response>`. Always default-export, always async, second param typed `ControlCms`. Name the parameter `cms` (not `sys`); prefix unused with `_`: `_req: Request`.
- **Body parsing** — `const body = await readJsonBody(req)` from `src/control/core/http/readJsonBody`. Throws `InvalidParam('body')` on non-object / malformed JSON, so endpoints can destructure straight away.
- **Query params** — `const url = new URL(req.url); const x = url.searchParams.get('x');` then `if (!x) throw new MissingParam('x')` from `src/control/errors/Http/MissingParam`. Compound names use kebab-case (`current-path`).
- **Validation** — DTO-shape checks live in `src/control/core/validation/<resource>/parse*Dto.ts` and throw `InvalidParam` on rejection. Endpoint calls `parse<Resource><Action>Dto(body)`; never inline-validates.
- **Business logic** — keep the endpoint a thin glue: parse → delegate to `src/control/core/<resource>/<action>.ts` (e.g. `createPage`, `updatePage`) → return. The handler must not call `cms.repository.*` for mutations; that belongs in core. Read endpoints may call `cms.repository.*` directly for straight projections.
- **Errors** — throw `MissingParam(name)` / `InvalidParam(name, reason)`. Don't return ad-hoc `new Response("...", { status: 400 })` — the throw-based handling is the target convention.
- **Responses**
  - With JSON body: `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })`. For repeated JSON returns within one file, declare a local `json(body)` helper.
  - Mutation success with no body: bare `new Response()`.
  - When the response shape is a public contract, export the type alongside the handler: `export type PageConfigDetailResponse = { … }`.
- **Repository access** — `cms.repository.<method>(...)`. Strictly inside the endpoint or `src/control/core/<resource>/`.
- **Imports** — TS path aliases (`src/control/...`), never relative `../../..` chains.

If an endpoint balloons past ~15 lines or grows imperative validation/persistence, split it into the matching `core/validation/<resource>/parse*Dto.ts` + `core/<resource>/<action>.ts` pair.

## Admin UI

Admin pages live in `src/control/static/admin/*.html` and editor pages in `src/control/static/editor/*.html`. Static HTML files served verbatim with `{{BASE_PATH}}` substitution. **No `.server.ts` / `.client.ts` pair pattern** — pages compose web components that handle dynamic behavior themselves.

Building blocks consumed by every admin page:
- `<w13c-fixed-admin-layout>` — page chrome with `slot="title"` and `slot="action"`.
- `<cms-fetch>` — fetches JSON, stamps a `<template>` against the response, inserts as siblings. Slots: `default` (data), `loading`, `error`, `empty`. `reload-on="event-name"` listens on `document` for refresh triggers; `cms-fetch:reload` is built-in. Public `el.reload()`.
- `<cms-form>` — wraps an inner `<form>`, posts JSON to `target` URL on submit, dispatches `form:success` / `form:failed` (bubbles + composed via `BubblesEvent`). `emit="some:event"` re-dispatches on success so `<cms-fetch reload-on>` receives it.
- `<cms-validate>` — display-transparent (`display: contents`) wrapper. Reads child `[name]` values, POSTs to `url`, applies `setCustomValidity` per field from `{ valid, message?, errors? }` response.
- `<cms-media-admin>` — media admin page in a single tag. Header buttons (`+ New folder`, `Upload`) call `window._cms.Media.uploadFile()` / `createFolder()` directly (no form post) and refresh the embedded `<p9r-grid-media>`.
- `<cms-editor-system>` — editor root, mounted on every editor page (page / template / snippet flavor). Handles the editor's shadow DOM, initial bloc registration, and orchestrates `ObserverManager`, `DragManager`, `BlocActions`, `BlocLibrary`.

### Admin UI dependencies — `@bernouy/socle` vs `@bernouy/webcomponents`

- **`@bernouy/webcomponents`** ships every `<p9r-*>` / `<w13c-*>` admin custom element. Its `.` entry is an **IIFE bundle** — a single bare `import "@bernouy/webcomponents"` registers every tag. Never import from `@bernouy/socle` for UI.
- **`@bernouy/socle`** is for infrastructure only: `Runner`, `Authentication`, `Subject`, `Media`, `MediaItem`, `MediaUrlBuilder`, `Middleware`. Never pull UI from it.
- **`showToast`** lives at `src/control/core/showToast.ts`. Lazily mounts a `<p9r-toast-stack>` and calls its `push()`.
- **Design tokens** (`--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, …) come from `@bernouy/webcomponents/style.css`, exposed at `<basePath>/resources/css/webcomponents.css`. Admin's `style.css` `@import`s it so every admin page inherits the tokens.

## Editor system

Lives under `src/control/components/editor/` (UI) and `src/control/core/editorSystem/` (contracts + base classes + default editors).

- **`<cms-editor-system>`** (`components/editor/EditorSystem/EditorRoot/EditorRoot.ts`) is the editor root. It owns its shadow DOM and instantiates `ObserverManager`, `DragManager`, `BlocActions`, `BlocLibrary`. Public methods include `save()`, `openConfig()`. The flavor is stamped via `data-flavor` (`page` / `template` / `snippet`).
- **No central `EditorManager` class.** The previous monolithic orchestrator was split into per-component classes that talk via DOM events and direct references inside the root's shadow.
- **`Editor` base class** (`src/control/core/editorSystem/Editor/Editor.ts`) is the per-tag editor contract. Default editors at `src/control/core/editorSystem/defaultEditors/`: `TextEditor`, `ListEditor`, `ImageEditor`, `SnippetEditor`. `registerEditor` / `registerEditor_opaque` come from `src/control/core/editorSystem/registerEditor.ts`.
- **`ObserverManager`** walks the editor tree and creates an editor per registered tag. Opaque blocs get `p9r-opaque="true"` after editorizing so descendants bail out (the bloc still gets its parent-level action bar).
- **`<cms-bloc-actions>`** (BAG) is the per-bloc action bar (`BlocActions/BlocActions.ts`). The element is a thin wrapper around a `BagController` (`BlocActions/domain/lifecycle/BagController.ts`) that owns runtime state and sub-controllers (Breadcrumb, InsertButtons, PinMenu). When `setEditor(editor)` is called, BAG also creates a `Highlight` overlay on the target — see below.
- **`<cms-bloc-library>`** has 3 sections: Blocs (by group), Templates (by category), Snippets. Templates insert as HTML fragments (independent copies); blocs and snippets insert as custom elements (`<w13c-snippet identifier="…">` keeps a live link to the snippet source).
- **`<cms-floating-toolbar>`** + RichTextBar handle text-format menus on selection.
- **`<cms-media-center>`** is the media picker dialog; created on demand by code that needs it (`ImageEditor`, `ImageSync`, `PageLink`) via `document.createElement("cms-media-center")` + `appendChild(document.body)` + `.show(types)`.
- **Editor preview loads bloc bundles inlined in the consolidated `editor-script` endpoint** (`src/control/api/editor/script.js.get.ts`) — it never reaches out to Delivery, which keeps the admin self-sufficient and avoids CORS + deliveryUrl coupling. `GET /api/bloc?tag=X` still exists for the dev CLI.

### Highlight overlay

`Highlight` (`components/editor/EditorSystem/Highlight.ts`) paints a non-interactive outline around any element via a fixed, pointer-events-none, overflow-hidden root attached to `<body>`. Tracks size via `ResizeObserver` + viewport via `scroll`/`resize`. Used by `BagController.setEditor` to mark the active editor without touching its DOM/CSS. Caller must `dispose()` when the target leaves the DOM.

### Configuration syncs

The bloc's config panel (`<p9r-config-panel>`, lives in `components/editor/componentSync/SyncPanel.ts`) projects sync elements through a `<w13c-lateral-dialog>` slot. Each sync is a custom element acting on the bloc:

- **`<p9r-attr-sync>`** (`componentSync/sync/AttrSync.ts`) — input ↔ attribute binding. Empty value removes the attribute rather than leaving `attr=""`.
- **`<p9r-comp-sync>`** (`componentSync/sync/CompSync.ts`) — manages a slot's content. Modes: `allow-multiple` (list with add/delete/duplicate/drag), `optionnal` (single slot that can be empty), `disable-others-components` (locks `DISABLE_CHANGE_COMPONENT` on the slot).
- **`<p9r-image-sync>`** (`componentSync/sync/ImageSync/`) — image picker backed by MediaCenter. **Has its own shadow root** so styles apply regardless of how many shadow roots wrap the host. Split across `ImageSync.ts` (shell), `lock.ts`, `target.ts`, `view.ts`, `mediaCenter.ts`. In non-optional/non-creating mode, `lockActions` sets every `DISABLE_*` flag on the `<img>` so only click-to-open-MediaCenter remains.
- **`<p9r-state-sync>`** (`componentSync/sync/StateSync.ts`) — declares a pinnable runtime state: `target` selector (in shadow DOM), `attr`, `value`, `label`. Interacts with `PinMode`.
- **`<p9r-link>`** (`componentSync/PageLink/`) — link picker with three tabs (internal Page via API, External URL, Media file via MediaCenter). Internally split into `PageLink.ts` (shell), `template.ts`, `detect.ts`, `parts/{flows,wiring,controller}.ts`.

## Delivery system

Lives under `src/delivery/`.

- `DeliveryCms` (`src/delivery/DeliveryCms.ts`) holds `runner`, `repository` (`DeliveryRepository`), `media` (Socle `MediaUrlBuilder`), `cache` (defaults to `DeliveryCache`), and a `PageEnhancer`.
- `basePath` and `cmsPathPrefix` are derived from `runner.basePath`:
  - `basePath` = `runner.basePath === "/" ? "" : runner.basePath`
  - `cmsPathPrefix` = `basePath + "/.cms"` — always contains the `/.cms` suffix
- Page resolution is on-demand: `runner.setDefaultEndpoint("GET", handlePageRequest)`, every request that doesn't match a specific asset route falls through to the page handler, which does a single DB lookup and either renders + caches + enhances, or 404s. No boot-time route hydration.
- **Render pipeline** (`src/delivery/core/html/renderPage.ts`) is a thin orchestrator composing fixed head builders: `buildHtmlBasics`, `buildPreconnect`, `resolveAssets` + `buildAssetPreloads`, `buildFoucShell`, `defineMetaTags`, `buildStylesheetLink`.
- **Page enhancement** (`src/delivery/core/enhance/`) runs synchronously on cache miss: `PageEnhancer.enhance(path, origin)` awaits until enhanced bytes are committed, with an in-flight dedup map. `PlaywrightSession` opens a long-lived Chromium (injectable so a shared session spans tenants). `enhancePage` measures images at every viewport, classifies `loading` / `fetchpriority`, computes `srcset` via `MediaUrlBuilder.imageConfig.ladderWidths`, rewrites cached HTML, pre-warms variant URLs.
- **Delivery never serves media bytes.** Images referenced from page content are absolute URLs served by Socle's storage backend; Delivery derives variant URLs via `formatImageUrl` at render and rewrite time. There is no `/media?id=X` endpoint on the Delivery runner.
- `DeliveryCache` is an isolated `InMemoryCache`-equivalent scoped to Delivery (own file, own DEV bypass). Cache key for pages is `P9R_CACHE.page(path)`.

## Shared infrastructure (`src/socle/`)

- `contracts/` — repository + cache + media interfaces, `TModels`.
- `providers/memory/` — in-memory cache + repository (the canonical implementations until a Mongo provider is re-added).
- `constants/p9r-constants.ts` — cache key builders, event names, DOM ids, mode tokens.
- `constants/editorAttributes.ts` — DOM attribute names consumed by editors.
- `utils/validation.ts` — shared path / snippet-identifier / custom-element-tag validators.
- `server/compression.ts` — `compress(raw, contentType) → CacheEntry`, `cachedResponseAsync`, `sendCompressed`, `SECURITY_HEADERS`, `HTML_CSP_HEADER`. Used by both Control (editor bundle, admin bundles) and Delivery (pages, bloc bundles, theme).
- `blocs/prepare_bloc.ts` + `p9rExternalsPlugin.ts` — server-side bloc compilation used by `bloc.post.ts` and the dev CLI.

## CSS conventions

- Use attribute selector presets (`:host([bg="surface"]) .inner { ... }`) for configuration-driven styles.
- CSS `attr()` only works for simple numeric values with px fallback: `attr(radius px, 16px)`.
- For enum-like attributes (e.g. background names mapping to CSS variables), always use `:host([attr="value"])` selectors.
- All CSS variables must be self-contained in the component's `style.css`.
- Global design tokens: `--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, etc. — defined in `@bernouy/webcomponents/style.css` and pulled in via `<basePath>/resources/css/webcomponents.css`.
- Admin resources live in `src/control/admin-resources/css/` and `/fonts/`, served at `<basePath>/resources/{css,fonts}/*` (no compression pipeline; admin is authenticated and low-traffic). `style.css` `@import`s `webcomponents.css` so design tokens are in scope before anything else.

## Configuration inputs

Use styled inputs in `configuration.html` instead of raw native elements:

- `<p9r-select>` — styled dropdown with label
- `<p9r-range>` — slider + number input with label, min, max, unit
- `<p9r-sizes-select>` — shortcut for NONE/XS/S/M/L/XL select
- `<p9r-link>` — link picker with three tabs (internal Page / External URL / Media file)
- `<p9r-image-sync>` — image picker via MediaCenter
- `<p9r-state-sync>` — declares a pinnable runtime state

## Custom element prefix conventions

- **`cms-*`** — internal CMS components (admin shell, editor system, form/data utilities). E.g. `cms-form`, `cms-validate`, `cms-fetch`, `cms-editor-system`, `cms-bloc-actions`, `cms-bloc-library`, `cms-floating-toolbar`, `cms-media-center`, `cms-media-admin`.
- **`p9r-*`** — public custom elements provided by the framework, used inside bloc configurations and editor panels. Reserved system-only — never scaffold a bloc with a `p9r-*` tag.
- **`w13c-*`** — public custom elements from `@bernouy/webcomponents` (admin chrome, generic UI). Reserved system-only.

## Key rules

- Sub-components do NOT have their own editor — the parent editor manages them via `<p9r-comp-sync>`.
- Never call `super.connectedCallback()` in components.
- `::slotted()` for styling light DOM children from shadow DOM.
- `:not(:has(::slotted(*)))` pattern to hide empty slot wrappers.
- `src/delivery/` must not import from `src/control/`. Shared helpers go to `src/socle/`.
- Admin repository and Delivery repository are separate contracts by design — same store, different surfaces. Control mutates, Delivery reads.
- For events that need to escape shadow boundaries (form lifecycle, custom system signals), use `BubblesEvent` from `src/control/core/dom/BubblesEvent.ts` (extends `Event` with `bubbles: true, composed: true`).
- A child file ≤ 100 lines and a folder ≤ 6 entries are the working maxima. Split into subfolders when crossing either, mirroring the `PageLink/`, `GridMedia/`, `ImageSync/` patterns.
