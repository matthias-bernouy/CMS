# @bernouy/cms

Modular CMS built on Web Components with an inline visual editing system. Runs on **Bun** and ships as a Bun-first package — no transpile, consumers execute the TypeScript source directly.

The package is split into two deployables that share one codebase:

- **Control** — admin UI + REST API + visual editor. Authenticated.
- **Delivery** — public rendering. Anonymous. Deployable alone or alongside Control. Serves rendered pages, bloc bundles, theme CSS and the component runtime.

This README is written as a consumer guide: how to wire each layer into your host app, what URLs they expose, and what you need to provide.

---

## Installation

```bash
bun add @bernouy/cms @bernouy/socle mongodb sharp linkedom playwright
```

`@bernouy/socle` provides the HTTP runner (`DefaultRunner`), the authentication interface, and the `MediaUrlBuilder` contract Delivery uses to derive image variant URLs. It's a runtime dependency of the host app, not of this package.

**Requirements:**
- Bun >= 1.3
- MongoDB (used by the default providers)
- TypeScript >= 5.9 (peer dep)
- Playwright browsers if you want Delivery's image enhancement: `bunx playwright install chromium`

---

## Quick start — Control only

The simplest setup runs just the admin layer. Pages are authored but not served publicly.

```ts
// app.ts
import { Authentication, AuthRepositoryProvider, DefaultRunner } from "@bernouy/socle";
import { MongoClient } from "mongodb";
import {
    Cms,
    DefaultCmsRepository,
    DefaultMediaRepository,
} from "@bernouy/cms";

const mongo = await new MongoClient("mongodb://localhost:27017").connect();
const dbName = "my_site";

const runner = new DefaultRunner();

const cmsRepo   = new DefaultCmsRepository(mongo, dbName);
const authRepo  = new AuthRepositoryProvider(mongo, dbName);
const mediaRepo = new DefaultMediaRepository("default", mongo, dbName, runner);

const auth = new Authentication(authRepo, runner, {
    defaultRedirection: "/cms/admin/pages",
    basePath: "/auth",
});

// Scope the runner BEFORE instantiating Cms — Control reads its mount
// prefix from `runner.basePath`.
runner.group("/cms", (scoped) => {
    new Cms(scoped, cmsRepo, auth, mediaRepo);
});

runner.start(4999);
```

Run it:

```bash
bun --hot run app.ts
```

Open `http://localhost:4999/cms/admin/pages` and sign in.

---

## Quick start — Control + Delivery

Production setups pair Control with Delivery on the same host (or on different hosts when your infra prefers it). The two layers share the same Mongo store — the admin reads/writes, Delivery reads.

```ts
import {
    Cms,
    DeliveryCms,
    PlaywrightSession,
    registerDeliveryEndpoints,
    DefaultCmsRepository,
    DefaultMediaRepository,
} from "@bernouy/cms";

// … (socle + mongo setup as above) …

// Admin under /cms (authenticated)
runner.group("/cms", (scoped) => {
    new Cms(scoped, cmsRepo, auth, mediaRepo);
});

// Delivery at the root (public pages + static bundles)
const session = new PlaywrightSession();
runner.group("/", (scoped) => {
    const delivery = new DeliveryCms({
        runner:            scoped,
        repository:        cmsRepo,          // structural typing — same Mongo store
        media:             socleMedia,       // a MediaUrlBuilder from your storage layer
        playwrightSession: session,
    });
    registerDeliveryEndpoints(delivery);
});

runner.start(4999);
```

`DefaultCmsRepository` satisfies `DeliveryRepository` by structural typing — Delivery only needs the read methods. No adapter is required.

---

## Multi-tenant

Because both `Cms` and `DeliveryCms` derive their prefix from `runner.basePath`, hosting many tenants under one server is a matter of scoping:

