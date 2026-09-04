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
| Brand | `--ulvia-primary-base`, `--ulvia-primary-foreground`, `--ulvia-secondary-base` |
| Surfaces | `--ulvia-page-background`, `--ulvia-surface-background`, `--ulvia-surface-border` |
| Text | `--ulvia-body-text`, `--ulvia-surface-text`, `--ulvia-surface-muted-text` |
| Feedback | `--ulvia-success-base`, `--ulvia-warning-base`, `--ulvia-danger-base` |
| Typography | `--ulvia-font-heading`, `--ulvia-font-body`, `--ulvia-font-size-display` |
| Spacing and widths | `--ulvia-space-sm`, `--ulvia-space-md`, `--ulvia-content-width` |
| Shape and elevation | `--ulvia-radius-control`, `--ulvia-radius-card`, `--ulvia-shadow-soft` |

Generic `--ctx-*` aliases are not a public cross-collection API. Consume the
documented Ulvia vocabulary or a documented hook from the collection that owns
the component. The complete ownership and naming rules live in
[Integration theme contracts](../integrations/themes.md).

Control edits structured theme values. Delivery serves free-form site CSS and
the active structured values through `/.cms/style`; structured values follow
and are authoritative when both layers assign the same managed variable.

When an active theme defines dark values, they apply through
`prefers-color-scheme: dark` and may be forced with
`data-theme-mode="dark"` on the root element. The default theme currently has
no dark overrides.

## Bloc-Level Contract

Map global tokens to names owned by the Bloc, and always provide a sensible
fallback:

```css
:host {
  --acme-card-background: var(--ulvia-surface-background, Canvas);
  --acme-card-color: var(--ulvia-surface-text, CanvasText);
  --_acme-card-muted-color: var(--ulvia-surface-muted-text, currentColor);
  --_acme-card-border-color: var(--ulvia-surface-border, currentColor);
  --_acme-card-radius: var(--ulvia-radius-card, 0.5rem);
  --_acme-card-padding: var(--ulvia-space-md, 1rem);

  display: block;
  color: var(--acme-card-color);
  font: inherit;
}

[part="card"] {
  display: grid;
  padding: var(--_acme-card-padding);
  border: 1px solid var(--_acme-card-border-color);
  border-radius: var(--_acme-card-radius);
  background: var(--acme-card-background);
}

[part="description"] {
  color: var(--_acme-card-muted-color);
}
```

A site may now tune the component without reaching into its Shadow DOM:

```css
acme-card {
  --acme-card-background: var(--ulvia-subtle-background);
}
```

Use documented collection variables for supported knobs. Prefix private
implementation variables with `--_<collection>-*`; sites and other collections
must not depend on them. Avoid hardcoded brand colours in a reusable Bloc.

## Attributes, Color Settings, Parts, And Slots

Use attributes for finite semantic choices:

```css
:host([appearance="plain"]) [part="card"] {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

:host([appearance="elevated"]) [part="card"] {
  box-shadow: var(--acme-card-shadow, var(--ulvia-shadow-soft, 0 0.5rem 1.5rem rgb(0 0 0 / 12%)));
}
```

An editor `color` setting also writes an attribute. If that value controls a
Shadow DOM declaration, the view must map it explicitly to a custom property:

```ts
static observedAttributes = ["background-color"];

attributeChangedCallback(): void {
    const value = this.getAttribute("background-color")?.trim();
    if (value) {
        this.style.setProperty("--acme-card-background", value);
    } else {
        this.style.removeProperty("--acme-card-background");
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
