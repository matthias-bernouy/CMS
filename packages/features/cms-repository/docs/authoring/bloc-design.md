# Design a reusable Bloc

Use this procedure when creating or redesigning a Bloc or collection example.
Read [the source format](collection-source.md) and
[the preparation workflow](collection-authoring.md) for exact authoring rules.

## Define the responsibility

Describe the content or interaction the Bloc supports, its intended users and
what Page editors must change. Inspect suitable existing resources before
creating a new identity. A reusable resource should remain useful with different
editorial copy, destinations and media.

Read the owner-authorized source snapshot before editing an existing release.
A null snapshot means no retained sources were returned; report that condition.
Public release metadata and compiled behavior are not the original source tree.
Preserve exact dependency and asset references when sources are available.

## Establish the contract

- Choose the native host through root.accepts. Prefer native semantic elements
  and native interactions appropriate to the task.
- Declare bounded slots for Page-owned content. Check what editors can add,
  remove, reorder and translate without changing the collection.
- Expose meaningful settings with safe defaults and understandable translated
  labels. Keep rich editorial text in content rather than setting attributes.
- Choose a retained component for owned structure, styles or behavior. Use a
  composition to assemble existing Blocs; compositions do not own styles,
  settings or behavior modules.
- Review existing consumers before changing a stable resource. Preserve their
  compatible settings and slot contracts; use new identities for incompatible
  resources and the supported upgrade workflow for installation changes.

## Build a coherent visual system

Choose a consistent type scale, spacing rhythm, content measures and semantic
surface, text, border, action and feedback roles. Consume declared theme tokens;
keep literal palette values in theme defaults or site theme values. The source
guide describes the enforced paint restrictions and exact dependency imports.

Allow width and height to follow content. Check long titles, labels, prose and
repeated items at narrow and wide widths. Use layout primitives for general
alignment and flow; give specialized Blocs a clear product purpose.

Keep fixed markup, scoped styles and optional behavior within the native Ulvia
Bloc model. Preserve Light DOM and declared slots. Behavior should add the
required interaction without hiding essential content or replacing native
keyboard behavior unnecessarily.

## Include the interaction states

Consider focus, hover, active, disabled, loading, empty and error states when
they apply to the Bloc's responsibility. Verify readable text and visible focus
against actual themed surfaces. Essential actions must work without hover.
Respect reduced motion and preserve useful content when optional behavior fails.

## Author examples worth copying

Give each listed Bloc a valid matching-root default example and explicit preview
frames. Show a credible use case with deliberate composition and representative
content. Add stress examples when long content, nested layouts or interaction
states exercise a different behavior.

Use the collection's translated metadata and reusable texts for official
examples. Keep site-specific claims, routes and content in Pages. A complete
Page demonstration can assemble several Blocs; it is distinct from a single
Bloc's insertion example.

## Prepare and review

Prepare the complete source snapshot and inspect every diagnostic. Correct
errors and assess warnings before continuing. Retain the exact preparation
identity and digest returned by the tool. Preparation does not publish or install
the collection and does not prove its visual quality.

Use an authorized rendering surface to inspect the examples and relevant Pages.
Search Content documentation for "Review rendered page design" for the review
procedure. When unpublished preparation rendering is unavailable, report that
limitation and preserve the user's publication boundary.

Conclude with the source/preparation status, supported editor operations,
verified states and widths, affected consumers and unresolved findings. Keep
technical validation, visual review, publication and installation status separate.
