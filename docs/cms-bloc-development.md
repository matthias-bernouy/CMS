# CMS Bloc Development

Authored blocs are custom elements stored in a site project under
`site/blocs/<Group>/<bloc-name>/`. They are compiled by
`@bernouy/cms-bloc-compile` and consumed by Control, Delivery, and the CLI.

## Folder Shape

A bloc folder normally contains:

```text
manifest.json
Bloc.ts
BlocEditor.ts
template.html
style.css
default.html
```

`manifest.json` is the contract:

```json
{
  "runtime": "foundation",
  "default-tag": "base-card",
  "bloc": "./Bloc.ts",
  "editor": "./BlocEditor.ts",
  "defaultContent": "./default.html",
  "meta": {
    "title": "Card",
    "description": "Groups content in a framed surface.",
    "categories": ["Layout"],
    "icon": "panel-top"
  }
}
```

The manifest tag is the bloc identity. Do not derive behavior from a generated
id or from the folder name.

## Registration

Do not call `customElements.define()` in `Bloc.ts` or `BlocEditor.ts`. The build
wrapper owns registration and stamps the manifest tag into the bundle through
`BE5_TAG_TO_BE_REPLACED`.

`validateBloc` rejects:

- invalid custom-element tags;
- reserved prefixes such as system `<p9r-*>`, `<w13c-*>`, and `<cms-*>` names;
- hardcoded or duplicate `customElements.define(...)` calls;
- direct `location.*` navigation mutations.

## View Code

View code imports only the view authoring entry:

```ts
import { Component } from "@bernouy/cms-control/component";
```

Keep view bundles small and browser-safe. Do not import editor code,
`cms-control` internals, Mongo adapters, Node APIs, or server-only feature
subpaths.

Use native CSS for layout. Precompute complex editor-only values in
`BlocEditor.ts` and pass the result through attributes or content.

## Editor Code

Editor code imports stable editor contracts:

```ts
import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
```

or the authoring subpath:

```ts
import { Editor, registerEditor } from "@bernouy/cms-control/editor";
```

The editor bundle is rewritten by `p9rExternalsPlugin`, so editor symbols are
loaded from `window.p9rEditor` instead of bundling the editor runtime into every
bloc.

Use editor settings for user-adjustable choices. Do not hardcode values that
should be configurable by the site author.

## HTML Contracts

Keep `template.html` structural:

- Slots in `template.html` stay empty. Initial content belongs in
  `default.html`.
- Text intended for inline editing should live in a leaf `<span>` containing
  only that text node.
- Avoid raw text mixed with sibling elements.
- Use semantic anchors for static navigation: `<a href="/path">`.

`default.html` contains the initial authored markup for the bloc, including
slotted children.

## Navigation

Never mutate `location` directly from bloc code:

```ts
// Wrong
location.href = "/contact";
location.assign("/contact");
window.location = "/contact";
```

Use an anchor for static navigation:

```html
<a href="/contact"><span>Contact</span></a>
```

Use `history.pushState` only for SPA-style transitions that the site router will
handle after the URL changes.

## Theme And Assets

Use design tokens from `@bernouy/components/style.css`:

| Family | Tokens |
| --- | --- |
| Surfaces | `--bg-base`, `--bg-surface`, `--bg-overlay` |
| Text | `--text-main`, `--text-body`, `--text-muted`, `--text-label` |
| Borders | `--border-default`, `--border-light` |
| Primary | `--primary-base`, `--primary-muted`, `--primary-contrasted` |
| Secondary | `--secondary-base`, `--secondary-muted`, `--secondary-contrasted` |
| Status | `--danger-*`, `--success-*`, `--info-*`, `--warning-*` |
| Context | `--ctx-bg`, `--ctx-fg`, `--ctx-fg-muted`, `--ctx-border` |

Use SVG, PNG, or JPEG assets instead of icon fonts. Inline SVGs are acceptable
when they are part of the bloc structure and can be styled with `currentColor`.
For arbitrary user-uploaded media, prefer image elements and the media tooling.

## Quick Checks

Before pushing blocs, check:

- `manifest.json` points to existing files.
- `Bloc.ts` imports `@bernouy/cms-control/component`.
- `BlocEditor.ts` imports editor contracts only.
- `template.html` has empty slots.
- No direct `location.*` mutation appears in view or editor code.
- CSS reads theme tokens instead of hardcoded brand colors.
