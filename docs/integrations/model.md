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

A source must not publish blocs, dashboards, theme tokens, pages, or visual
defaults. Operator-owned business values also do not belong in installation
answers. Legal documents, prices, consent policy, and similar mutable state are
stored at runtime and changed through authenticated APIs or dashboards.

Every public endpoint declares a `contractVersion`. Changing implementation
without changing that observable contract is compatible. A breaking request or
response change requires a new endpoint contract major, even when the source
package itself also receives a major version.

## Collections own presentation resources

A collection is a declarative set of blocs and theme requirements. It does not
mount HTTP routes, connect to a database, or deploy backend infrastructure.

Ulvia is the official monolithic collection. It physically contains every
official bloc, including the default presentation for every official source.
Monolithic packaging does not mean monolithic installation: each site stores
an exact list of active resource IDs and the authoring catalogue exposes only
that selection.

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
        "contract": "ulvia-theme@1",
        "required": ["newsletter-accent"]
    }
}
```

Endpoint requirements are exact capabilities, not informal dependencies. The
collection names the source package range, endpoint URN, endpoint contract
range, and the bloc values bound to request, response, or error paths.
Conformance rejects a missing source, incompatible version, unknown endpoint,
contract mismatch, invalid binding path, or unknown theme token.

Theme variables are contracts too. A resource declares `ulvia-theme@1` and
lists required tokens plus optional tokens with fallbacks. A future breaking
theme vocabulary uses another contract major instead of silently changing the
meaning of an existing token.

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
                "versionRange": "^2.0.0",
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

Legacy dashboard definition files remain in each source tree under
`definitions/artifacts/dashboards` so that the deferred dashboard work is not
silently lost. Current v2 source roots do not reference those files, package
building does not include them, and installing a source does not install a
dashboard. They must be reviewed against the future dashboard model before
they can become published resources again.
