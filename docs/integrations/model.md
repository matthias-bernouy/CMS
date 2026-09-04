# Source and collection model

The current integration model has two package types: `source` and
`collection`. They are versioned and released independently because they own
different contracts.

## Sources own data and behavior

A source is a backend capability. It may own:

- database schemas and migrations;
- Storage buckets and object policies;
- Auth-dependent business rules;
- Edge Functions and other runtime functions;
- CMS Source endpoints, triggers, and source overlays;
- secrets and stable deployment configuration.

A source must not publish blocs, dashboard shells, theme tokens, pages, or
visual defaults. Operator-owned business values also do not belong in
installation answers. Legal documents, prices, consent policy, and similar
mutable state are stored at runtime and changed through authenticated APIs or
dashboard views.

The CMS owns the dashboard shell. A source may publish `dashboard-view`
artifacts that operate its data, endpoints, and source overlays, but it cannot
publish a legacy dashboard container or relation projection. This keeps the
business administration surface beside its source contract without coupling
the source to CMS navigation chrome.

Every public endpoint declares a `contractVersion`. Changing implementation
without changing that observable contract is compatible. A breaking request or
response change requires a new endpoint contract major, even when the source
package itself also receives a major version.

## Collections own presentation resources

A collection is a declarative set of blocs and theme requirements. It does not
mount HTTP routes, connect to a database, or deploy backend infrastructure.
It also does not publish dashboard views: operator views follow the source that
owns the managed business data.

Ulvia is the official monolithic collection. It physically contains every
official bloc, including the default presentation for every official source.
Monolithic packaging does not mean monolithic installation: each site stores
an exact list of active resource IDs and the authoring catalogue exposes only
that selection.

Category labels are local to their collection and should stay concise: use
`Actions`, `Brand`, or `API reference`, not historical package prefixes such as
`Basic Blocs · Actions` or `Documentation Blocs · API reference`. Resource IDs
remain namespaced and stable regardless of their catalogue label.

A collection resource has a stable namespaced ID, for example:

```json
{
    "id": "ulvia/blocs/newsletter-subscription",
    "type": "bloc",
    "artifact": "newsletter-subscription",
    "category": "newsletter",
    "requires": {
        "resources": ["ulvia/blocs/basic-button"]
    },
    "endpoints": [
        {
            "source": "newsletter",
            "sourceVersion": "^3.0.0",
            "endpoint": "urn:newsletter:setSubscription",
            "contractVersion": "^1.0.0",
            "bindings": {
                "input": {
                    "body.email": "state.setSubscription.email"
                }
            }
        }
    ],
    "theme": {
        "contract": "ulvia-theme@3",
        "required": ["primary-base"]
    }
}
```

Endpoint requirements are exact capabilities, not informal dependencies. The
collection names the source package range, endpoint URN, endpoint contract
range, and the bloc values bound to request, response, or error paths.
Conformance rejects a missing source, incompatible version, unknown endpoint,
contract mismatch, invalid binding path, or unknown theme token.

The provider identity is intentionally exact today. A bloc requiring an
endpoint from `commerce` cannot silently bind to a different source merely
because that source advertises a similar shape. Provider substitution needs a
separate typed capability-resolution contract and is outside v2.

Theme variables are contracts too. Resources name the `ulvia-theme@3` tokens
they require and optional tokens with fallbacks. Collections consume shared
`--ulvia-*` values, publish deliberate `--<kind>-*` hooks, keep
`--_<kind>-*` details private, and never require site-owned `--site-*` values.
See [Integration theme contracts](./themes.md).

## Selection and dependency closure

The CMS persists `activeResources` on the collection installation. Users may
select exact resource IDs or use categories as an authoring shortcut; category
names are never the stored authority.

Only sources referenced by active resources are installed. Dependencies are
resolved transitively. A resource uses `requires.resources` for blocs in its
own collection. It can request a deliberately small part of another collection
with an explicit version range:

```json
{
    "requires": {
        "collections": [
            {
                "kind": "ulvia",
                "versionRange": "^4.0.0",
                "resources": ["ulvia/blocs/basic-button"]
            }
        ]
    }
}
```

Required sources and collections are installed before the selected collection
and must satisfy every declared version and endpoint contract. A dependency
resource is installed and renderable but does not become user-selected:
`activeResources` remains the exact catalogue selection. Inactive blocs remain
available to validate and render existing page content while staying hidden
from the authoring catalogue.

On rerun or upgrade:

- the previous exact selection remains active unless explicitly changed;
- a newly added collection resource remains inactive, even if it is a default
  for fresh installations;
- removing an active resource is rejected as incompatible;
- removing a source that an active resource uses is rejected with the blocking
  collection and resource IDs.

Source removal is currently not exposed as a CMS action. Any future uninstall
or removal-plan endpoint must call `assertSourceCanBeRemoved` before changing
an installation.

## Versioning consequences

Source and collection SemVer answer different questions:

- source SemVer describes data, endpoint, and runtime behavior compatibility;
- collection SemVer describes resource IDs, endpoint bindings, authored markup,
  and theme compatibility.

Moving a bloc between packages is an ownership migration, not a data migration.
Page HTML remains site data. Obsolete integration-owned bloc artifacts are
removed through an ownership-checked transactional operation and restored if
the installation commit fails.

## Collection and site boundaries

Mossa is a reusable collection even though some historical tags still use the
`cs-*` prefix. It may provide specialized marketplace layouts and consume the
Ulvia design system, but it must not contain the Courtside logo, favicon,
organization data, pages, or customer-specific theme values.

Site identity is CMS data. A site composes installed collection blocs into
pages and site blocs, owns its public configuration and assets, and may provide
a small number of `--site-*` overrides. This lets several collections coexist
without forcing each one to recreate primary, feedback, surface, typography,
spacing, and shape variables.

Templates and onboarding are intentionally deferred. When introduced, they
should create site-owned content from versioned input without becoming the
permanent owner of pages or mutable business data.
