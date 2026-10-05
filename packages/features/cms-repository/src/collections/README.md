# Collection authored bundles

`@bernouy/cms-repository/collections` exposes strict release parsing, bundle
admission, repository transport and site installation state. It is not a view
authorization engine or a general-purpose executable package format.

## Release contents

The envelope identifies `kind: "collection"`, `protocol: "ulvia-collection/v1"`,
`schemaDialect: "ulvia-schema/v1"`, collection ID, publisher ID, exact SemVer,
name translation key, default locale and collection `dataGeneration`. Its immutable `translations` catalogue
contains static administration copy. Optional configuration has a nonnullable
object schema and validated defaults. Binary leaves are forbidden in
configuration schemas.

This slice supports:

- A reusable administration translation catalogue shared by collection, Bloc,
  setting, text, theme and transitional View metadata. Every metadata field stores
  a key, every key must exist in the default locale and additional locales may
  be partial. Resolution tries the requested locale, its regional parents and
  finally the collection locale.
- Optional JSON text definitions with static locale values. Dynamic parameters
  and plural forms are deliberately outside this catalogue. `./collections/texts`
  exposes validation and fallback resolution; see
  [collection texts](../../../../../docs/blocs/texts.md).
- Optional theme categories with typed light/dark token defaults.
- Optional Control HTML views: bounded collection-owned fragments.
- Assets declared by stable ID, concrete MIME type, byte length and SHA-256.
- Component blocs with a static `shadowdom` shell and optional fixed `lightdom`,
  `style` source and declarative setting items. Optional translated `category`
  and numeric `order` metadata organize the author-facing catalogue without
  deriving public identity from source paths.
- Composition blocs with fixed `lightdom` only: their authoring host is replaced
  by their content at delivery. They have no own shell, settings or stylesheet.
- Explicit local `uses`, named slots for components, media, plain text or bounded
  rich-text profiles, optional thumbnail asset, initial editable `defaultContent`
  and resource-level capability requirements.
- Selective public Bloc/theme-token/text/asset exports and bounded cross-collection imports.
  Every imported resource pins the exact contract generation understood by the
  dependent collection.
- Cumulative adjacent, declarative migration steps for site-owned data.

Collection and bloc configuration are distinct. `defaultContent` belongs to
the editable page instance; `lightdom` describes the reusable fixed assembly.
Updating an installed release updates every page's fixed assembly while each
page retains its own slot children.
Initial content is not inserted into the fixed composition during admission.

## Light DOM invariants

The model follows UlviaInterfaces' shell/composition distinction. A component
can combine a static shadow shell and fixed light-DOM children distributed
through its slots. A composition alone is a shared assembly whose host is
replaced at delivery, not a copy of its template into each page.

Structural validation uses an HTML parser, not a regex template scanner. It
checks declared page slots, local bloc references, `uses` cycles, immediate
parent slot targets and `<cms-host>`. That marker is only valid as the single
root of a component's light DOM. Shells reject dynamic interpolation, visible
text, semantic content and CMS directives. Inline styles are forbidden in all
markup; classes belong only in shadow shells and bindings only in light DOM.
Composition-only settings, styles and behaviour fields reject.
Component settings are an ordered list of items. Each item owns a safe lowercase
attribute ID, label key, optional group key, scalar type, constraints and default.
Supported values are strings, booleans, finite numbers and safe integers.
Admission validates the list and defaults against a derived object schema;
arbitrary nested JSON settings are not exposed as HTML attributes. Numeric page
attributes use JSON number syntax before their type and bounds are checked.
The local repository may read this list from a bloc's
`settings/definition.json`; release data carries the same normalized list.
Optional `visibleWhen` rules reference other finite-valued items and affect
editor visibility only; admission rejects invalid references and cycles.

