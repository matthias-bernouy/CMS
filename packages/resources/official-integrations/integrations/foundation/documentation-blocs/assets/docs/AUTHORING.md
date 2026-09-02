# Authoring with Documentation Blocs

## Installation and updates

Install `basic-blocs@^1.0.0`, then install `documentation-blocs` from the
integration catalogue. Documentation Blocs has no inputs and contributes its
owned Bloc artifacts plus a namespaced theme catalogue. Re-running its
installation imports all owned sources with force, so sites receive the
selected integration release without manually copying Bloc directories.

Shared documentation defaults reference Basic Blocs tokens for brand colors,
surfaces, text, borders, typography, shape, shadows, and feedback states. Change
those foundations in the Basic Blocs theme when the whole site should follow;
override the Documentation Blocs theme only for documentation-specific code,
navigation, API, or callout treatment.

Published version directories are immutable. Changes belong in a new semantic
version directory, followed by an update of the `stable` or `latest` pointer in
`integration.json`.

## Page composition

Use `doc-layout` as the outer shell. Its `brand`, `top`, `actions`, and
`sidebar` slots form the documentation chrome; the default slot contains the
page. Compose `doc-sidebar-section` and `doc-sidebar-link` inside the sidebar.

Use `doc-anchor-heading` for linkable sections and `doc-toc` for in-page
navigation. Place `doc-breadcrumb` before the article and `doc-prev-next` after
it. `doc-version` can live in the top bar or sidebar.

Compose procedures with `doc-steps` containing `doc-step` children. Compose an
API parameter table with `doc-api-params` containing `doc-api-property`
children. Compose language variants with `doc-code-tabs` containing
`doc-code-block` children.

## Host integration events

`doc-search` emits a bubbling and composed `doc-search` event whose
`detail.value` contains the current query. A host can connect this event to a
static index, a source endpoint, or an external search provider.

`doc-feedback` emits a bubbling and composed `doc-feedback` event whose
`detail.value` is `yes` or `no`. Persistence and analytics remain the
responsibility of the host site.

## Optional rendering

`doc-math` and `doc-mermaid` preserve editable source without forcing a
third-party runtime into every documentation site. A site that needs rendered
formulas or diagrams can attach KaTeX or Mermaid as a separate enhancement.

`doc-embed` accepts only HTTP and HTTPS URLs and ships with a sandbox baseline.
Production sites should also define an appropriate Content Security Policy and
limit embed authoring to trusted users.