```ts
const session = new PlaywrightSession();   // one Chromium for every tenant

for (const id of tenantIds) {
    runner.group(`/tenant-${id}/cms`, (scoped) => {
        new Cms(scoped, repoFor(id), auth, mediaFor(id), {
            deliveryUrl: `https://tenant-${id}.delivery.example.com`,
        });
    });
    runner.group(`/tenant-${id}`, (scoped) => {
        const delivery = new DeliveryCms({
            runner:            scoped,
            repository:        repoFor(id),
            media:             mediaFor(id),
            playwrightSession: session,
        });
        registerDeliveryEndpoints(delivery);
    });
}
```

The `PlaywrightSession` is shared across tenants; each `DeliveryCms` has its own in-flight dedup map so cache keys don't collide between tenants.

---

## Constructor signatures

### `Cms` (Control)

```ts
new Cms(
    runner:          Runner,           // from @bernouy/socle, already scoped
    repository:      CmsRepository,    // pages, blocs, templates, snippets, system
    auth:            Authentication,   // from @bernouy/socle
    mediaRepository: MediaRepository,  // admin media provider (files, folders, crops)
    configuration?: {
        tokensUrl?:   string;          // admin "Manage tokens" link target
        deliveryUrl?: string;          // public URL of the paired Delivery service
    },
    cache?: Cache                      // optional, defaults to InMemoryCache
);
```

The constructor registers every admin endpoint on the runner and attaches the auth guard via `runner.group("", cb, [authGuard])`. It does **not** do any work on pages — page routing is Delivery's job.

### `DeliveryCms`

```ts
new DeliveryCms({
    runner?:            Runner;           // defaults to new DefaultRunner()
    media:              MediaUrlBuilder;  // from @bernouy/socle
    repository:         DeliveryRepository;
    cache?:             Cache;            // defaults to DeliveryCache
    playwrightSession?: PlaywrightSession; // share one across tenants; Delivery creates its own if absent
});

