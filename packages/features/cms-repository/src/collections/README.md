# Collection authored bundles — first slice

`@bernouy/cms-repository/collections` exposes strict release parsing and bundle
admission. This is the beginning of the collections domain, not a renderer,
installation workflow, registry publication policy or view authorization engine.

## Release contents

The envelope identifies `kind: "collection"`, `protocol: "ulvia-collection/v1"`,
`schemaDialect: "ulvia-schema/v1"`, collection ID, publisher ID, exact SemVer,
name and default locale. Optional configuration has a nonnullable object schema
and validated defaults. Binary leaves are forbidden in configuration schemas.

This slice supports:

- Optional JSON text definitions with typed parameters, plural forms and locale
  values. `./collections/texts` exposes validation, fallback resolution and
  formatting; see [collection texts](../../../../../docs/blocs/texts.md).
- Optional theme categories with typed light/dark token defaults.
- Optional Control HTML views: bounded collection-owned fragments.
- Assets declared by stable ID, concrete MIME type, byte length and SHA-256.
- Component blocs with a static `shadowdom` shell and optional fixed `lightdom`,
  `style` source and declarative setting items.
- Composition blocs with fixed `lightdom` only: their authoring host is replaced
  by their content at delivery. They have no own shell, settings or stylesheet.
- Explicit local `uses`, named slots, optional thumbnail asset, initial editable
  `defaultContent` and resource-level capability requirements.

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
attribute ID, label, optional group, string or boolean type, constraints and
default. Admission validates the list and defaults against a derived object
schema; arbitrary nested JSON settings are not exposed as HTML attributes.
The local repository may read this list from a bloc's
`settings/definition.json`; release data carries the same normalized list.
Optional `visibleWhen` rules reference other finite-valued items and affect
editor visibility only; admission rejects invalid references and cycles.

**Admission is not an HTML/CSS sanitizer or template compiler.** It does not
type-check expressions, capability calls embedded in markup, placed settings,
slot content cardinalities, CSS or render expansion. The HTML parser applies
its parsing rules; acceptance does not certify author syntax as conforming HTML.
Never render or execute an admitted bundle directly as trusted code. Renderer
compilation, content policies and execution authorization are separate future
gates. An optional `runtime` field carries compiled browser view/editor bundles
for components. Admission hashes and bounds those bytes but does not audit the
executable behavior; installation therefore trusts the configured repository.

## Dependencies and identity

Bloc tags are prefixed with `<collectionId>-`; all `uses` and slot `accepts`
references must resolve locally. External collection imports are not supported
yet and are rejected, rather than silently left unresolved.

Each requirement names `contractId`, `capabilityId` and a bounded SemVer range.
Admission requires a supplied `ReleaseCatalogue` whenever requirements exist.
One non-yanked release must jointly satisfy every requirement to a given
contract across a bloc and its transitive `uses`. Independent resources may
have different witnesses. This is not full-site installability: contract
transitive requirements, provider selection and readiness remain outside it.
Admission does not choose or pin the site's provider. Re-admission currently
rechecks non-yanked witnesses; historical publication is not implemented.

Assets, blocs, uses and requirements normalize ordinally; markup strings remain
exact. The digest hashes canonical release data including asset declarations.
Changing asset bytes requires changing their declared digest and thus changes
the collection digest. Asset IDs are logical references, not filesystem paths.
MIME declarations do not attest to the actual format or safety of the bytes.

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

`CollectionLimits` bounds JSON bytes/depth, resources, assets and their aggregate
size, markup, slots and requirements. `limits.schema` explicitly carries the
schema policy through configurations. Locale tags normalize using
`Intl.getCanonicalLocales`; names and source strings remain as authored.

## Views and dashboards

The local release command reads `views/<view-id>/definition.json` and
`view.html` and places the HTML in the immutable release. Admission permits
text, a small semantic HTML set and declared local bloc tags. It rejects
scripts, links, inline handlers, inline styles and undeclared attributes.
The current Control view runner supplies dashboard name and view count through
its document binding core. Arbitrary provider calls and form actions in
authored views are not admitted yet; they need compiled execution grants.
The local release command also reads `dashboards/<dashboard-id>/definition.json`.
Each dashboard declares a navigation tree of groups and local views. A primary
item can open lateral navigation or tabs directly; a lateral item can open
tabs. Admission rejects unknown or repeated view IDs and duplicate dashboard
IDs. Optional contract IDs connect source discovery to dashboards that use
those contracts. The definition is immutable collection content; its site
activation and membership are separate mutable state. Private site dashboards
may mount views from several installed collections.

## Next slices

Presets and imports remain absent from the public format: unsupported fields
reject. Expanded view bindings, published execution plans and capability grants
remain future work.

Compatibility analysis, remote catalogue publication, complex upgrade
migrations and component renderer compilation are not implemented yet.
The [starter bundle](../../fixtures/collections/v1/README.md) exercises the
implemented authoring/admission path without a provider or renderer.
