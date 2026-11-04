# Collection authored bundles

`@bernouy/cms-repository/collections` exposes strict release parsing, bundle
admission, repository transport and site installation state. It is not a Page
authorization engine or a general-purpose executable package format.

## Collection v1

The fresh `ulvia-collection/v1` format requires translated descriptions,
nonempty `categories[]` and reusable collection-owned examples. Listed Blocs
select a `defaultExample` for insertion. Examples support single and multiple
roots and fixed viewport frames. They resolve the collection text catalogue;
per-example text overrides are not part of the format. No historical reader
accepts `category`, `thumbnail`, `defaultContent` or `default.html`.
See [collection examples](../../../../../docs/blocs/examples.md).

## Release contents

The envelope identifies `kind: "collection"`, `protocol: "ulvia-collection/v1"`,
`schemaDialect: "ulvia-schema/v1"`, collection ID, publisher ID, exact SemVer,
name translation key and default locale. Its immutable `translations` catalogue
contains static administration copy. Optional configuration has a nonnullable
object schema and validated defaults. Binary leaves are forbidden in
configuration schemas.

This slice supports:

- A reusable administration translation catalogue shared by collection, Bloc,
  setting, text, theme and example metadata. Every metadata field stores
  a key, every key must exist in the default locale and additional locales may
  be partial. Resolution tries the requested locale, its regional parents and
  finally the collection locale.
- Optional JSON text definitions with static locale values. Every definition
  declares `label`, `category` and `group` keys present in the default
  administration catalogue; `description` remains optional. Dynamic parameters
  and plural forms are deliberately outside this catalogue. `./collections/texts`
  exposes validation and fallback resolution; see
  [collection texts](../../../../../docs/blocs/texts.md).
- Optional theme categories with typed light/dark token defaults.
- Reusable examples: bounded authored documents, exact Bloc references and
  viewport frames for preview and insertion; they own no public routes.
- Assets declared by stable ID, concrete MIME type, byte length and SHA-256.
- Retained Blocs with required fixed `markup`, optional scoped `style`, behavior and
  declarative setting items. Required translated `description` and `categories`
  and numeric `order` metadata organize the author-facing catalogue without
  deriving public identity from source paths.
- Composition Blocs with fixed `markup`: their authoring host is replaced by
  their content at delivery. They have no settings, stylesheet or behavior.
- Explicit local `uses`, named slots for Blocs, plain text or bounded
  native-content profiles, reusable examples, fixed viewport previews
  and resource-level capability requirements.
- Selective public Bloc/theme-token/text/asset exports and bounded cross-collection imports.
  Imported IDs retain compatible contracts across every accepted release.

Collection and Bloc configuration are distinct. Example initial documents belong to
the editable Page instance; `markup` describes the reusable fixed assembly.
Updating an installed release updates every page's fixed assembly while each
page retains its own slot children.
Initial content is not inserted into the fixed composition during admission.

## Light DOM invariants

Every Bloc declares a native `root` contract. Retained Blocs keep that native
element and may add fixed Light DOM, scoped CSS and optional behavior. A
composition is a shared assembly whose temporary authoring host is replaced at
delivery.

Structural validation uses an HTML parser, not a regex template scanner. It
checks declared page slots, local bloc references, `uses` cycles, immediate
parent slot targets and the native element carrying `cms-bloc`. Inline styles
are forbidden in all markup; structural classes belong only in component markup
and bindings only in Light DOM. CSS is parsed and wrapped in a Bloc-owned
`@scope`; Shadow DOM selectors and APIs reject.
Composition-only settings, styles and behaviour fields reject.
Example roots must be collection or explicitly imported Blocs. Page
documents and examples enforce named slot acceptance and cardinality;
native editable content exists only through `plain-text`, `native-content` or
managed-native contracts. `any-component` excludes compositions. Fixed
Light DOM remains code-owned native markup, while its nested Bloc placements
must target compatible component slots.
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

A retained Bloc may declare one bounded default slot with
`{ "kind": "native-element", "accepts": ["button", "a"] }` for a Page-owned
native child. Accepted lists are nonempty, unique and restricted to the platform
vocabulary. Authored occurrences must contain exactly one matching child. Root
settings and child native attributes remain separate targets; there is no
separate Bloc `content` contract.

String controls are `text`, `select`, `segmented`, `color`,
`media-picker` and `theme-token-picker`. Booleans use `toggle`; numbers and
integers use `number` or a bounded `range`. Media content normally belongs in a
dedicated media Bloc; the setting control is for Bloc configuration such as a
poster or background. Rich text is page-owned HTML in a `plain-text` or
`native-content` slot, never an HTML string stored in a setting. Native-content
profiles are the closed `phrasing`, `inline` and `prose` vocabularies; the future
editor may expose only features permitted by that profile.

Theme defaults do validate local and selectively imported token references.
Exact local aliases must preserve token types, and local reference cycles reject.
Installation repeats type checks for exact aliases to imported tokens.

