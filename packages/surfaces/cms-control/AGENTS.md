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
├── index.ts                 main barrel — exports ControlCms
├── component.ts             /component sub-entry — view-side Bloc authoring (Component base)
├── editor.ts                /editor    sub-entry — editor-side Bloc authoring (Editor + registerEditor)
├── data.ts                  /data      sub-entry — pure utility helpers for blocs
├── build.ts                 workspace build hook — calls prebuildControl
├── bunfig.toml              test setup hook (happy-dom + p9r globals)
├── types/                   ambient TS types (HTMLElements, w13c, endpoint, assets, …)
└── src/
    ├── ControlCms.ts        composition root — wires runner + auth + repos + routes
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
    │   ├── blocs-list.get.ts          flat list for editor block/catalog UI
    │   └── profil.get.ts              admin Profile page payload
    │
    ├── components/          browser TS bundled into `control-components.js`
    │   ├── admin/           admin-page custom elements (`<cms-form>`,
    │   │                    AdminLayout, Secrets, Tokens, ProviderActions, RoleSelect, …)
    │   ├── editor/          shared editor-adjacent UI still used by admin forms
    │   │                    (`MediaCenter` for `<cms-media-input>`)
    │   ├── editorSystemV2/  current editor shell bootstrap
    │   ├── form/            <cms-form>, <cms-media-input>
    │   ├── media/           MediaAdmin, GridMedia, CardMedia, CropSystem, DetailMedia
    │   ├── globals.ts       wires `window.p9r.*` constants for browser
    │   └── index.ts         build entry — side-effect-imports every component (self-register)
    │
    ├── core/                non-browser business logic — used by API handlers
    │   ├── authentication/  authGuard wrapper, login page (delegated to auth-core)
    │   ├── data/            getFields helper for editor data binding
    │   ├── dom/             BubblesEvent, buildRequestUrl, meta/basePath (browser-safe)
    │   ├── editorSystemV2/  control-owned default editors + catalog wiring
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

- `@bernouy/cms-control`           → `index.ts` (server-side; ControlCms)
- `@bernouy/cms-control/component` → `component.ts` (view-side Bloc authoring — only re-exports `Component`)
- `@bernouy/cms-control/editor`    → `editor.ts`    (editor-side Bloc authoring — `Editor`, `registerEditor`, `registerEditor_opaque`)
- `@bernouy/cms-control/data`      → `data.ts`      (pure helpers for `BlocEditor.ts` — `getFields`)

`component.ts` and `editor.ts` are isolated **by design**: the view bundle
visitors download must never transitively reach editor code. Editor contracts
live in `@bernouy/cms-content/editor`. Bun's
`p9rExternalsPlugin` (from `@bernouy/cms-bloc-compile`) intercepts editor
imports so their symbols read from `window.p9rEditor` (singleton across blocs),
preserving `instanceof` checks across BlocEditor instances. The `data` entry is
NOT intercepted — each call site bundles inline.

## Mounting

```ts
import { BunRunner } from "@bernouy/http-runner";
import { LocalAuthentication } from "@bernouy/cms-auth";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { InMemoryCmsRepository, ... } from "@bernouy/cms-content";

const runner = new BunRunner();

runner.group("/cms", (sub) => {
    const auth = new LocalAuthentication<CMS_ROLES>(sub, { ... });
    new ControlCms(sub, repo, auth, {},
        cache, secrets, filesMetadata, filesBlob,
        users, identityProviders, pats, credentials,
        gateway, analytics, roles, { local: auth });
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
    credentials?: LocalCredentialStore,
    gateway?: GatewayRepository,
    analytics?: AnalyticsStore,
    roles?: RolesRepository,
    authBackends?: { local?: LocalAuthentication<CMS_ROLES>; oidc?: OidcAuthentication<CMS_ROLES> },
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
- **Data binding** (`@bernouy/components` `src/binding/`) — attribute-driven, activated inside `<cms-binding-core>` (in the page shell). `cms-source="url"` fetches + renders the body (states via `cms-slot="loading|error|empty"`, reload via `cms-reload-on="evt"`); `cms-repeat` iterates; `{{ path }}` interpolates (blank on miss; `{{ x | innerHTML }}` for raw HTML); `#{param}` is a reactive query-param (use `?id=#{id}` to forward — sources don't auto-forward `location.search`); `cms-param-sync` two-way-binds an input to a query param.
- `<cms-form>` — wraps an inner `<form>`, posts JSON to `target` on submit, dispatches `form:success` / `form:failed` (bubbles + composed via `BubblesEvent`). `emit="some:event"` re-dispatches on success so a `cms-source` with `cms-reload-on` refreshes.
- `<cms-media-admin>` — media admin page in a single tag. Header buttons (`+ New folder`, `Upload`) hit the `/api/files` endpoints directly (no form post) and refresh the embedded `<p9r-grid-media>`.
- `<cms-editor-v2-shell>` — editor root, mounted on every editor page (page / template / snippet flavor). Loads the frame, owns the structure/settings panels, and talks to the stable editor API.

