# Reproduce an existing site

Use this workflow for requests such as "reproduce this website", "clone this
site", or "recopier ce site". Preserve the requested appearance and content
through reusable Blocs and editable Pages. The reference DOM is evidence about
the result, not a specification for collection boundaries.

Read [Bloc design](bloc-design.md), [the source format](collection-source.md) and
[collection preparation](collection-authoring.md). Search Content documentation
for "Design an editable page" and "Review rendered page design". Use the exact
selected capability schemas; guides do not add capabilities or authorization.

## Inspect and record the target

1. Inventory the requested routes, content, navigation, repeated sections,
   images, documents, favicon and relevant interactive states.
2. Inspect narrow, intermediate and wide widths. Record typography, content
   measures, spacing, image treatment and responsive changes.
3. Read the destination's installed catalogue, slot contracts, examples, theme
   and current Pages. Search Repository before creating new resources. A
   self-contained teaching fixture does not justify rebuilding an installed
   Heading, Image or layout primitive.
4. Record editor operations: change copy or destinations, replace media,
   add/remove/reorder cards, reorder sections, and update shared navigation.

Keep a short implementation record with source URLs, target routes, chosen
resources, ownership decisions, current revisions and outstanding checks. Read
it when resuming work; a fresh agent should not need conversation history.

## Choose responsibilities before extracting markup

| Reference observation | Reusable model | Editorial owner |
| --- | --- | --- |
| Introductory sections share one layout | Hero or Section with meaningful layout settings | Page |
| Repeated offerings share a card structure | Card plus a repeated `items` slot | Page |
| Pages share navigation/footer | Visual components assembled by shared site compositions | Site compositions |
| Article contains prose and charts | Ordered rich content with specialized chart components | Page |
| Portrait, programme PDF, site logo or favicon | Site Files and editable references/settings | Site |
| Component needs a generic UI glyph or theme font | Declared immutable collection asset | Collection |

Choose variants when responsibility and slot structure remain coherent. Choose
separate components for different responsibilities. Do not force every section
into a universal component with unrelated switches.

Counterexamples: `home-section-1`, `conference-section-2`, `article-item-7` and
slots `content-1` through `content-14` encode extraction order. Prefer meaningful
responsibilities and slots such as `heading`, `intro`, `actions`, `items` and
`media`. Numbered names are not forbidden grammar; assess whether an editor can
understand and reuse the contract.

Do not turn every source node into a Bloc, split prose at incidental wrappers,
or make every repeated item a new identity. Preserve content order and semantic
heading levels in Page-owned content. Compositions cannot own native headings
directly; assemble an explicit Heading component when needed.

## Put each resource with its owner

- **Pages** own editorial copy, destinations, media references and section order.
  Collection translations supply reusable UI labels and generic examples;
  the site's business copy remains editable outside the release.
- **Site compositions** own shared site content: brand copy, navigation and
  footer links. Each Page references the same composition rather than copying it.
- **Collection components** own fixed structure, slot contracts, scoped styles
  and optional behavior. Compositions assemble components and do not own styles,
  settings or behavior modules.
- **Files** own site editorial media. Follow the Files upload workflow, decide
  visibility deliberately, and verify the generation and download. A signed
  temporary URL is not a permanent public media reference.
- **Collection assets and theme** supply resources required by reusable visuals,
  such as UI icons, textures and fonts. File extension does not decide ownership:
  a site's PDF or portrait does not belong in a release merely because assets
  can contain those formats. Packaging intentionally publishes release assets.

Set a site's favicon through available site configuration, referencing its
managed file. Report a missing configuration capability before claiming it was
configured. Do not duplicate head metadata in body Blocs.

## Assemble and exercise one representative draft

Build the smallest useful component set and one representative Page before
rolling the design across all routes. Keep styles scoped to their component;
do not copy document-wide `html`/`body` rules onto every host. Check anchored
hosts, content-dependent height and empty slots for accidental whitespace.

Compositions replace their authoring host when expanded. An `any-component`
slot accepts retained components, not a composition host. Shared compositions
can be Page roots around a main component:

```html
<div cms-bloc="site-cedar-header"></div>
<main id="main" cms-bloc="example--studio--main">
  <section slot="content" cms-bloc="example--studio--section">
    <h1 slot="heading" cms-bloc="example--studio--heading">Team workshops</h1>
    <p slot="intro">Choose a format for your team.</p>
  </section>
</main>
<div cms-bloc="site-cedar-footer"></div>
```

These illustrate contracts, not installed identities. Discover or author the
components and create/publish the compositions before referencing them in a
real Page. Verify both authored structure and expanded Page semantics.

Exercise editor operations on a disposable draft: change a title and destination,
add/remove/reorder cards, replace an image, and reorder sections. These ordinary
edits should not require a collection release. Preserve revisions and do not
overwrite unrelated Page content to stage a preview.

In a repository checkout, the executable example lives at
`packages/features/repository/fixtures/collections/reproduction/`. Run:

```sh
bun run test ./packages/features/repository/tests/collections/installations/content/reproduction
```

It prepares real authored sources and checks compositions, Page edits and
resource ownership. It does not upload to a live Files Provider, run an agent,
or prove browser fidelity; its README records those verification boundaries.

## Migrate, review and finish

Prepare and inspect diagnostics, then publish/install within authorization.
Installation switches resources; it does not migrate Pages. Replace copied
shared sections with composition references on every requested Page. Read back
all consumers and verify the old copies are gone.

Review full pages and interactions at relevant widths: keyboard/mobile menus,
visible actions, long content, images, contrast, headings and layout gaps.
Test cross-page fragments such as `/#workshops`, not just `#workshops` on the
home Page. Keep missing checks explicit; admission is not visual approval.
Recheck affected consumers after a shared change.

Audit references before retiring legacy resources or packaged media. Keep
immutable history and use reviewed upgrades. Publish Pages when authorized and
verify anonymous access. Report actual revisions, composition references,
installed releases, media locations, observed checks and unfinished work.
An installed collection, a published composition and a public Page are distinct.
