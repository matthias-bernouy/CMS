# Make A Bloc Themeable

CmsCore separates site-wide design tokens from per-Bloc presentation. The
active structured theme provides namespaced CSS variables; a Bloc consumes
them inside its validated scoped stylesheet.

## Site Themes

Theme settings contain token sources, named value sets and one active theme.
Site-owned tokens use `--site-variable-*`. Installed collections may contribute
immutable namespaced tokens, for example `--ulvia-official-primary`.

The Kernel serves the document foundation and active values through
`/.cms/style`. The foundation does not restyle native controls, headings,
links, media or focus states: the Bloc managing a native element owns its
presentation. Dark values follow `prefers-color-scheme` and may be forced with
`data-theme-mode="dark"` on the document root.

## Collection Theme Sources

`theme/definition.json` orders recursively discovered category files. Token
defaults may reference local tokens or tokens explicitly imported from a
collection dependency. Admission rejects unknown variables, type-incompatible
aliases and cycles. Labels and descriptions are translation keys resolved from
the collection's administration translations.

The release command also scans Bloc styles. Variables in a collection or
dependency namespace must be declared theme tokens or explicit Bloc custom
properties, so misspellings fail before publication.

## Scoped Bloc Styles

Authors write rules relative to the Bloc root. The build wraps them in
`@scope ([cms-bloc="<id>"])`:

```css
:scope {
    --example-card-background: var(--site-variable-surface-background, Canvas);
    --example-card-color: var(--site-variable-surface-text, CanvasText);
    --_example-card-padding: var(--site-variable-space-md, 1rem);

    display: grid;
    padding: var(--_example-card-padding);
    color: var(--example-card-color);
    background: var(--example-card-background);
}

:scope[appearance="plain"] {
    border-color: transparent;
    box-shadow: none;
}

[part~="description"] {
    color: var(--site-variable-surface-muted-text, currentColor);
}
```

Use documented public variables for supported theme knobs. Prefix private
implementation variables with `--_<collection>-*`. `part` tokens identify
projected Light DOM structures that the owning scoped stylesheet needs to
target; they are not Shadow DOM parts.

Global selectors, document selectors, `:host`, `::part`, `::slotted`, imports
and other scope escapes are rejected. A Bloc cannot style outside its scoped
root. Nested Bloc scopes remain independently owned.

## Settings And Behavior

Finite semantic variants belong in declared settings and become validated root
attributes. CSS can select them directly with `:scope[attribute="value"]`.
Behavior is unnecessary for ordinary color or layout variants; use JavaScript
only when an interaction cannot be expressed by native HTML, bindings and CSS.

## Responsive And Accessible By Construction

Use container queries when layout depends on the space allocated to a Bloc:

```css
:scope {
    container-type: inline-size;
}

@container (min-width: 40rem) {
    :scope {
        grid-template-columns: minmax(0, 2fr) minmax(12rem, 1fr);
    }
}
```

Preserve focus indicators, contrast, reading order and native semantics. Gate
non-essential motion with `prefers-reduced-motion`.

For responsive media, see [Files And Responsive Images](../images/README.md).