### Admin UI dependencies

- **`@bernouy/components`** ships every `<p9r-*>` / `<w13c-*>` admin custom element. Its `.` entry is an **IIFE bundle** — a single bare `import "@bernouy/components"` registers every tag. Never import from `@bernouy/core` for UI.
- **`@bernouy/core`** is for infrastructure only: `Runner`, `Authentication`, `Subject`, `Middleware`, envelope crypto. Never pull UI from it.
- **`@bernouy/cms-content/constants`** is the browser-safe sub-entry exposing `P9R_ATTR`, `P9R_MODE`, `P9R_EVENT`, `P9R_ID`, `P9R_CACHE` — imported by `src/components/globals.ts` to wire `window.p9r.*`. Don't import the main `@bernouy/cms-content` barrel from `components/` when only constants are needed.
- **`showToast`** lives at `src/core/showToast.ts`. Lazily mounts a `<p9r-toast-stack>` and calls its `push()`.
- **Design tokens** (`--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, …) come from `@bernouy/components/style.css`, exposed at `<basePath>/resources/css/cms-blocs.css`. Admin's `style.css` `@import`s it so every admin page inherits the tokens before any component renders.

## Editor system

The current editor is `@bernouy/cms-editor-system-v2`, mounted by
`src/components/editorSystemV2/bootstrap.ts` and fed by the editor endpoints
under `src/api/editor/`.

- **`<cms-editor-v2-shell>`** owns the chrome: top bar, structure tree,
  settings/overrides panel, frame canvas, selection, save, page/template/snippet
  metadata, block insertion, snippets, templates, and media insertion.
- **Stable editor contracts** live in `@bernouy/cms-content/editor`. Bloc
  authors should extend that `Editor` API and register catalog entries through
  `registerEditor`.
- **Control-owned default editors** live in `src/core/editorSystemV2/`.
  `editorCatalog.ts` binds known base tags to those editors.
- **Frame loading** goes through `src/api/editor/frame.get.ts`; bloc view
  scripts, editor scripts, and binding-core runtime are served by sibling
  editor endpoints.
- **`<cms-media-center>`** remains under `src/components/editor/MediaCenter/`
  because it is a shared admin media picker used outside the editor shell too.

## CSS conventions

- Use attribute selector presets (`:host([bg="surface"]) .inner { ... }`) for configuration-driven styles.
- CSS `attr()` only works for simple numeric values with px fallback: `attr(radius px, 16px)`.
- For enum-like attributes (e.g. background names mapping to CSS variables), always use `:host([attr="value"])` selectors.
- All CSS variables must be self-contained in the component's `style.css`.
- Global design tokens: `--primary-base`, `--bg-surface`, `--text-main`, `--border-default`, etc. — defined in `@bernouy/components/style.css` and pulled in via `<basePath>/resources/css/cms-blocs.css`.
- Admin resources live in `src/static/assets/` (built `control-components.js` + `control-styles.css`) — no compression pipeline; admin is authenticated and low-traffic. `style.css` `@import`s `cms-blocs.css` so design tokens are in scope before anything else.

## Custom element prefix conventions

- **`cms-*`** — internal CMS components (admin shell, editor system, form/data utilities). E.g. `cms-form`, `cms-binding-core`, `cms-editor-v2-shell`, `cms-media-center`, `cms-media-admin`.
- **`p9r-*`** — public custom elements provided by the framework (from `@bernouy/components`), used inside bloc configurations and editor panels. Reserved system-only — never scaffold a bloc with a `p9r-*` tag.
- **`w13c-*`** — public custom elements from `@bernouy/components` (admin chrome, generic UI). Reserved system-only.

## Key rules

- Prefer stable editor contracts from `@bernouy/cms-content/editor`; control may provide default implementations, but bloc authoring should not depend on control internals.
- Never call `super.connectedCallback()` in components.
- `::slotted()` for styling light DOM children from shadow DOM.
- `:not(:has(::slotted(*)))` pattern to hide empty slot wrappers.
- For events that need to escape shadow boundaries (form lifecycle, custom system signals), use `BubblesEvent` from `src/core/dom/BubblesEvent.ts` (extends `Event` with `bubbles: true, composed: true`).
- A child file ≤ 100 lines and a folder ≤ 6 entries are the working maxima. Split into subfolders when crossing either, mirroring the `PageLink/`, `GridMedia/`, `ImageSync/` patterns.
