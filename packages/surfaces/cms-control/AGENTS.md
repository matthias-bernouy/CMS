# @bernouy/cms-control

Admin surface. It mounts on a provided `Runner` and exposes authenticated admin
HTML, the admin REST API, editor endpoints, sources/admin media routes, and the
browser bundle in `src/static/assets/control-components.js`.

## Export Boundaries

- `@bernouy/cms-control`: server-side `ControlCms`.
- `@bernouy/cms-control/component`: view-side component authoring, only
  `Component` from `@bernouy/components/base`. Compositions are server-rendered
  resources without a view class.
- `@bernouy/cms-control/editor`: editor-side bloc authoring helpers. Bloc editor
  bundles are rewritten by `p9rExternalsPlugin` to use `window.p9rEditor`.

Do not let the view authoring subpath import editor code, Control internals, or
server-only modules.

## Package Layout

- `src/ControlCms.ts`: mounts routes and wires injected dependencies.
- `src/api/`: file-routed REST endpoints. See `docs/api-folder.md`.
- `src/static/`: admin/editor HTML fragments and static assets. See
  `docs/static-folder.md`.
- `src/components/`: browser custom elements bundled into
  `control-components.js`.
- `src/core/`: non-browser business logic used by endpoints and components.
- `src/errors/`: HTTP input errors such as `MissingParam` and `InvalidParam`.

## API Rules

- Endpoint files default-export `(req: Request, cms: ControlCms) => Response`.
- Keep endpoints thin: parse, validate, delegate to `src/core/`, return.
- Use `readJsonBody`, DTO parsers, and `MissingParam`/`InvalidParam`.
- Use `cms-control/...` imports, not long relative chains.
- Public response types should be exported beside the handler when consumed by
  browser code.

## Admin UI Rules

- Static pages compose custom elements; avoid page-specific inline scripts.
- Use `@bernouy/components` for `<p9r-*>`, `<w13c-*>`, and binding runtime.
- Use `p9r-nav-tabs` with `p9r-nav-tab` for page-level route tabs; keep route
  selection in the owning Control component and presentation in the shared
  foundation components.
- Use Control-owned `<cms-*>` tags only for internal admin/editor components.
- `cms-shell-detail` owns the `back`, `title`, optional `description`, `actions`, `body`, and `footer` slots.
  Its `size="sm|md|lg|xl|full"` attribute uses the shared container scale for a
  consistent maximum width; prefer it to page-specific pixel widths.
  Put columns in `cms-shell-detail-body`, which owns the optional `left-aside`,
  primary `main`, and optional `aside` regions.
  A shared form can occupy `slot="body"` and contain that column component;
  header submit buttons use `form="…"`. Keep controls and their owning form in
  the same light DOM tree, and keep independent action forms outside it.
  The existing `--w-detail-*` sizing variables apply through both shells.
- `cms-shell-detail[contained]` fills its parent's height, scrolls only its body,
  and displays a fixed header and footer. Detail views presented in a dialog use
  `p9r-modal[placement="end"][content-layout="contained"]` and this shell mode;
  their fields and form stay in the same light DOM. Panel bodies use `tabbed`
  when their main and right-aside form regions need a compact switcher: above
  760 px of available body width both remain columns; otherwise `p9r-tabs`
  switches between Details and Settings without unmounting fields. The
  independent `left-aside` never becomes one of those tabs; use an adaptive
  navigation component there when the page needs in-view navigation. An
  embedded lateral menu with `scrollspy` follows same-page section anchors and
  keeps its compact mobile trigger synchronized. It stays
  sticky in a multi-column layout and returns to normal flow when the regions
  stack. No tab bar appears without right-aside content. `main-label` and `aside-label` customize
  the panel labels. `reveal(control)` exposes the relevant region
  before custom validation focuses a control; native invalid events are handled
  by the body itself. A body with `contained` fills an explicitly bounded parent
  and lets each region scroll independently. A `cms-detail-section[contained]`
  keeps its heading fixed while its body scrolls. Use
  `cms-detail-section[appearance="plain"]` when the containing shell region
  already supplies the visual boundary; its named CSS parts allow that region
  to tune spacing without replacing the shared section structure. Ordinary
  page bodies retain content-driven panel heights so their ancestor page can
  own the scroll instead.
  Panel sections retain the same `cms-detail-section` cards, spacing and typography
  as page views, over the admin's `--bg-base` background.
- Events that cross shadow boundaries should use a bubbles/composed event
  helper.
- Design tokens come from `@bernouy/components/style.css`, exposed through
  `<basePath>/resources/css/cms-blocs.css`.

## Editor Rules

- Stable authoring contracts live in `@bernouy/cms-content/editor`.
- Built-in HTML/CMS editors live under `src/core/editorSystemV2/builtInEditors/`.
- App bloc editors belong to collection integration resources, not to
  `cms-control`.
- Editor frame assets are served by `src/api/editor/*`.
- Keep authored bloc behavior independent from Control internals.

## Dependency Rules

Control is a surface. It consumes feature contracts and receives concrete
stores/repositories through the `ControlCms` constructor. Do not import Mongo or
S3 adapter subpaths here.
