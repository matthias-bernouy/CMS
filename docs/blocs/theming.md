# Make A Bloc Themeable

CmsCore separates site-wide theme decisions from per-Bloc presentation:

1. the active structured theme supplies stable global design tokens;
2. `site/theme.css` supplies free-form site CSS;
3. a Bloc maps global tokens to its own public custom properties;
4. semantic attributes select finite variants;
5. `::part` and Light DOM slots provide deliberate override points.

This allows one Bloc implementation to follow several site themes without
turning every CSS declaration into an editor setting.

## Site Themes

Structured theme settings contain a shared token catalogue, several named
value sets, and one active theme. The default catalogue includes:

| Family | Default variables |
| --- | --- |
| Brand | `--primary-base`, `--primary-contrasted`, `--secondary-base`, `--secondary-contrasted` |
| Surfaces | `--bg-base`, `--bg-surface`, `--border-default` |
| Text | `--text-main`, `--text-muted` |
| Feedback | `--success-base`, `--warning-base`, `--danger-base` |
| Typography | `--font-heading`, `--font-body`, `--font-size-body`, `--font-size-display` |
| Spacing and widths | `--space-sm`, `--space-md`, `--space-xl`, `--content-width`, `--wide-width` |
| Shape and elevation | `--radius-control`, `--radius-card`, `--shadow-soft` |

When it is loaded, the component-toolkit stylesheet also defines contextual
aliases such as `--ctx-bg`, `--ctx-fg`, `--ctx-fg-muted`, and `--ctx-border`. It
is an extended catalogue, not part of the guaranteed structured theme token
set in Delivery. Always fall back from these aliases to a structured token. A
coloured parent surface can reroute them so nested blocs remain readable
without knowing the parent's variant.

Control edits structured theme values. In a local site, `p9r pull` materializes
those settings in `site/system.json` and free-form CSS in `site/theme.css`.
Delivery serves both through `/.cms/style`: free-form CSS is emitted first and
the active structured token values follow. Therefore structured values are
authoritative when both layers assign the same managed variable.

When an active theme defines dark values, they apply through
`prefers-color-scheme: dark` and may be forced with
`data-theme-mode="dark"` on the root element. The default theme currently has
no dark overrides.

## Bloc-Level Contract

Map global tokens to names owned by the Bloc, and always provide a sensible
fallback:

```css
:host {
  --site-card-background: var(--bg-surface, Canvas);
  --site-card-color: var(--ctx-fg, var(--text-main, CanvasText));
  --site-card-muted-color: var(--ctx-fg-muted, var(--text-muted, currentColor));
  --site-card-border-color: var(--ctx-border, var(--border-default, currentColor));
  --site-card-radius: var(--radius-card, 0.5rem);
  --site-card-padding: var(--space-md, 1rem);

  display: block;
  color: var(--site-card-color);
  font: inherit;
}

[part="card"] {
  display: grid;
  padding: var(--site-card-padding);
  border: 1px solid var(--site-card-border-color);
  border-radius: var(--site-card-radius);
  background: var(--site-card-background);
}

[part="description"] {
  color: var(--site-card-muted-color);
}
```

A site may now tune the component without reaching into its Shadow DOM:

```css
site-card {
  --site-card-radius: 1.25rem;
  --site-card-padding: 2rem;
}
```

Use namespaced Bloc variables for supported knobs. Avoid exposing internal
implementation variables accidentally, and avoid hardcoded brand colours in a
reusable Bloc.

## Attributes, Color Settings, Parts, And Slots

Use attributes for finite semantic choices:

```css
:host([appearance="plain"]) [part="card"] {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

:host([appearance="elevated"]) [part="card"] {
  box-shadow: var(--site-card-shadow, var(--shadow-soft, 0 0.5rem 1.5rem rgb(0 0 0 / 12%)));
}
```

An editor `color` setting also writes an attribute. If that value controls a
Shadow DOM declaration, the view must map it explicitly to a custom property:

```ts
static observedAttributes = ["background-color"];

attributeChangedCallback(): void {
    const value = this.getAttribute("background-color")?.trim();
    if (value) {
        this.style.setProperty("--site-card-background", value);
    } else {
        this.style.removeProperty("--site-card-background");
    }
}
```

Expose `part="..."` only on structural nodes a site may reasonably target.
`site-card::part(card)` can then override that node, but cannot pierce deeper
Shadow DOM. `::slotted(...)` styles only the first distributed Light DOM
level—all elements directly assigned to the slot—not their descendants. Theme
rich authored content through
inherited properties and normal site CSS rather than fragile deep selectors.
Treat published custom-property, part, and slot names as public contracts:
renaming one can break site themes or already-authored content.

## Responsive And Accessible By Construction

A Bloc may occupy a narrow grid cell or the full page. Use container queries
for layout changes driven by its allocated width instead of viewport-only media
queries:

```css
:host {
  container-type: inline-size;
}

@container (min-width: 40rem) {
  [part="card"] {
    grid-template-columns: minmax(0, 2fr) minmax(12rem, 1fr);
  }
}
```

The Bloc author owns these rules; a site editor should choose content and
semantic variants, not maintain breakpoint values. Preserve focus indicators,
colour contrast, logical reading order, and native element semantics. Gate
non-essential motion with `prefers-reduced-motion`.

For image candidate selection inside fluid layouts, follow
[Authoring Responsive Images](../images/authoring.md).