A component may declare a managed native child with
`nativeElement: { accepts: ["button", "a"] }`. The accepted list is nonempty,
unique and restricted to the platform-managed vocabulary. These components
have exactly one unnamed Shadow DOM slot, no named page slots or fixed Light
DOM, and one direct, un-slotted accepted native root in `defaultContent`.
Nested authored occurrences must contain the same single-child structure. The
real child tag is authoritative; wrapper settings and native child attributes
remain separate targets even when they use the same attribute name. Changing
the accepted set is an incompatible installed component-contract change.

String controls are `text`, `select`, `segmented`, `color`, `page-link`,
`media-picker` and `theme-token-picker`. Booleans use `toggle`; numbers and
integers use `number` or a bounded `range`. Media content normally belongs in a
media slot; the setting control is for component configuration such as a poster
or background. Rich text is page-owned HTML in a `plain-text` or `rich-text`
slot, never an HTML string stored in a setting. Rich-text profiles are currently
the closed `inline` and `prose` vocabulary; the future editor may expose only
features permitted by that profile.

Theme defaults do validate local and selectively imported token references.
Exact local aliases must preserve token types, and local reference cycles reject.
Installation repeats type checks for exact aliases to imported tokens.

**Admission is not an HTML/CSS sanitizer or template compiler.** It does not
type-check expressions, capability calls embedded in markup, slot content
cardinalities, rich-text profile conformance, general CSS or render expansion. Stored
component settings are validated separately by `cms-content`. The HTML parser applies
its parsing rules; acceptance does not certify author syntax as conforming HTML.
Never render or execute an admitted bundle directly as trusted code. Renderer
compilation, content policies and execution authorization are separate future
gates. An optional `runtime` field carries a compiled browser view bundle for
components. Admission hashes and bounds those bytes but does not audit the
executable behavior; installation therefore trusts the configured repository.

## Dependencies and identity

The collection ID is its global runtime namespace. It uses lowercase kebab-case
without dots and cannot claim the platform-owned `be5-`, `cms-`, `p9r-`,
`site-`, or `w13c-` roots. Every Bloc is a valid custom-element tag prefixed
with `<collectionId>-`. Local `uses` and slot `accepts` references resolve inside
the release. External references must appear in one dependency's exact imported
Bloc list. A dependency pins the target collection ID, publisher ID and bounded
SemVer range; it separately imports public resources with their exact contract
generation. Implementation digests may evolve inside that generation, while a
generation bump requires a coordinated dependent release. Single-release installation requires the dependency first. The
installation store also accepts an exact multi-release plan and validates then
commits the whole graph atomically, independently of request order. Both paths
verify every requested resource against its target release's explicit `exports`,
validate cross-release slot targets and reject collection dependency cycles.
Upgrades revalidate all installed dependents.

Theme token IDs remain local in release JSON and are projected as both the
global token ID and CSS variable name `<collectionId>-<tokenId>`. Texts and
Views similarly retain local IDs: text expressions use
`cms.i18n.<collectionId>.<textId>`, while a View is identified as
`<collectionId>:<viewId>`. Assets remain scoped by the immutable release
digest. Installation and upgrade reject exact Bloc-tag or projected theme-token
collisions between collections.

Each requirement names `contractId`, `capabilityId` and a bounded SemVer range.
Admission requires a supplied `ReleaseCatalogue` whenever requirements exist.
One non-yanked release must jointly satisfy every requirement to a given
contract across a bloc and its transitive `uses`. Independent resources may
have different witnesses. This is not full-site installability: contract
transitive requirements, provider selection and readiness remain outside it.
Admission does not choose or pin the site's provider. Installed collection APIs
report requirement readiness separately from exact selected provider grants.
Re-admission rechecks non-yanked witnesses.

Assets, blocs, uses and requirements normalize ordinally; markup strings remain
exact. The digest hashes canonical release data including asset declarations.
Changing asset bytes requires changing their declared digest and thus changes
the collection digest. Asset IDs are logical references, not filesystem paths.
Admission compares recognizable media signatures with their declared MIME type
and validates UTF-8/JSON payloads. This is bounded format recognition, not full
decoding, sanitization or proof that active content is safe to render inline.

