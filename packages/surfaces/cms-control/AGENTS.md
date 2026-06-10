# @bernouy/cms-control

Admin layer of the CMS. Mounts on a runner the consumer provides and exposes
three surfaces under that runner's `basePath` (typically `/cms`):

- `<basePath>/admin/*`   — server-rendered admin pages (static HTML)
- `<basePath>/api/*`     — REST admin API (file-routed under `src/api/`)
- `<basePath>/assets/*`  — built editor bundle (`control-components.js`) + theme assets

Persistence (content, files, secrets), the auth chain, and the public
Delivery layer live in separate packages — pick the impls that fit your
deployment and pass them in.

## Language

**All code, comments, variable names, CSS classes, HTML attributes, titles,
placeholders, and labels MUST be written in English.** No French in code.

## Package layout

```
packages/cms-control/
├── index.ts                 main barrel — exports ControlCms + InMemoryAuthentication
├── component.ts             /component sub-entry — view-side Bloc authoring (Component base)
├── editor.ts                /editor    sub-entry — editor-side Bloc authoring (Editor + registerEditor)
├── data.ts                  /data      sub-entry — pure utility helpers for blocs
├── build.ts                 workspace build hook — calls prebuildControl
├── bunfig.toml              test setup hook (happy-dom + p9r globals)
├── types/                   ambient TS types (HTMLElements, w13c, endpoint, assets, …)
└── src/
    ├── ControlCms.ts        composition root — wires runner + auth + repos + routes
    ├── InMemoryAuthentication.ts   no-op `Authentication<CMS_ROLES>` for `p9r dev` + manual harness
    ├── prebuildControl.ts   `Bun.build` step that bundles `components/index.ts` → `static/assets/control-components.js`
    │
    ├── api/                 file-routed REST endpoints (see "API convention" below)
    │   ├── bloc/            view bundles + source + list per tag
    │   ├── editor/          consolidated editor script (`script.js`) + theme style
    │   ├── files/           `/api/files/*` — list / upload / patch / delete + blob/{id}
    │   ├── identity/        `/api/identity/provider*` — CRUD over login providers
    │   ├── page/            page CRUD + ancestry / suggestions / config-detail
    │   ├── pats/            Personal Access Tokens — list / mint / revoke
    │   ├── secrets/         secret store admin surface
    │   ├── snippet/         snippet CRUD
    │   ├── system/          settings get/put
    │   ├── template/        template CRUD
    │   ├── users/           members list + role assignment
    │   ├── blocs-list.get.ts          flat list for the editor BlocLibrary
    │   └── profil.get.ts              admin Profile page payload
    │
    ├── components/          browser TS bundled into `control-components.js`
    │   ├── admin/           admin-page custom elements (`<cms-form>`,
    │   │                    AdminLayout, Secrets, Tokens, ProviderActions, RoleSelect, …)
    │   ├── editor/          visual editor (EditorRoot, BlocActions, BlocLibrary,
    │   │                    MediaCenter, RichTextBar, FloatingToolbar, snippet/, componentSync/)
    │   ├── data/            JsonEditor + FetchComponent shim
    │   ├── form/            <cms-form>, <cms-validate>
    │   ├── media/           MediaAdmin, GridMedia, CardMedia, CropSystem, DetailMedia
    │   ├── globals.ts       wires `window.p9r.*` constants for browser
    │   └── index.ts         build entry — side-effect-imports every component (self-register)
    │
    ├── core/                non-browser business logic — used by API handlers
    │   ├── authentication/  authGuard wrapper, login page (delegated to auth-core)
    │   ├── data/            getFields helper for editor data binding
    │   ├── dom/             BubblesEvent, buildRequestUrl, meta/basePath (browser-safe)
    │   ├── editorSystem/    Component + Editor base classes, registerEditor,
    │   │                    ObserverManager wiring, defaultEditors/, extensions/
    │   ├── files/           uploadFile + media tree mutations
    │   ├── http/            readJsonBody helper
    │   ├── pages/           page editor wiring (configDetail, suggestions, ancestry)
    │   ├── registerEndpoints/   serveApiFolder + serveStaticFolder bridges
    │   ├── settings/        getSettings + parse
    │   ├── server/          cache/invalidation
    │   ├── showToast.ts     lazy `<p9r-toast-stack>` mount + push helper
    │   ├── validation/      DTO parsers per resource (parsePageCreateDto, …)
    │   └── …
    │
    ├── errors/              HTTP error classes — MissingParam / InvalidParam
    └── static/
        ├── admin/           server-rendered admin HTML pages (Pages, Files, Snippets,
        │                    Templates, Data, Users, Settings, Profil, …)
        ├── editor/          editor HTML (per flavor: page / template / snippet)
        └── assets/          control-components.js + control-styles.css (built artifacts)
```

## Sub-entry boundaries

The `package.json` `exports` field declares four entry points, mapped via
the local `tsconfig.json` `paths`:

- `@bernouy/cms-control`           → `index.ts` (server-side; ControlCms + InMemoryAuthentication)
- `@bernouy/cms-control/component` → `component.ts` (view-side Bloc authoring — only re-exports `Component`)
- `@bernouy/cms-control/editor`    → `editor.ts`    (editor-side Bloc authoring — `Editor`, `registerEditor`, `registerEditor_opaque`)
- `@bernouy/cms-control/data`      → `data.ts`      (pure helpers for `BlocEditor.ts` — `getFields`, `collectAncestorExtensions`, extension types)

`component.ts` and `editor.ts` are isolated **by design**: the view bundle
visitors download must never transitively reach editor code (ObserverManager,
ConfigPanel, BlocActions, …). Bun's `p9rExternalsPlugin` (from
`@bernouy/cms-shared`) intercepts `@bernouy/cms-control/editor` so its
symbols read from `window.p9r.*` (singleton across blocs), preserving
`instanceof` checks across BlocEditor instances. The `data` entry is
NOT intercepted — each call site bundles inline.

## Mounting

```ts
import { BunRunner } from "@bernouy/http-runner";
import { LocalAuthentication } from "@bernouy/cms-auth";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { InMemoryCmsRepository, ... } from "@bernouy/cms-shared";

const runner = new BunRunner();

runner.group("/cms", (sub) => {
    const auth = new LocalAuthentication<CMS_ROLES>(sub, { ... });
    new ControlCms(sub, repo, auth, {},
        cache, secrets, filesMetadata, filesBlob,
        users, identityProviders, pats);
});

new DeliveryCms({ runner, repository: repo, cache });

runner.start(PORT);
```

`ControlCms`'s full constructor signature:

```
new ControlCms(
    runner: Runner,
    repository: CmsRepository,
    auth: Authentication<CMS_ROLES>,
    configuration: { deliveryUrl? } = {},
    cache?: Cache,
    secrets?: SecretStore,
    filesMetadata?: CmsFilesMetadataRepository,
    filesBlob?: CmsFilesBlobStore,
    users?: UsersRepository<CMS_ROLES>,
    identityProviders?: IdentityProviderRepository,
    pats?: PatRepository,
)
```

The first four args are required. Omit `users` / `identityProviders` / `pats`
and the Users admin page, Settings → Identity tab, and Profile → Tokens tab
throw "not configured" until wired.

## API endpoint convention

Reference: `src/api/page/*.ts` is the canonical example.

- **File name**: `<segment>.<method>.ts`. Filename → URL via `deriveRoute` in
  `@bernouy/core`'s `serveApiFolder`:
  - `dir/file.get.ts` → `/dir/file`
  - `dir/dir.get.ts`  → `/dir` (filename = parent → collapses)
  - flat `name.get.ts` → `/name`
  - underscore-prefixed files (`_adminReachability.ts`) are skipped — used
    for internal helpers shared between sibling endpoints.
- **Signature**: `export default async function <handler>(req: Request, cms: ControlCms): Promise<Response>`. Always default-export, always async, second param typed `ControlCms`. Name the parameter `cms`; prefix unused with `_`.
- **Body parsing**: `await readJsonBody(req)` from `src/core/http/readJsonBody`. Throws `InvalidParam('body')` on non-object / malformed JSON.
- **Query params**: `const url = new URL(req.url); const x = url.searchParams.get('x'); if (!x) throw new MissingParam('x')`. Compound names use kebab-case.
- **Validation**: DTO checks live in `src/core/validation/<resource>/parse*Dto.ts`. Endpoint calls `parse<Resource><Action>Dto(body)`; never inline-validates.
- **Business logic**: keep the endpoint a thin glue. Parse → delegate to `src/core/<resource>/<action>.ts` (e.g. `createPage`, `updatePage`) → return. Read endpoints may read `cms.repository.*` directly for straight projections; mutations belong in core.
- **Errors**: throw `MissingParam(name)` / `InvalidParam(name, reason)`. Don't return ad-hoc `new Response("...", { status: 400 })`.
- **Responses**: JSON body `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })`; for mutation success with no body, bare `new Response()`. When the response shape is a public contract, export the type alongside the handler.
- **Repository access**: `cms.repository.*` strictly inside the endpoint or `src/core/<resource>/`.
- **Imports**: use `cms-control/...` path alias (mapped to `src/*` in tsconfig); never relative `../../..` chains.

If an endpoint balloons past ~15 lines or grows imperative validation / persistence, split into the matching `core/validation/<resource>/parse*Dto.ts` + `core/<resource>/<action>.ts` pair.

## Admin UI

Admin pages live in `src/static/admin/*.html` and editor pages in
`src/static/editor/*.html`. Static HTML files served verbatim with
`{{BASE_PATH}}` substitution. **No `.server.ts` / `.client.ts` pair pattern** —
pages compose web components that handle dynamic behavior themselves.

Building blocks consumed by every admin page:

- `<w13c-fixed-admin-layout>` — page chrome with `slot="title"` + `slot="action"`.
- **Data binding** (`@bernouy/components` `src/binding/`) — attribute-driven, activated inside `<cms-binding-core>` (in the page shell). `cms-source="url"` fetches + renders the body (states via `cms-slot="loading|error|empty"`, reload via `cms-reload-on="evt"`); `cms-repeat` iterates; `{{ path }}` interpolates (blank on miss; `{{ x | innerHTML }}` for raw HTML); `#{param}` is a reactive query-param (use `?id=#{id}` to forward — sources don't auto-forward `location.search`); `cms-param-sync` two-way-binds an input to a query param. Replaced the old `<cms-fetch>`.
- `<cms-form>` — wraps an inner `<form>`, posts JSON to `target` on submit, dispatches `form:success` / `form:failed` (bubbles + composed via `BubblesEvent`). `emit="some:event"` re-dispatches on success so a `cms-source` with `cms-reload-on` refreshes.
- `<cms-validate>` — display-transparent (`display: contents`) wrapper. Reads child `[name]` values, POSTs to `url`, applies `setCustomValidity` per field from `{ valid, message?, errors? }`.
- `<cms-media-admin>` — media admin page in a single tag. Header buttons (`+ New folder`, `Upload`) hit the `/api/files` endpoints directly (no form post) and refresh the embedded `<p9r-grid-media>`.
- `<cms-editor-system>` — editor root, mounted on every editor page (page / template / snippet flavor). Handles the editor's shadow DOM, initial bloc registration, and orchestrates `ObserverManager`, `DragManager`, `BlocActions`, `BlocLibrary`.

### Admin UI dependencies

- **`@bernouy/components`** ships every `<p9r-*>` / `<w13c-*>` admin custom element. Its `.` entry is an **IIFE bundle** — a single bare `import "@bernouy/components"` registers every tag. Never import from `@bernouy/core` for UI.
- **`@bernouy/core`** is for infrastructure only: `Runner`, `Authentication`, `Subject`, `Middleware`, envelope crypto. Never pull UI from it.
- **`@bernouy/cms-shared/constants`** is the browser-safe sub-entry exposing `P9R_ATTR`, `P9R_MODE`, `P9R_EVENT`, `P9R_ID`, `P9R_CACHE` — imported by `src/components/globals.ts` to wire `window.p9r.*`. Don't import the main `@bernouy/cms-shared` barrel from `components/` — it transitively reaches Mongo / Bun modules and breaks the browser bundle.
- **`showToast`** lives at `src/core/showToast.ts`. Lazily mounts a `<p9r-toast-stack>` and calls its `push()`.
- **Design tokens** (`--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, …) come from `@bernouy/components/style.css`, exposed at `<basePath>/resources/css/cms-blocs.css`. Admin's `style.css` `@import`s it so every admin page inherits the tokens before any component renders.

## Editor system

Lives under `src/components/editor/` (UI) and `src/core/editorSystem/`
(contracts + base classes + default editors).

- **`<cms-editor-system>`** (`components/editor/EditorSystem/EditorRoot/EditorRoot.ts`) is the editor root. It owns its shadow DOM and instantiates `ObserverManager`, `DragManager`, `BlocActions`, `BlocLibrary`. Public methods include `save()`, `openConfig()`. The flavor is stamped via `data-flavor` (`page` / `template` / `snippet`).
- **No central `EditorManager` class.** The previous monolithic orchestrator was split into per-component classes that talk via DOM events and direct references inside the root's shadow.
- **`Editor` base class** (`src/core/editorSystem/Editor/Editor.ts`) is the per-tag editor contract. Default editors at `src/core/editorSystem/defaultEditors/`: `TextEditor`, `ListEditor`, `ImageEditor`, `SnippetEditor`. `registerEditor` / `registerEditor_opaque` come from `src/core/editorSystem/registerEditor.ts`.
- **`ObserverManager`** walks the editor tree and creates an editor per registered tag. Opaque blocs get `p9r-opaque="true"` after editorizing so descendants bail out (the bloc still gets its parent-level action bar).
- **`<cms-bloc-actions>`** (BAG) is the per-bloc action bar (`BlocActions/BlocActions.ts`). The element is a thin wrapper around a `BagController` (`BlocActions/domain/lifecycle/BagController.ts`) that owns runtime state and sub-controllers (Breadcrumb, InsertButtons, PinMenu). When `setEditor(editor)` is called, BAG creates a `Highlight` overlay on the target.
- **`<cms-bloc-library>`** has 3 sections: Blocs (by group), Templates (by category), Snippets. Templates insert as HTML fragments (independent copies); blocs and snippets insert as custom elements (`<w13c-snippet identifier="…">` keeps a live link to the snippet source).
- **`<cms-floating-toolbar>`** + RichTextBar handle text-format menus on selection.
- **`<cms-media-center>`** is the media picker dialog; created on demand by code that needs it (`ImageEditor`, `ImageSync`, `PageLink`) via `document.createElement("cms-media-center")` + `appendChild(document.body)` + `.show(types)`.
- **Editor preview loads bloc bundles inlined in the consolidated editor-script endpoint** (`src/api/editor/script.js.get.ts`) — it never reaches out to Delivery, which keeps the admin self-sufficient and avoids CORS + deliveryUrl coupling. `GET /api/bloc?tag=X` still exists for the dev CLI.

### Highlight overlay

`Highlight` (`components/editor/EditorSystem/Highlight.ts`) paints a non-interactive outline around any element via a fixed, pointer-events-none, overflow-hidden root attached to `<body>`. Tracks size via `ResizeObserver` + viewport via `scroll`/`resize`. Used by `BagController.setEditor` to mark the active editor without touching its DOM/CSS. Caller must `dispose()` when the target leaves the DOM.

### Configuration syncs

The bloc's config panel (`<p9r-config-panel>`, lives in `components/editor/componentSync/SyncPanel.ts`) projects sync elements through a `<w13c-lateral-dialog>` slot. Each sync is a custom element acting on the bloc:

- **`<p9r-attr-sync>`** (`componentSync/sync/AttrSync.ts`) — input ↔ attribute binding. Empty value removes the attribute rather than leaving `attr=""`.
- **`<p9r-comp-sync>`** (`componentSync/sync/CompSync.ts`) — manages a slot's content. Modes: `allow-multiple` (list with add/delete/duplicate/drag), `optionnal` (single slot that can be empty), `disable-others-components` (locks `DISABLE_CHANGE_COMPONENT` on the slot).
- **`<p9r-image-sync>`** (`componentSync/sync/ImageSync/`) — image picker backed by MediaCenter. **Has its own shadow root** so styles apply regardless of how many shadow roots wrap the host. Split across `ImageSync.ts` (shell), `lock.ts`, `target.ts`, `view.ts`, `mediaCenter.ts`. In non-optional/non-creating mode, `lockActions` sets every `DISABLE_*` flag on the `<img>` so only click-to-open-MediaCenter remains.
- **`<p9r-state-sync>`** (`componentSync/sync/StateSync.ts`) — declares a pinnable runtime state: `target` selector (in shadow DOM), `attr`, `value`, `label`. Interacts with `PinMode`.
- **`<p9r-link>`** (`componentSync/PageLink/`) — link picker with three tabs (internal Page via API, External URL, Media file via MediaCenter). Internally split into `PageLink.ts` (shell), `template.ts`, `detect.ts`, `parts/{flows,wiring,controller}.ts`.

## CSS conventions

- Use attribute selector presets (`:host([bg="surface"]) .inner { ... }`) for configuration-driven styles.
- CSS `attr()` only works for simple numeric values with px fallback: `attr(radius px, 16px)`.
- For enum-like attributes (e.g. background names mapping to CSS variables), always use `:host([attr="value"])` selectors.
- All CSS variables must be self-contained in the component's `style.css`.
- Global design tokens: `--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, etc. — defined in `@bernouy/components/style.css` and pulled in via `<basePath>/resources/css/cms-blocs.css`.
- Admin resources live in `src/static/assets/` (built `control-components.js` + `control-styles.css`) — no compression pipeline; admin is authenticated and low-traffic. `style.css` `@import`s `cms-blocs.css` so design tokens are in scope before anything else.

## Custom element prefix conventions

- **`cms-*`** — internal CMS components (admin shell, editor system, form/data utilities). E.g. `cms-form`, `cms-validate`, `cms-binding-core`, `cms-editor-system`, `cms-bloc-actions`, `cms-bloc-library`, `cms-floating-toolbar`, `cms-media-center`, `cms-media-admin`.
- **`p9r-*`** — public custom elements provided by the framework (from `@bernouy/components`), used inside bloc configurations and editor panels. Reserved system-only — never scaffold a bloc with a `p9r-*` tag.
- **`w13c-*`** — public custom elements from `@bernouy/components` (admin chrome, generic UI). Reserved system-only.

## Key rules

- Sub-components do NOT have their own editor — the parent editor manages them via `<p9r-comp-sync>`.
- Never call `super.connectedCallback()` in components.
- `::slotted()` for styling light DOM children from shadow DOM.
- `:not(:has(::slotted(*)))` pattern to hide empty slot wrappers.
- For events that need to escape shadow boundaries (form lifecycle, custom system signals), use `BubblesEvent` from `src/core/dom/BubblesEvent.ts` (extends `Event` with `bubbles: true, composed: true`).
- A child file ≤ 100 lines and a folder ≤ 6 entries are the working maxima. Split into subfolders when crossing either, mirroring the `PageLink/`, `GridMedia/`, `ImageSync/` patterns.
