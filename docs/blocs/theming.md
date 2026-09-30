# Make A Bloc Themeable

CmsCore separates site-wide theme decisions from per-Bloc presentation:

1. a non-visual document foundation establishes sizing and page geometry;
2. the active structured theme supplies stable global design tokens;
3. a Bloc maps global tokens to its own public custom properties;
4. semantic attributes select finite variants;
5. `::part` and Light DOM slots provide deliberate override points.

This allows one Bloc implementation to follow several site themes without
turning every CSS declaration into an editor setting.

## Site Themes

Structured theme settings contain token sources, named value sets, and one
active theme. A new site's `defaultThemeSettings()` creates an empty **Site
variables** source and one **Default theme** with empty light/dark values.
It does not install a built-in Ulvia token catalogue.

Authors can create `--site-variable-*` tokens through the theme editor. Existing
integration contribution APIs can compose additional token sources, but the new
repository collection format does not yet admit or install theme definitions.
Use only tokens present in the site's settings or supplied by an explicitly
configured contribution. Neither `--ctx-*` nor `--ulvia-*` is an automatically
available cross-collection API.

Control edits structured theme values. Delivery serves the document foundation
and the active structured values through `/.cms/style`. The foundation does not
restyle headings, links, controls, lists, media, or focus states: a collection
that manages a native element owns its complete presentation. Arbitrary site CSS
is not part of the settings contract; site-specific values are created as
`--site-variable-*` tokens by the theme editor.

When an active theme defines dark values, they apply through
`prefers-color-scheme: dark` and may be forced with
`data-theme-mode="dark"` on the root element. A configured contribution may
provide both light and dark defaults for a token.

## Bloc-Level Contract

Map configured site tokens to names owned by the Bloc, and always provide a
sensible fallback. The `--site-variable-*` names below are illustrative tokens
to create in the site; they are not built-in defaults:

```css
:host {
  --example-card-background: var(--site-variable-surface-background, Canvas);
  --example-card-color: var(--site-variable-surface-text, CanvasText);
  --_example-card-muted-color: var(--site-variable-surface-muted-text, currentColor);
  --_example-card-border-color: var(--site-variable-surface-border, currentColor);
  --_example-card-radius: var(--site-variable-radius-card, 0.5rem);
  --_example-card-padding: var(--site-variable-space-md, 1rem);

  display: block;
  color: var(--example-card-color);
  font: inherit;
}

[part="card"] {
  display: grid;
  padding: var(--_example-card-padding);
  border: 1px solid var(--_example-card-border-color);
  border-radius: var(--_example-card-radius);
  background: var(--example-card-background);
}

[part="description"] {
  color: var(--_example-card-muted-color);
}
```

A site may now tune the component without reaching into its Shadow DOM:

```css
example-card {
  --example-card-background: var(--site-variable-subtle-background);
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
  box-shadow: var(--example-card-shadow, var(--site-variable-shadow-soft, 0 0.5rem 1.5rem rgb(0 0 0 / 12%)));
}
```

An editor `color` setting also writes an attribute. If that value controls a
Shadow DOM declaration, the view must map it explicitly to a custom property:

```ts
static observedAttributes = ["background-color"];

attributeChangedCallback(): void {
    const value = this.getAttribute("background-color")?.trim();
    if (value) {
        this.style.setProperty("--example-card-background", value);
    } else {
        this.style.removeProperty("--example-card-background");
    }
}
```

Expose `part="..."` only on structural nodes a site may reasonably target.
`example-card::part(card)` can then override that node, but cannot pierce deeper
Shadow DOM. `::slotted(...)` styles only the first distributed Light DOM
level—all elements directly assigned to the slot—not their descendants. Theme
rich authored content through
inherited properties and collection-owned composition Blocs rather than
fragile deep selectors.
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

The implementation is in [theme defaults](../../packages/features/cms-content/src/theme/core/defaults.ts)
and [CSS generation](../../packages/features/cms-content/src/theme/core/generateStyleEntry.ts).