## API and bounds

```ts
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";

const admission = await admitCollectionRelease(document, assetBytes, {
    contracts: releaseCatalogue,
});
```

`parseCollectionRelease` and `parseCollectionReleaseJson` return independent,
deeply frozen release data. `admitCollectionRelease` and its JSON counterpart
also verify the exact byte set and capability witnesses, returning a digest,
canonical JSON and immutable Blob snapshots. Every input buffer is snapshotted
before the first asynchronous step; caller-owned objects are never frozen.

`CollectionLimits` gives documents, Blocs, assets, texts, Views,
dependencies, theme resources, migrations, markup, slots, settings and
requirements independent bounds. Import and export lists use the bound of the
resource kind they select. `limits.schema` explicitly carries the schema policy
through configurations. Locale tags normalize using
`Intl.getCanonicalLocales`; administration copy resolves through the immutable
catalogue while content text overrides remain separate.

## Transitional Views

The local release command reads `views/<view-id>/definition.json` and
`view.html` and places the HTML in the immutable release. Admission permits
text, a small semantic HTML set and declared local or explicitly imported Bloc
tags. It derives the exact `uses` set from the HTML. Canonical
`/.cms/call/<contract>/<capability>` sources require a matching versioned
capability requirement; admission verifies those witnesses alongside transitive
local Bloc requirements. Scripts, links, inline handlers and inline styles reject.
The renderer can expand compositions, resolve texts and public assets, apply the
site theme and load every transitively used component runtime, including internal
Blocs. No standalone Control navigation or access model currently exposes these
Views. They remain transitional input for the future surface-specific Page model.

## Publication and installation

The local release command turns source asset declarations into immutable size
and digest metadata, stores exact bytes beside canonical JSON, and serves each
asset through a bounded immutable HTTP route. CMS import fetches the complete
bundle, repeats admission with the contract catalogue, stores assets outside the
Mongo release document and exposes verified image assets to installed Bloc
thumbnails.

Site installation pins the collection digest, repository ID, configuration and
text overrides. Upgrades require a newer release from the same publisher,
preserve existing resource IDs and Bloc kinds, keep stored setting value schemas
stable and revalidate saved configuration and text overrides before changing the
digest. Setting presentation metadata and order may evolve; slot cardinalities
and accepted native tags may widen but cannot invalidate existing content.
Collection configuration is mutable per site through a schema-validated,
revision-checked store operation and the administrator-only Control API.

Every independently consumable resource has a positive generation and derived
contract/implementation SHA-256 digests. The collection SemVer and immutable
release digest remain authoritative publication identities; resource digests
provide precise impact reporting. Local publication admits implementation-only
patches, compatible minor extensions and major breaking changes only when every
surviving broken resource increments its generation. Breaking site-owned data changes increment
`dataGeneration`. A generation `N` release retains every adjacent transition
from generation `1`; the runtime composes those steps for any older installed
generation. Operations are a closed JSON vocabulary and never executable code.

Migration execution belongs to `@bernouy/cms-content/migrations`, not this
package. The collection store only validates and atomically commits an exact
multi-collection replacement or restoration after the content layer has planned
the affected pages and site-owned values.

The store can remove a collection only when no installed collection depends on
it. This is deliberately not exposed as a Control HTTP action yet: pages, private
Blocs, theme overrides and transitional Views still need affected-resource analysis
before removal is safe.

## Next slices

Presets remain absent from the public format: unsupported fields reject.
Published execution plans and provider capability grants remain future work.

Remote publication, JavaScript trust scanning and component renderer trust
hardening are not implemented yet. The current first-party trust assumption and
the required boundary before third-party collections are admitted are recorded
in the repository [deferred-work documentation](../../../../../docs/TODO.md#collection-javascript-isolation).
The [starter bundle](../../fixtures/collections/v1/README.md) exercises the
implemented authoring/admission path without a provider or renderer.
