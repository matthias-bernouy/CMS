# Make A Bloc Themeable

CmsCore separates site-wide design tokens from per-Bloc presentation. The
active structured theme provides namespaced CSS variables; a Bloc consumes
them inside its validated scoped stylesheet.

## Site Themes

Theme settings contain token sources, named value sets and one active theme.
Installed collections contribute immutable tokens whose IDs and CSS variables
are derived from the collection namespace, for example
`--ulvia--mossa--primary`. Unowned site token sources are supported by the
Content model, but the current administration contract only edits values of
installed collection tokens; it does not create arbitrary site tokens.

The Edge serves the document foundation and active values through
`/_content/style`. The foundation does not restyle native controls, headings,
links, media or focus states: the Bloc managing a native element owns its
presentation. Dark values follow `prefers-color-scheme` and may be forced with
`data-theme-mode="dark"` on the document root.

## Collection Theme Sources

`theme/definition.json` orders recursively discovered category files. Each
category has one `entries` array. An entry is either a translated theme token
or a typed `font-face`. Token defaults may reference local tokens or tokens
explicitly imported from a collection dependency. Admission rejects unknown
variables, type-incompatible aliases and cycles. Labels and descriptions are
translation keys resolved from the collection's administration translations.

A font face points to one local WOFF2 asset:

```json
{
    "id": "interface-regular",
    "type": "font-face",
    "asset": "fonts/interface-regular.woff2",
    "family": "interface",
    "style": "normal",
    "weight": "400",
    "display": "swap"
}
```

The projected family is prefixed with the collection namespace, for example
`ulvia--mossa--interface`. Theme CSS emits the verified `@font-face`
declaration using the immutable installed-asset URL. Browsers see every declared
face in the stylesheet but download only faces needed by rendered text and CSS.
Collections therefore still avoid declaring unused families and weights.
Font faces are implementation details of their collection theme rather than
independently imported resources, so they do not carry resource generations.

The release command also scans Bloc styles. Variables in a collection or
dependency namespace must be declared theme tokens or explicit Bloc custom
properties, so misspellings fail before publication.

## Scoped Bloc Styles

Authors write rules relative to the Bloc root. The build wraps them in a scope
that stops before nested Blocs:

```css
@scope ([cms-bloc="<id>"]) to (:scope [cms-bloc]) {
    /* authored rules */
}
```

An authored stylesheet therefore contains only the inner rules:

```css
:scope {
    --example-card-background: var(--ulvia--mossa--background-surface);
    --example-card-color: var(--ulvia--mossa--text-primary);
    --example-card-padding: var(--ulvia--mossa--spacing-md, 1rem);

    display: grid;
    padding: var(--example-card-padding);
    color: var(--example-card-color);
    background: var(--example-card-background);
}

:scope[appearance="plain"] {
    border-color: transparent;
    box-shadow: none;
}

[part~="description"] {
    color: var(--ulvia--mossa--text-muted, currentColor);
}
```

Use documented public variables for supported theme knobs. Prefix private
implementation variables with the owning Bloc ID, such as `--example-card-*`. `part` tokens identify
projected Light DOM structures that the owning scoped stylesheet needs to
target; they are not Shadow DOM parts.

Global selectors, document selectors, `:host`, `::part`, `::slotted`, imports
and other scope escapes are rejected. A Bloc cannot style outside its scoped
root. Nested Bloc scopes remain independently owned.

## Color Admission

Raw UI colors belong only in theme-token defaults and site theme values. Bloc
CSS consumes local tokens or explicitly imported tokens. Prefer the semantic
roles exported by `ulvia/mossa` when they fit; define a translated, exported
collection token for a genuinely new reusable role. Admission does not require
an official dependency or rename another collection's tokens.

Admission rejects hexadecimal and named colors (including system colors),
absolute `rgb()`/`hsl()`/`oklch()` and other color constructors in paint values.
This covers backgrounds, borders, outlines, shadows, gradients, filters, SVG
paint, text decoration, caret, accent and vendor color properties. The same
rule follows local aliases through every selector variant and checks literal
fallbacks, including `var(--example-accent, #fff)`. Cyclic color aliases,
`attr()` color injection and unparsed color values are refused. Blocs cannot
redefine theme tokens or register global `@property` values.

Use `var(--ulvia--mossa--primary)`, or derive a translucent value with
`color-mix(in srgb, var(--ulvia--mossa--primary) 20%, transparent)`.
`transparent`, `currentColor`, inheritance/reset keywords and `none` remain
available where valid CSS permits them. Numeric geometry and opacity are
unaffected. Local aliases remain owned by their Bloc or a declared `uses`
dependency; inherited presentation inputs configure a child Bloc without
changing a shared theme token. Inverse surface/section variants use the
heading and prose inputs for their text descendants.

Recognized JavaScript paint assignments, `cssText`, style attributes and native
`style.setProperty()` writes are refused. Owned custom-property writes remain
available for dynamic geometry. A variable reachable from a paint declaration
may receive only static token-based CSS, including its fallbacks; dynamic values
and local runtime aliases are refused. Imported Bloc inputs whose stylesheet is
not available also require static values based on theme tokens. Put dynamic
geometry in numeric longhands rather than a shorthand that also carries paint.
Prefer finite settings and CSS states
for UI variants. These static authoring checks are not a security sandbox or a
proof about arbitrary JavaScript, reflection or DOM aliases.
Programmatic style elements, CSS rule injection and paint attributes such as
`setAttribute("fill", value)` are also refused; the stylesheet owns UI paint.

User-selected colors in color controls are business data: the official controls
paint their dedicated canvas swatches. The hue spectrum is an immutable image
asset. Neither path writes UI CSS or shared tokens. Intrinsic logo, photograph
and illustration colors remain in their assets; no Bloc receives a blanket
color exemption.

When reproducing a site, first map its palette to semantic roles and configure
the destination site's theme values. Build reusable Blocs against those roles.
Keep custom color inputs for editing token values or color data, rather than
injecting a raw color into Bloc styling. Validate light/dark, hover, focus and
error states; user theme overrides still require contrast review.

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