registerDeliveryEndpoints(delivery);
```

`registerDeliveryEndpoints` wires:
- Four specific GET routes for asset bundles under `<basePath>/.cms/`
- `<basePath>/robots.txt` and `<basePath>/sitemap.xml`
- A default GET endpoint that resolves any other path against `repository.getPage(pathname)` — pages are served on-demand, there is no boot-time hydration.

---

## What each layer exposes

### Control (under the scoped runner's `basePath`, typically `/cms`)

| Group | Kind | Notes |
|---|---|---|
| `/admin/pages` | UI | List, create, delete pages |
| `/admin/templates` | UI | Manage reusable template compositions |
| `/admin/snippets` | UI | Synchronized fragments shared across pages |
| `/admin/media` | UI | Files, folders, upload, crop |
| `/admin/settings` | UI | Site name, favicon, theme CSS, 404/500 refs |
| `/admin/editor` | UI | Inline visual editor (used by pages, templates, snippets) |
| `/admin/editor-blocs` | Static | Concatenated editor-side bloc bundles |
| `/api/*` | REST | JSON API backing the admin UI |
| `/api/bloc?tag=X` | Static | View-side bloc bundle (consumed by the editor preview) |
| `/resources/{css,fonts}/*` | Static | Admin UI stylesheets and web fonts |

The auth guard lives in `src/control/endpoints/registerEndpoints.ts`. Any request reaching Control must be authenticated with `role === "admin"` or it is redirected to the login page configured on the `Authentication` instance. Non-admin authenticated users get plain 403 (no cross-service redirect).

### Delivery (under the scoped runner's `basePath`, typically `/`)

| Route | Purpose |
|---|---|
| `/<pagePath>` | Rendered public page, resolved via `repository.getPage()` on demand |
| `/.cms/bloc?tag=X` | Compiled view bundle for a bloc, content-addressed via `?v=<hash>` |
| `/.cms/style` | Theme CSS, content-addressed |
| `/.cms/assets/component.js` | Component runtime bundle shared by every bloc IIFE |
| `/.cms/assets/favicon` | Default SVG favicon used when `site.favicon` is empty |
| `/robots.txt` | Auto-generated, references `/.cms/` as `Disallow` |
| `/sitemap.xml` | Lists every visible page with an absolute URL from the request origin |

Responses are cached in `DeliveryCache` (in-memory, pre-compressed gzip + brotli). Edits invalidate via cache keys declared in `src/socle/constants/p9r-constants.ts`.

On a cold cache miss, the page handler **blocks on enhancement**: it runs the full render, then awaits `enhancer.enhance(path, origin)` before serving. Enhancement loads the just-rendered URL in a headless Chromium, measures every `<img>` at every viewport, computes `srcset` + `sizes` via the Socle `MediaUrlBuilder`, rewrites the cached HTML in place, and returns. First request is slow (5-15s); every subsequent request hits a warm cache. This is the property that lets a CDN cache the optimized HTML from its very first fetch, rather than the un-enhanced first pass for the duration of its TTL.

Delivery **never serves media bytes**. Images embedded in page content are expected to be absolute URLs served by Socle's storage backend; Delivery rewrites them into variant URLs at render time via `MediaUrlBuilder.formatImageUrl({ url, width })`.

### REST API (admin, JSON)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/pages` | List pages |
| `POST` | `/api/page?path=<current>` | Create or update a page (query `path` is the current key; body carries the new value for renames) |
| `GET` | `/api/page-exists?path=<p>` | Cheap availability check |
| `GET` | `/api/templates` | List templates |
| `POST` | `/api/template` | Create a template |
| `POST` | `/api/template?id=X` | Update a template |
| `DELETE` | `/api/template?id=X` | Delete a template |
| `GET` | `/api/snippets` | List snippets |
| `POST` | `/api/snippet` | Create/update a snippet |
| `DELETE` | `/api/snippet?id=X` | Delete a snippet |
| `GET` | `/api/system` | Read system config |
| `POST` | `/api/system` | Update system config |
| `GET` | `/api/blocs` | List registered blocs (editor-facing, includes editorJS) |
| `GET` | `/api/blocs-list` | Cheap bloc metadata listing (no bundles) |

---

## Data model

Exported from the public entry point as `type`-only imports:

```ts
import type {
    TPage, TBloc, TTemplate, TSnippet, TSystem,
} from "@bernouy/cms";
```

- **`TPage`** — `{ path, content, title, description, visible, tags }`. Keyed by `path` alone (one page per URL — the legacy `identifier` compound key was removed).
- **`TBloc`** — `{ id, name, group, description, viewJS, editorJS }`. A registered CMS component. `viewJS` is the public-facing bundle, `editorJS` is loaded in the admin editor — they are **separate bundles**, never cross-import. `group` and `description` are persisted alongside the bundles so `GET /api/blocs-list` can answer without parsing any JS.
- **`TSnippet`** — a reusable HTML fragment keyed by a stable `identifier`. Unlike templates, editing a snippet propagates to every page that uses it.
- **`TTemplate`** — a reusable HTML fragment. When inserted into a page it becomes an independent copy (no live link).
- **`TSystem`** — site-wide settings: `site.{name, favicon, host, language, theme, notFound, serverError}`, `editor.layoutCategory`, and an `initializationStep` for the onboarding flow. `notFound/serverError` are `TPageRef = { path } | null`.

---

## Swapping in a custom backend

The defaults target MongoDB, but every collaborator is an interface.

```ts
import type {
    CmsRepository,       // admin-side CRUD — src/socle/contracts/Repository/CmsRepository.ts
    DeliveryRepository,  // delivery-side read-only — src/delivery/interfaces/DeliveryRepository.ts
    MediaRepository,     // admin media provider — src/socle/contracts/Media/MediaRepository.ts
    Cache,               // cache entry store — src/socle/contracts/Cache/Cache.ts
} from "@bernouy/cms";
```

- `CmsRepository` — CRUD for pages, blocs, templates, snippets, system.
- `DeliveryRepository` — strict read-only subset consumed by Delivery. Any `CmsRepository` implementation satisfies it via structural typing (same method shapes), so you typically don't implement it separately.
- `MediaRepository` — admin media CRUD (`upload`, `createFolder`, `moveItem`, …). The default provider is `DefaultMediaRepository` (Mongo GridFS + `sharp` for resize).
- `Cache` — `get/set/delete/deleteMatching/clear` over `CacheEntry` (pre-compressed `raw + gzip + brotli + hash`). `InMemoryCache` is the default. Swap in Redis or similar for a multi-instance deployment.

Delivery additionally takes a Socle `MediaUrlBuilder` — the contract that derives variant URLs (`formatImageUrl({ url, width })`) from absolute storage URLs. Ship whatever implementation wraps your storage backend.

---

## Developing blocs with the `p9r` CLI

The package ships a CLI (`p9r`) for iterating on blocs outside the host app. The bin is wired in `package.json`, so once the package is installed you can run:

```bash
bunx p9r init <folder> [--force]
bunx p9r install-skill [--force]
bunx p9r dev
bunx p9r import [flags]
bunx p9r list-blocs [--json]
bunx p9r help
```

`p9r dev`, `p9r import` and `p9r list-blocs` read their credentials from the environment (or a `.env` file in the current directory):

| Var | Purpose |
|---|---|
| `P9R_URL` | Base URL of the remote CMS, including the admin path prefix — e.g. `http://localhost:4999/cms` |
| `P9R_TOKEN` | Bearer token used to authenticate as an admin against that CMS |

`p9r init` and `p9r install-skill` do not need either variable — they only touch the local filesystem.

### `p9r init` — scaffold a new bloc

`p9r init <folder>` copies the base bloc template into `<folder>` so you can start writing a new bloc from a working skeleton instead of an empty directory.

The scaffold contains everything the CLI expects: `manifest.json`, `Bloc.ts`, `BlocEditor.ts`, `template.html`, `style.css`, `configuration.html`, plus an `assets/` folder with a placeholder thumbnail and image and a `README.md` documenting the `<p9r-*>` configuration tags.

After scaffolding, edit `manifest.json` to set `default-tag` (the custom-element tag — must be globally unique) and `default-group`, then run `p9r dev` from the parent folder to preview it.

Flags:

| Flag | Purpose |
|---|---|
| `--force`, `-f` | Overwrite an existing non-empty folder (disabled by default to protect in-progress work) |

To create an opaque bloc (no editor, sealed subtree, parent-level action bar only), delete `BlocEditor.ts` and `configuration.html` from the scaffold and drop the `"editor"` field from `manifest.json`.

### `p9r install-skill` — install the bloc-creator Claude Code skill

`p9r install-skill` copies the `bloc-creator` Claude Code skill that ships inside the package into `./.claude/skills/bloc-creator/` in the current project. Once installed, Claude Code discovers it automatically and triggers it whenever you ask Claude to "create a bloc" (or component, widget, card, section…) inside a `@bernouy/cms` project — Claude will scaffold the manifest, the view and editor entries, the template, the stylesheet and the configuration panel in one go, following the project's conventions.

The skill is a self-contained folder of instructions and templates; it has no runtime footprint and is only read by Claude Code on demand.

Flags:

| Flag | Purpose |
|---|---|
| `--force`, `-f` | Overwrite an existing non-empty `./.claude/skills/bloc-creator/` (disabled by default to protect local edits to the skill) |

### `p9r dev` — local editor with hot-reload

`p9r dev` boots a local web server that mirrors the remote editor shell but substitutes your locally-built blocs for their remote counterparts. It is the fastest way to iterate on a bloc without publishing anything.

- Walks the cwd looking for folders containing `manifest.json` and builds each one (view + editor bundle; synthesizes an opaque editor if `manifest.editor` is absent).
- Serves `/admin/editor` locally, injecting the dev bundles and shadowing any remote bloc that shares the same tag.
- Proxies everything else (admin UI assets, CSS, API reads) to the remote CMS — so templates, pages, media and system config behave exactly as production.
- **Writes are blocked** except for `POST /api/page`, which is intercepted and persisted to `.p9r-dev/scratch.json` instead of hitting the CMS. That lets you save your edit state across reloads without touching the live database.
- Watches every bloc folder with `fs.watch` and rebuilds on change (150ms debounce). A 1s polling loop also rescans the cwd to catch new folders, renames, copies and deletions that `fs.watch` cannot observe on Linux.
- A server-sent events endpoint (`/dev/reload`) notifies the open browser to reload as soon as a rebuild lands.

Flags:

| Flag | Default | Purpose |
|---|---|---|
| `--port=<n>` | `5000` | Local port for the dev server |
| `--host=<h>` | `localhost` | Host interface to bind |

### `p9r import` — deploy blocs to the CMS

`p9r import` scans the cwd the same way `p9r dev` does, then pushes every freshly-built bloc to `{P9R_URL}/api/bloc` over HTTPS with the admin bearer token.

- Fetches `GET {P9R_URL}/api/blocs` **first** to build a snapshot of the tags already registered. If the CMS is unreachable or the token is refused, the CLI aborts before doing any work.
- Splits the local blocs into `fresh` and `collisions` against that snapshot. **Existing tags are never overwritten** — they are reported with a warning and skipped. To re-import a bloc, delete it from the admin UI first.
- Only `fresh` blocs are built (saves time when most blocs are already in the CMS).
- Uploads each one as `multipart/form-data` with `tag`, `name`, `group`, `viewJS`, `editorJS` (absent for opaque blocs). The server stores the bloc under its manifest `default-tag`.
- Final summary: `N imported, M skipped, K failed`. Non-zero exit code on any failure.

Flags:

| Flag | Purpose |
|---|---|
| `--dry-run` | Scan, build, and show what would be pushed — no network writes |
| `--only=tag1,tag2` | Restrict the run to the listed manifest tags |

### `p9r list-blocs` — discover what's already on the CMS

`p9r list-blocs` queries the remote CMS and prints every registered bloc with its `id`, `name`, `group` and `description`. Use it before scaffolding a new bloc to see what tags already exist — this is the hook the `bloc-creator` Claude Code skill uses to avoid hallucinating components.

The command calls `GET {P9R_URL}/api/blocs-list`, a lightweight endpoint that projects bloc metadata only (no `viewJS` / `editorJS` payloads), so it is cheap to call repeatedly. Output is grouped by `group` and sorted by tag.

Reserved prefixes `w13c-*` and `p9r-*` are system-only — do **not** create blocs with those prefixes, they are reserved for internal CMS components to avoid tag collisions.

Flags:

| Flag | Purpose |
|---|---|
| `--json` | Emit the raw JSON array instead of the human-readable listing (useful for piping into tools) |

---

## Writing your own bloc

A bloc lives in its own folder and is described by a `manifest.json` at its root. The CLI discovers blocs by walking the current working directory looking for that manifest.

```
MyBloc/
├── manifest.json       // declares tag, group, entry files
├── Bloc.ts             // imports Component from @bernouy/cms/component
├── BlocEditor.ts       // imports Editor  from @bernouy/cms/editor    (optional: omit for opaque blocs)
├── template.html       // semantic HTML with <slot>, imported by Bloc.ts
├── style.css           // self-contained, uses global design tokens
└── configuration.html  // declarative config panel, imported by BlocEditor.ts
```

The two sub-entries are isolated on purpose: `@bernouy/cms/component` reaches none of the editor code, so the view bundle that site visitors download never contains `Editor`, `ObserverManager`, `ConfigPanel`, or anything from the admin surface. Keep `Bloc.ts` strictly on `/component` and `BlocEditor.ts` strictly on `/editor`.

`manifest.json` is the single source of truth for the bloc's identity:

```json
{
    "runtime": "0.0.1",
    "bloc":    "./Bloc.ts",
    "editor":  "./BlocEditor.ts",

    "default-tag":   "my-bloc",
    "default-group": "Layout",

    "meta": {
        "author":      "Jane Doe",
        "title":       "My bloc",
        "description": "What it does",
        "categories":  ["layout"],
        "thumbnail":   "./assets/thumbnail.svg"
    }
}
```

- `bloc` — path to the view entry (defaults to `./Bloc.ts`).
- `editor` — path to the editor entry. **Omit this field to deploy an opaque bloc**: the CLI builds a default editor that exposes only parent-level actions (add/move/delete/duplicate) and seals the entire subtree. Nothing inside an opaque bloc can be edited in the inline editor.
- `default-tag` — the custom element tag. This is what ends up in the HTML (`<my-bloc>…</my-bloc>`), and also the primary key in the database. It must be unique across your deployment.
- `default-group` — which section of the BlocLibrary the bloc appears in.
- `meta.title` — label shown in the BlocLibrary; defaults to the folder name if absent.

Rules worth knowing when writing blocs (mirror of `CLAUDE.md`):

- The component bundle and the editor bundle are built **separately**. Never cross-import between `Bloc.ts` and `BlocEditor.ts`.
- Placeholders `BE5_TAG_TO_BE_REPLACED`, `BE5_LABEL_TO_BE_REPLACED`, `BE5_GROUP_TO_BE_REPLACED` are substituted at build time by the wrapper the CLI injects — your own source does **not** need to reference them.
- Do **not** call `super.connectedCallback()` in components.
- Sub-components never own their own editor — their parent editor drives them via `<p9r-comp-sync>`.
- Use `:host([attr="value"])` selectors for enum-like configuration; CSS `attr()` only works for numeric values with a `px` fallback.
- All code, comments, class names, labels and attributes must be in English.

### Configuration panel elements

`configuration.html` is declarative. Use these in preference to raw inputs:

| Element | Role |
|---|---|
| `<p9r-attr-sync>` | Binds an input to an HTML attribute on the component |
| `<p9r-comp-sync>` | Manages slots (default content, allowed actions, multiplicity) |
| `<p9r-state-sync>` | Declares a pinnable runtime state (open dropdown, hover, active tab…) so the author can freeze it from the action bar and edit the element without losing the state |
| `<p9r-image-sync>` | Image picker wired to MediaCenter |
| `<p9r-section>` | Visual grouping inside the panel |
| `<p9r-select>` | Styled dropdown with label |
| `<p9r-range>` | Slider + number input, min/max/unit |
| `<p9r-sizes-select>` | NONE/XS/S/M/L/XL shortcut select |
| `<p9r-link>` | Link picker: internal page, external URL, or media file |

---

## Delivery rendering pipeline

1. A request hits the Delivery runner at `<basePath>/<pagePath>`.
2. The runner's default GET endpoint invokes `handlePageRequest(req, delivery)`.
3. Paths under `<cmsPathPrefix>/` short-circuit to a plain 404 (unknown assets; no DB lookup).
4. Otherwise, `repository.getPage(pathname)` resolves the page. A miss falls back to `site.notFound`; a render exception falls back to `site.serverError`. If those fail too, plain text is returned to avoid recursion.
5. On a cache miss, `renderPage` produces a `CacheEntry { raw, gzip, brotli, contentType, hash }` via `linkedom`. The head is composed by the helpers in `src/delivery/core/head/` and `src/delivery/core/seo/`.
6. Before returning, the handler **awaits** `enhancer.enhance(path, origin)` — Playwright loads the just-rendered URL (which hits the now-warm cache inside), measures every image at every viewport, classifies `loading`/`fetchpriority`, computes `srcset` with the Socle `MediaUrlBuilder.imageConfig.ladderWidths`, rewrites the cached HTML in place, and pre-warms the variant URLs. The response the outer caller receives is the enhanced HTML.
7. Subsequent requests serve the enhanced bytes directly from cache, negotiating `Accept-Encoding` for the right compression variant.

---

## Useful exports cheat sheet

```ts
import {
    // Control
    Cms,                            // admin + API + editor
    InMemoryCache,

    // Delivery
    DeliveryCms,
    DeliveryCache,
    PlaywrightSession,
    registerDeliveryEndpoints,

    // Default providers
    DefaultCmsRepository,
    DefaultMediaRepository,
} from "@bernouy/cms";

import type {
    CmsRepository,
    DeliveryRepository,
    DeliveryCmsConfig,
    MediaRepository,
    Cache,
    TPage, TBloc, TTemplate, TSnippet, TSystem,
} from "@bernouy/cms";
```

Bloc authoring symbols live in two **separate sub-entries** so the view bundle visitors download never contains editor code:

```ts
// View side — imported by Bloc.ts
import { Component } from "@bernouy/cms/component";

// Editor side — imported by BlocEditor.ts
import { Editor, registerEditor, registerEditor_opaque } from "@bernouy/cms/editor";
```

See [Writing your own bloc](#writing-your-own-bloc).

---

## Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | Run the bundled reference host (`App.ts`) with `--hot` |
| `bun run build` | Emit `.d.ts` declarations into `dist/` (no JS bundling — this is a Bun-first source package) |
| `bun run typecheck` | `tsc --noEmit` over the whole package |
| `bun test` | Run the full test suite |

---

## Internal layout (for contributors)

```
src/
├── control/                        — Admin + API + editor (authenticated surface)
│   ├── ControlCms.ts                  Cms class (exported as Cms from the public entry)
│   ├── editor/
│   │   ├── runtime/                   EditorManager, Editor, Component, ObserverManager,
│   │   │                              DragManager, PinMode, registerEditor, ResizeInstance
│   │   ├── components/                BlocActionGroup, BlocLibrary, FloatingToolbar,
│   │   │                              MediaCenter, PageConfiguration, RichTextBar,
│   │   │                              Snippet, SnippetConfiguration, TemplateConfiguration
│   │   ├── configuration/             ConfigPanel, ConfigItem, P9rLink, sync/{Attr,Comp,Image,State}
│   │   ├── editors/                   TextEditor, ImageEditor, ListEditor, SnippetEditor
│   │   └── icons.ts
│   ├── components/                    Reusable admin UI primitives (base/*, admin/*, media/*)
│   ├── endpoints/
│   │   ├── admin-ui/                  Server-rendered admin pages (pages, templates, editor, …)
│   │   ├── admin-api/                 REST JSON API (+ GET /api/bloc for the editor preview)
│   │   ├── admin-resources/           CSS + fonts, served verbatim at /resources/*
│   │   └── registerEndpoints.ts
│   └── server/                        compression-less helpers, editorShell, expandSnippets,
│                                      cache/invalidation, routing, send_html, formData
├── delivery/                       — Public rendering layer (anonymous surface)
│   ├── DeliveryCms.ts
│   ├── core/
│   │   ├── html/                      renderPage, expandSnippets
│   │   ├── pages/                     handlePageRequest, renderRef
│   │   ├── head/                      findUsedBlocs, buildHtmlBasics, buildAssets,
│   │   │                              buildPreconnect, buildScriptTags
│   │   ├── seo/                       defineMetaTags
│   │   ├── assets/                    resolveAssets, buildStyle, buildComponent
│   │   ├── blocs/                     buildBloc
│   │   ├── enhance/                   PageEnhancer, PlaywrightSession, enhancePage,
│   │   │                              classifyImage, computeSrcset, rewriteHTML, viewports
│   │   └── DeliveryCache.ts
│   ├── endpoints/                     bloc, style, robots, sitemap, assets/{component, favicon}
│   ├── interfaces/DeliveryRepository.ts
│   └── registerDeliveryEndpoints.ts
├── socle/                          — Shared contracts + infrastructure (no runtime state)
│   ├── contracts/                     Repository, Media, Cache
│   ├── providers/mongo/               DefaultCmsRepository, DefaultMediaRepository, MediaEndpoints
│   ├── providers/memory/              InMemoryCache
│   ├── constants/                     p9r-constants, editorAttributes
│   ├── utils/                         validation, escapeHtml, getMimeType, searchDoc
│   ├── blocs/                         prepare_bloc, p9rExternalsPlugin
│   └── server/                        compression.ts (shared by Control and Delivery)
└── cli/                            — p9r CLI (dev, import, init, install-skill, list-blocs)
```

See [`CLAUDE.md`](./CLAUDE.md) for the full set of project conventions that apply when extending this package.
