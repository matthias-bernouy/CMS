# Basic Blocs 1.0.0

Small neutral blocs intended as official UI building blocks.

The form layer keeps submission in the native `<form>` element so the CMS
binding runtime remains the only transport implementation. Visual controls are
form-associated custom elements: their labels live in shadow DOM, they expose
standard `name`, `value`, `disabled`, and reset behavior, and they remain
themeable through CSS custom properties and parts.

The layout set contains `basic-stack` for one-dimensional row or column layouts
and `basic-grid` for intrinsic responsive grids. Stacks expose spacing,
alignment, distribution, and wrapping. Grid capacity is derived from minimum
and maximum item widths; authors never select a fixed column count.

`basic-toast` displays transient feedback without changing the surrounding
layout. Authors select a semantic tone and appearance independently from ARIA
semantics, placement, dimensions, density, radius, shadow, duration, and
optional icon content.

`basic-skeleton` provides a neutral loading placeholder. Authors can configure
its dimensions, shape, radius, semantic tone, appearance, accessible label, and
wave, pulse, or static presentation. Motion is automatically disabled when the
visitor prefers reduced motion.

The native `img` bloc keeps browser image semantics while exposing source,
alternative text, intrinsic dimensions, loading, decoding, and fetch priority
to the editor. `basic-pagination` provides reusable previous and next controls
and emits page, limit, and offset without owning URL navigation.

The current form set contains:

- the native `form` editor;
- `basic-input`, `basic-file-input`, `basic-textarea`, `basic-select`, and
  `basic-option`;
- `basic-checkbox`;
- `basic-chip` and `basic-chip-group` for single or repeated values.

`basic-redirect` provides an editor-safe internal page redirect. It displays a
placeholder while framed in the editor and navigates only on the published
page.
