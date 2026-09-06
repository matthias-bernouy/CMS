# Source and collection model

The current integration model has two package types: `source` and
`collection`. They are versioned and released independently because they own
different contracts.

## Sources own data and behavior

A source is a backend capability, presentation-free for public pages. It may
own:

- database schemas and migrations;
- Storage buckets and object policies;
- Auth-dependent business rules;
- Edge Functions and other runtime functions;
- CMS Source endpoints, triggers, and source overlays;
- connectors and stable deployment configuration;
- operator `dashboard-view` artifacts and their tests.

A source must not publish blocs, dashboard shells, theme tokens, pages, or
visual defaults. Operator-owned business values also do not belong in
installation answers. Legal documents, prices, consent policy, and similar
mutable state are stored at runtime and changed through authenticated APIs or
dashboard views.

Official integrations install without a questionnaire. Their versioned
`management` declaration binds registered functions for settings, Health, and
actions. Save applies configuration through those functions; install and update
preserve existing settings. See [Settings and Health](./management.md).

The CMS owns the dashboard shell. A source may publish `dashboard-view`
artifacts that operate its own data, endpoints, and overlays. This bounded
operator declaration is not public-site rendering: the Source cannot publish a
legacy dashboard container, relation projection, or CMS navigation chrome.

Every public endpoint declares a `contractVersion`. Changing implementation
without changing that observable contract is compatible. A breaking request or
response change requires a new endpoint contract major, even when the source
package itself also receives a major version.

### Current source inventory

The author repository currently supports exactly these source integrations:

- domain sources: `commerce`, `user-account`, `consent`, `forms`, and
  `newsletter`;
- providers: `emailer`, `stripe-connect`, and `mondial-relay`;
- extensions: `commerce-negotiation`, `commerce-stripe-payments`,
  `commerce-mondial-relay-delivery`, and
  `commerce-mondial-relay-fulfillment`.

Extensions declare `extensionOf` and a compatible parent dependency. They remain
`type: "source"` packages, but may add management functions and views without
creating a separate CMS Source artifact.

`emailer` remains part of the transitive closure for Commerce `builtin`
notifications even when no page calls it directly.

`forms` remains a source and owns its data, schema, endpoints, persistence,
connectors, functions, optional operator views, and conformance tests. It does
not own rendering. The removed `forms-renderer` is not a compatibility alias;
form fields and controls needed by a site are presentation resources in Mossa.

`sales-configurator`, `photo-albums`, and `ban` are not supported source kinds.
Do not restore their exports, fixtures, release scenarios, or implicit
dependencies.

## Collections own presentation resources

A collection is a declarative set of blocs and theme requirements. It does not
mount HTTP routes, connect to a database, deploy backend infrastructure, or
publish dashboard views. Operator views follow the source that owns the
managed business data.

There are two official collection packages with deliberately different roles:

- `ulvia@1.0.0` is a theme-only collection. It publishes the
  `ulvia-theme@3` contract and public `--ulvia-*` tokens, with no bloc resource,
  bloc artifact, or bloc category.
- `mossa@1.0.0` is the only current bloc collection. Every owned custom element
  and resource uses the `mossa-*` and `mossa/blocs/*` namespaces. It depends on
  `ulvia@^1.0.0` for the shared theme contract.

A future collection may depend on Ulvia's theme contract without depending on
Mossa. It must not assume that Mossa is installed.

Mossa contains no Documentation, Restaurant, Workspace, Sales Configurator,
Photo Albums, or Forms renderer family. It keeps only the reusable visual and
interactive catalogue retained by the official collection, including generic
form controls and a structured table bloc.

Category labels are local to Mossa and stay concise: `Actions`, `Account`,
`Commerce`, `Content`, `Feedback`, `Forms`, `Interaction`, `Layout`, and
`Navigation`. Historical package prefixes do not belong in labels.

A source-backed Mossa resource declares its Source package range, endpoint URN,
contract range, and the Bloc values bound to request, response, or error paths.
For example, `mossa/blocs/consent-field` requires `consent@^1.0.0`, endpoint
`urn:consent:getRequirements@^1.0.0`, and binds its `params.context` input to
`props.contextKey`.

Conformance rejects a missing Source, incompatible version, unknown endpoint,
contract mismatch, or invalid binding path. Mossa's static audit also
correlates every assembled artifact's fixed binding or imperative CMS Source
access with one declaration, and forbids configurable Source prefixes,
endpoint names, and function IDs. Current official definitions use stable Source
IDs and have no installation alias input. This extra audit covers Mossa, not every
third-party or legacy collection.

Provider identity is intentionally exact today. A bloc requiring an endpoint
from `commerce` cannot silently bind to another source merely because it
advertises a similar shape. Provider substitution needs a separate typed
capability-resolution contract.

Endpoint declarations drive resolution and conformance, not authorization.
The Source endpoint's access mode still checks each runtime request. Installing
a Source never grants a Bloc implicit access to all of its endpoints.

Theme requirements follow the same explicit model. See
[Integration theme contracts](./themes.md).

## Selection and dependency closure

The CMS persists `activeResources` on a collection installation. Users may
select exact resource IDs or use categories as an authoring shortcut; category
names are never the stored authority.

Only Sources referenced by active resources are installed. Dependencies are
resolved transitively. A resource uses `requires.resources` for blocs in its
own collection and may request a small part of another collection with an
explicit version range. Ulvia has no bloc resources, so Mossa declares
`{ "kind": "ulvia", "versionRange": "^1.0.0" }` in
`theme.dependencies`, with no theme categories of its own.

Requirements are installed before the selected collection and must satisfy all
declared versions and contracts. A transitively required resource is renderable
but does not become user-selected: `activeResources` remains exact.

On rerun or upgrade:

- the previous exact selection remains active unless explicitly changed;
- a newly added collection resource remains inactive, even if it is a default
  for fresh installations;
- removing an active resource is rejected as incompatible;
- removing a source that an active resource uses is rejected with the blocking
  collection and resource IDs.

Source removal is not currently a CMS action. A future removal plan must call
`assertSourceCanBeRemoved` before changing an installation.

## Native HTML belongs to the CMS

Collection artifacts may use semantic native HTML inside their private
templates, but they cannot publish or replace an artifact whose root tag is a
native HTML element. The compiler and integration validation enforce this for
all native tags. The CMS editor owns the supported native catalogue, placement
rules, media pickers, rich-text operations, and deny-by-default attribute
policy. See [Create A Bloc](../blocs/authoring.md#native-elements).

## Versioning consequences

Source and collection SemVer answer different questions:

- source SemVer describes data, endpoint, and runtime behavior compatibility;
- collection SemVer describes resource IDs, endpoint bindings, authored markup,
  and theme compatibility.

The current Ulvia and Mossa restructuring is an intentional clean break. There is
no alias for old `basic-*`, `base-*`, `cs-*`, source-owned rendering tags, or
old resource IDs, and no content migration for them. New local sites author
directly with `mossa-*` tags. General future releases still follow the normal
SemVer and upgrade rules.

## Collection and site boundaries

Mossa is reusable presentation. It contains no customer logo, favicon,
organization data, copy, routes, pages, legal mentions, navigation composition,
or `--site-*` values.

Site identity and policy are CMS data owned by the downstream site repository.
That repository owns headers, footers, account navigation, assets, routes,
copy, pages, locale, currency, country, public configuration, and `--site-*`
overrides. Business classifications, checkout policy, and offer state come from
Source data or site configuration; Mossa only presents them.

Templates and onboarding are intentionally deferred. When introduced, they
should create site-owned content from versioned input without becoming the
permanent owner of pages or mutable business data.