**Admission is not an HTML/CSS sanitizer or markup compiler.** The separate
`@bernouy/cms-repository/collections/build` authoring toolchain compiles a
Bloc's browser behavior before admission, but it does not weaken these
admission boundaries. Admission itself does not type-check arbitrary business
expressions, general CSS or final render expansion. It does validate controlled
capability bindings, slot content cardinalities and native-content profiles at the
authored boundaries. Stored component settings are validated separately by
`cms-content`. The HTML parser applies
its parsing rules; acceptance does not certify author syntax as conforming HTML.
Never render or execute an admitted bundle directly as trusted code. Renderer
compilation, content policies and execution authorization are separate gates
owned by the authoring toolchain, Content and Gateway. An optional `runtime`
field carries a compiled browser behavior bundle. Admission hashes and bounds those bytes but does not audit the
executable behavior; installation therefore trusts the configured repository.

## Dependencies and identity

The collection ID is its global runtime namespace. It uses lowercase kebab-case
without dots and cannot claim the platform-owned `be5-`, `cms-`, `p9r-`,
`site-`, or `w13c-` roots. Every Bloc has a valid namespaced identifier prefixed
with `<collectionId>-`; DOM instances carry it in `cms-bloc`. Local `uses` and slot `accepts` references resolve inside
the release. External references must appear in one dependency's exact imported
Bloc list. A dependency pins the target collection ID, publisher ID and bounded
SemVer range; it separately imports explicit public resource IDs with stable
compatible contracts. Single-release installation requires the dependency first. The
installation store also accepts an exact multi-release plan and validates then
commits the whole graph atomically, independently of request order. Both paths
verify every requested resource against its target release's explicit `exports`,
validate cross-release slot targets and reject collection dependency cycles.
Upgrades revalidate all installed dependents.

Theme token and example IDs remain local in release JSON. Tokens are projected as both the
global token ID and CSS variable name `<collectionId>-<tokenId>`. Text
expressions use `cms.i18n.<collectionId>.<textId>`. Live Pages have ordinary
Content identities and routes; they are not collection resources. Assets remain scoped by the immutable release
digest. Installation and upgrade reject exact Bloc-tag or projected theme-token
collisions between collections.

Collection preparation policy requires reusable example and fixed Light DOM
copy to come from business-data bindings or exact admitted `cms.i18n` references,
including textual accessibility attributes. Technical HTML and CMS transport
values remain literal. Site-owned Pages may contain editable literal copy.
These authoring-policy checks are separate from low-level immutable admission;
see [validation](../../../../../docs/blocs/validation.md).

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

`CollectionLimits` gives documents, Blocs, assets, texts,
dependencies, theme resources, examples, markup, slots, settings and
requirements independent bounds. Import and export lists use the bound of the
resource kind they select. `limits.schema` explicitly carries the schema policy
through configurations. Locale tags normalize using
`Intl.getCanonicalLocales`; administration copy resolves through the immutable
catalogue while content text overrides remain separate.

## Collection Examples And Live Pages

The local release command reads `examples/**/<example-id>/definition.json` and
`document.html`. Admission checks root identities, slot contracts, text references
and declared capability witnesses. Examples are reusable catalogue resources;
they do not claim paths, get installed as a parallel Page model or contribute
runtime capability grants on their own.

An instance profile may copy an example into an ordinary Content Page during
provisioning. That Page then owns its route, publication state, editable content
and access analysis. Updating the collection never rewrites its stored document.
See [collection examples](../../../../../docs/blocs/examples.md) and
[instance initialization](../../../../../docs/architecture/provider-instance-initialization.md).

## Publication and installation

The local release command discovers files below `assets/`, turns them into immutable size
and digest metadata and stores exact bytes beside canonical JSON in the private
CLI cache. Explicit publication sends them to the CMS Repository, which serves
assets through bounded immutable HTTP routes. CMS import fetches the complete
bundle, repeats admission with the contract catalogue, stores assets outside the
Mongo release document. Examples provide authored preview frames; screenshots
are generated outside immutable release artifacts.

Site installation pins the collection digest, repository ID, configuration and
text overrides. Collection publication enforces compatible stable identities;
incompatible retained resources require new IDs. Removal requires a major
release and an instance plan proving that no runtime consumer still needs them.
Resource contract/implementation digests provide impact information without
resource generations or transformation chains.

`CollectionUpgradeService` prepares read-only plans and applies exact reviewed
replacements through the shared site fence. Explicit target configuration and
text overrides are validated against the target release, then committed with
the selected collection digests. Page documents are never transformed or
restored by this operation. Interrupted switches retain exact durable intents.
See [Reviewed Release Upgrades](../../../../../docs/architecture/release-upgrades.md)
for inventory scopes, public capabilities, grants and Provider retention.

The store can remove a collection only when no installed collection depends on
it. This is deliberately not exposed as an administration HTTP action yet: site Pages,
private Blocs and theme overrides still need affected-resource analysis
before removal is safe.

## Next slices

Presets remain absent from the public format: unsupported fields reject.
Static Page capability analysis and access derivation are implemented in
`@bernouy/cms-content/public-delivery`; live invocation authority remains
independent of Page documents and belongs to Gateway.
Remote publication uses account PATs through the CLI and official Provider
server. Third-party JavaScript isolation remains open. The current first-party
trust assumption and the required boundary before third-party collections are
recorded in the repository
[deferred-work documentation](../../../../../docs/TODO.md#collection-javascript-isolation).
The [starter bundle](../../fixtures/collections/v1/README.md) exercises the
authoring and admission path without requiring a running provider.
