# Platform V2 Architecture Plan

Status: Content-only Pages, Provider authority/delegation, Gateway invocation
observations, native streamed resources, public Content path resolution and the
Edge rename are implemented. The existing renderer and indexing queries now
run behind Content. General declarative query SSR and hosted network/mTLS
hardening remain planned. See [public Content delivery](../architecture/content-delivery.md)
and [Provider delegation](../providers/delegation.md).

The approved fresh baseline retains protocol v1, contracts 1.0.0 and Provider
0.1.0. “V2” in this document names the architecture plan, not an accepted
artifact version. No compatibility reader or automatic data migration is added.

## Objective

Make the platform boundaries match the authority they actually own:

```text
Browser
  -> Ulvia Edge
       authentication, Gateway, policy, cache, HTTP security, traces
       -> Content Provider
            public path resolution, Pages, rendering and SSR
            -> Edge Gateway
                 -> dependency Providers
```

Collections provide immutable reusable resources and generic examples. They do
not provide live Pages or reserve public URLs.

```text
Collection = Blocs + examples + texts + theme + assets
Content    = Pages + routes + public resources + rendering
Provider   = implementations + outbound requirements
Edge       = public HTTP and capability authority boundary
```

## Architectural Invariants

- A Provider never receives another Provider's endpoint or credential. Every
  inter-Provider call returns through the Edge Gateway.
- Contracts describe observable APIs, not how a Provider implements them.
- Provider manifests declare outbound capability requirements and authority.
- An installation is the enforceable machine principal. Modules inside one
  Provider process are not treated as isolated security principals.
- User identity is created by the Edge and propagated only through a bounded,
  opaque delegation. A Provider cannot assert a CMS subject identifier.
- Delegated authority is declared statically by exact capability or by a
  capability effect/sensitivity selector. It is never derived dynamically from
  one Page at request time.
- Content is the sole owner of the public Content namespace outside reserved
  Edge routes.
- Collections never create routes, redirects, Pages or URL reservations.
- An example is a generic immutable document. It is not intrinsically a Page.
- Imported content becomes site-owned immediately and is never rewritten by a
  collection upgrade.
- Command audit is durable and fail-closed. Diagnostic observability is bounded,
  asynchronous and must not make business calls fail.
- Removed formats fail explicitly. No compatibility reader, automatic
  conversion or dual-write path is retained.

## 1. Use One Fresh Baseline

Keep the approved v1 protocol/schema identifiers, contracts at 1.0.0 and the
Provider manifest at 0.1.0. Remove obsolete schemas and implementation paths
rather than adding dual readers or compatibility aliases. Operators recreate
development instances explicitly; startup never destroys or converts storage.

## 2. Keep Implementation Dependencies Out Of Contracts

Remove capability `requires` from the contract model, parser, admission,
compatibility comparison and selection graph. Migrate every current official
requirement to the Provider manifest that actually needs it.

A contract continues to own:

- capability identity and documentation;
- access level and trusted actor-context expectations;
- mandatory capability sensitivity classification;
- input, output and declared errors;
- query or command behavior, execution and idempotency;
- protocol bindings and response effects;
- deprecation and replacement metadata.

A contract must not require an emailer merely because one implementation sends
mail through another Provider. Another conforming implementation may fulfill
the same behavior internally.

Collection and Bloc capability requirements remain valid. They describe calls
that their declarative documents actually perform, rather than an implementation
strategy hidden behind a contract.

## 3. Add Provider-Wide And Implementation Requirements

Provider manifests receive a top-level `requires` list in addition to the list
on each implementation:

```json
{
    "requires": [
        {
            "contractId": "ulvia.cms.observability",
            "capabilityId": "logs.append",
            "versionRange": "^1.0.0",
            "optional": true
        }
    ],
    "implementations": [
        {
            "contractId": "ulvia.cms.content",
            "version": "2.0.0",
            "digest": "sha256:...",
            "requires": [
                {
                    "contractId": "commerce.catalogue",
                    "capabilityId": "products.get",
                    "versionRange": "^1.0.0",
                    "optional": true
                }
            ],
            "delegation": {
                "sources": ["delivery.resolve-path"],
                "allow": [
                    {
                        "contractId": "*",
                        "capabilityId": "*",
                        "effect": "query",
                        "sensitive": false
                    }
                ]
            }
        }
    ]
}
```

Top-level requirements are cross-cutting Provider needs such as observability.
Implementation requirements apply only when that exact implementation is
selected by the site.

For one Provider installation, effective outbound authority is:

```text
provider-wide requirements
+ requirements of implementations selected for that installation
- site-denied grants
```

`optional: false` makes the compatible target selection mandatory. An optional
requirement grants no authority when its target is absent and must match when a
target is selected. Requirements authorize machine calls. Delegated-user calls
use the separate bounded delegation policy described below.

This two-level model avoids repeating observability on every implementation
without forcing an Access-only email dependency when a site selects only Content.

## 4. Make Provider Authorization Selection-Aware

Change Provider call authorization so it uses the site's current selection
snapshot. Do not search every implementation in the approved manifest.

For every call, the authority service must verify:

1. source and target installations are enabled and belong to the site;
2. the source return credential is current;
3. the requested target release is the site's exact selection;
4. a global or selected-implementation requirement covers a machine call, or a
   selected implementation's delegation policy covers a delegated call;
5. the site grant has not denied the capability;
6. quotas and payload limits permit the request.

The authority remains installation-wide. A manifest may document requirements
per implementation, but code inside one shared process cannot be strongly
isolated without separate credentials and execution boundaries.

## 5. Observe Every Gateway Invocation

Add a provider-neutral invocation observer to the Gateway. Create the request
and trace identifiers before route resolution so authorization failures are
also correlated.

Every attempt records bounded metadata:

- request, trace and parent span identifiers;
- actor kind or source installation;
- target installation, contract, version and capability;
- resolution, authorization, dispatch and validation phases;
- duration, result kind, status and declared error code;
- bounded request and response byte counts.

Never record credentials, delegation tickets, raw request bodies or raw response
bodies. Provider and Content internals add child spans using the same trace.

Keep two distinct mechanisms:

- durable command audit, which remains fail-closed;
- best-effort diagnostic logs delivered through the bounded Observability
  collector.

Suppress collection while delivering `logs.append` so observability cannot
recursively observe its own transport.

## 6. Introduce Bounded Static User Delegation

When Edge invokes a Provider for an authenticated actor, the control authority
may issue a short-lived opaque delegation ticket bound to:

- site and root request;
- source installation;
- source contract, release and capability;
- CMS subject and authorization revision;
- actor class;
- expiry and maximum delegation depth.

The source Provider receives the ticket but cannot decode or modify it. It can
only return it to Edge through the Provider client.

The ticket contains no Page-specific or dynamically generated capability list.
Delegated authority comes from the selected source implementation's static
manifest policy. That policy can allow one exact target capability:

```json
{
    "contractId": "contract.c",
    "capabilityId": "c.read",
    "effect": "query"
}
```

It can instead match a bounded capability class:

```json
{
    "contractId": "*",
    "capabilityId": "*",
    "effect": "query",
    "sensitive": false
}
```

Every capability must declare `behavior.sensitive: true` or `behavior.sensitive: false` in its
contract. The classification covers sensitive input, output, resource existence
and meaningful side channels, including personal, financial, secret, security
or private organization data. There is no implicit default.

Wildcard selector semantics are:

| Effect | Sensitivity filter | Matches |
| --- | --- | --- |
| `query` | `false` | every non-sensitive query |
| `query` | omitted | every query, including sensitive queries |
| `command` | `false` | every non-sensitive command |
| `command` | omitted | every command |
| `*` | `false` | every non-sensitive capability |
| `*` | omitted | every capability (`*`, `*`) |

Omitting the sensitivity filter is deliberately broad, not equivalent to
`false`. Installation and selection review must display the concrete currently
selected capabilities matched by every wildcard selector. Selecting or upgrading a
contract must require review when it expands that concrete set.

Before a delegated downstream invocation, Edge verifies the ticket, current
source installation, selected source implementation, allowed source capability,
matching exact or wildcard selector, target sensitivity and effect, site grant,
expiry, depth and the original actor's access to the target capability. The
target receives its own Provider-scoped subject alias plus the source
installation and trace. It never receives the global CMS subject.

Preserve effect semantics independently of manifest breadth:

```text
query source   -> query target only
command source -> query or command target when the policy permits it
```

A query such as `delivery.resolve-path` can therefore never produce a delegated
command, even under an explicit `*`, `*` selector. This prevents GET rendering,
crawlers, cache revalidation and automatic retries from mutating business state.

Start with one downstream hop. Never delegate system identities. Do not accept
a subject identifier supplied in capability input or by Provider code.

The effective delegated authority is the intersection of the selected
implementation policy, selected target release, site grants, original user
access, source-effect rule, ticket lifetime and quotas. This is safer than
forwarding cookies or subject IDs, avoids dynamic per-Page grants and prepares
authenticated SSR without turning Providers into identity authorities.

## 7. Make The Provider Client Authority-Explicit

The Provider SDK should expose only two deliberate modes:

```ts
client.invoke(release, capabilityId, input, { authority: "provider" });
client.invoke(release, capabilityId, input, {
    authority: "delegated",
    delegation: context.delegation,
});
```

The SDK attaches the CMS connection credential, trace and optional opaque
delegation. It must not accept a caller-supplied CMS subject or target endpoint.
The Provider knows only Edge.

## 8. Treat Examples As Generic Documents

Do not add `pages.examples.*` or `pages.import-example`. An example may be one
Bloc, a section, a composition, an interactive preview or a complete document.

Expose examples through the generic authoring catalogue, for example:

```text
editor.examples.list
editor.examples.get
```

Page creation and update accept ordinary HTML. The editor or AI can read a
generic example document, edit it and pass its HTML to `pages.create` or
`pages.update`. An example is never required; an empty draft or an independently
authored document uses the same operations.

There is no `PageInitialContent` union, example reference in a Page write,
special copy/import command or stored provenance. The implemented reads are
`ulvia.cms.content/examples.list` and `examples.get`.

Examples never contain Page paths, SEO titles, visibility, indexing policy or
system roles. Those values come from ordinary Content commands or provisioning.

## 9. Remove Live Pages From Collections

Delete the complete collection Page domain:

- `CollectionPage` and `CollectionRelease.pages`;
- the `page` resource kind;
- Page imports and exports;
- `pages/**/definition.json` and `page.html` authoring;
- Page parsing, admission, reference and evolution rules;
- collection Page route synchronization and collision handling;
- contributed Page rendering projections;
- collection Page upgrade inventories and compatibility checks;
- Page-specific translation and resource descriptors;
- tests and documentation for those behaviors.

Validate examples directly as documents. Do not manufacture fake
`CollectionPage` values or `/examples/...` paths during admission.

Installing, upgrading or uninstalling a collection must never create, replace
or release a public URL. URL conflicts then exist only in Content's ordinary
Page route registry.

## 10. Simplify Content Page Identity And Routing

After collection Pages disappear, remove contributed Page references if no
other real producer remains. Keep only site-owned Page identities, routes,
redirects and gone routes.

Remove Page contribution provenance without adding template/example origin.
Separate remaining text and theme contributions from the Page model. Rename or
split `getContentContributions` once it no longer returns Pages.

The Page does not retain where its initial HTML came from. `getTextContributions`
now returns only installed text sources and their revision.

## 11. Make Content The Public Path Resolver

Replace the public delivery multiplexer and resource-specific delivery
capabilities with one read-only capability:

```text
delivery.resolve-path
```

In application code this is `Content.resolvePath()`.

Edge sends every bounded public `GET` or `HEAD` request except its reserved
protocol routes. The request contains only selected data:

```ts
type ResolvePathRequest = {
    path: string;
    method: "GET" | "HEAD";
    query: Array<{ name: string; value: string }>;
    accept?: string;
    acceptLanguage?: string;
    ifNoneMatch?: string;
    range?: { start?: number; end?: number };
};
```

Never forward cookies, Authorization, arbitrary request headers or the raw CMS
identity. Trusted actor and delegation context travel outside the authored
input in signed Gateway metadata.

Content resolves its namespace internally in an explicit tested order:

1. Content-owned system resources such as robots, sitemap, web manifest and
   favicon;
2. installed collection assets;
3. current, redirect or gone Page routes;
4. not found.

Content may organize sitemap chunks, snapshots and asset representations
internally. Edge does not need to know which kind of resource a path represents.

Reserved Edge routes never reach Content:

```text
/.cms/*
/healthz
/readyz
```

Administrative commands remain explicit capabilities. `resolve-path` is not a
generic replacement for `pages.create`, `theme.save-token`, collection
installation, Provider administration or log queries.

## 12. Add A Native Streamed Resource Result

Do not encode resource bodies as JSON strings or base64. Extend the Gateway with
a bounded streamed result that can represent:

- 200 or 206 response with media type and body;
- 301, 302, 307 or 308 redirect;
- 304 not modified;
- 404 not found;
- 410 gone.

Content may return only a closed metadata set such as ETag, language, location,
cache scope, byte length and range metadata. Edge retains exclusive control of
cookies, CSP, HSTS, CORS, compression, transport limits and other security
headers.

Edge defaults to `no-store` unless Content returns a valid safer cache policy.
Authenticated or delegated output must never enter a shared public cache.

## 13. Move Rendering And SSR Behind Content

Content's internal `resolvePath()` handles Page delivery by resolving the Page,
checking the trusted actor context, executing eligible server queries, expanding
Blocs, texts and assets, and returning final HTML.

Keep the rendering engine in `@bernouy/cms-content`. Inject a provider-neutral
capability-invocation port; do not import Gateway into Content domain code. The
official Provider adapts that port to the Provider Gateway client.

Initially execute only declarative queries during SSR. Commands remain browser
operations. The official Content implementation requests only non-sensitive
query delegation for `delivery.resolve-path`. A different Content Provider may
request all queries, including sensitive ones, but that broader wildcard selector
must be visible and explicitly approved. Downstream authenticated queries use
the opaque delegation ticket. Content adds internal spans such as
`route.resolve`, `page.render`, `sitemap.read` and `asset.stream` beneath the
external `delivery.resolve-path` span.

## 14. Reduce Edge To Edge

Once Content owns resolution and rendering, the public process performs:

1. health and reserved-route handling;
2. actor resolution;
3. invocation of `delivery.resolve-path`;
4. Gateway authorization and delegation;
5. cache, CSP, HTTP security and response streaming;
6. MCP and `/.cms/call`;
7. tracing and observability.

Remove Page document, Bloc expansion, collection text substitution and sitemap
semantics from this process.

Then rename:

```text
@bernouy/cms-edge        -> @bernouy/cms-edge
@bernouy/cms-edge-server -> @bernouy/cms-edge-server
cms-edge                 -> cms-edge
CMS_PUBLIC_URL          -> CMS_PUBLIC_URL
```

Keep `@bernouy/cms-gateway` as the internal capability invocation mechanism.
Keep public `/.cms/*` paths unless their protocol itself changes. Rename only
after responsibilities move so the new name describes actual behavior.

## 15. Seed Official Content From Examples

Move official administration and system documents from collection `pages/**`
to generic `examples/**`. They remain ordinary example documents with no route.

The official profile owns explicit Page seeds:

The implemented profile has `initialPages` entries with stable seed IDs,
ordinary Page paths, translated initial titles/descriptions and an example ID
from its exact pinned collection. This is provisioning configuration, not a
source schema accepted by `pages.create`.

Provisioning materializes the document and invokes the ordinary Content service.
Pending receipts support crash recovery; completed receipts retain only the
seed marker. The Page stores no link to its seed or example. Later profile and
collection changes never reapply a completed seed.

Provisioning order becomes:

```text
manifest -> Provider -> contract selections -> collection -> Content seeds -> administrator
```

The provisioning composition may call the same Content application service
locally before Edge starts. It must not implement a second Page creation path.
After creation, seeded Pages are ordinary site-owned Pages. A system reference
selects the login Page.

Do not overwrite seeded Pages on later collection changes. A future comparison
or re-import is an explicit administrator action. Resource usage analysis blocks
removal of old Blocs still referenced by those Pages.

## 16. Enforce The Network Boundary

Protocol authority is mandatory even when network isolation is unavailable:

- target Providers accept only exact short-lived invocation tokens;
- source Providers never receive target endpoints or credentials;
- mTLS authenticates Edge-to-Provider channels but does not replace capability
  authorization.

For hosted deployments, add egress policy preventing Provider workloads from
reaching other Provider origins directly. Permit Edge and explicitly approved
external business APIs. Remote third-party Providers cannot have their network
controlled by Ulvia, so target-side authorization remains the universal fence.

## 17. Remove Obsolete Implementations

The old collection Page domain, Content projection multiplexer, Edge render-input
cache and Kernel package/image/CLI identifiers are removed. Current v1 artifacts
remain the sole accepted fresh baseline; this is not a protocol-v2 migration.
No alias, dual-write path or automatic persistence conversion is retained.

## Remaining Implementation Order

1. General query-only declarative SSR with bounded delegation and cancellation.
2. Hosted egress and mTLS configuration, without weakening target authorization.
3. Review agent-facing catalogue documentation and example discovery against the
   final Content/Edge boundaries.

The implemented baseline includes profile seeding, ordinary HTML Page creation,
capability sensitivity, static delegation selectors, Provider SDK, native
resource delivery and Edge runtime/CLI/image naming.

## Validation Matrix

### Provider authority

- An unselected implementation grants no capability.
- A Provider-wide requirement is available to every selected implementation of
  that installation without duplication.
- Site denial overrides manifest authority.
- Missing optional targets reject calls without invalidating unrelated
  selections.
- Direct calls without Edge-issued invocation tokens fail.

### Delegation

- A Provider cannot invent, edit or reuse a delegation after expiry.
- A ticket cannot move between sites or source installations.
- Exact selectors match only their declared target capability.
- `query` plus `sensitive: false` matches only non-sensitive queries.
- `query` with no sensitivity filter also matches sensitive queries.
- `command` selectors never permit a query source to cause a command.
- `*` with no sensitivity filter is treated and displayed as full delegated
  authority, not as a default.
- A new selection or release that expands a wildcard selector requires review.
- Delegated access rechecks the target capability classification and site grant.
- Non-administrators cannot reach administrator capabilities.
- System identities and excessive delegation depth are rejected.

### Observability

One trace shows the public request, Content resolution/render and all nested
Provider calls. Authorization failures appear with their phase. Tokens and raw
payloads never appear. Observability delivery does not recurse or fail the
business request.

### Examples and Pages

- Examples have no route and can remain single-Bloc or multi-root documents.
- `pages.create` accepts empty or ordinary HTML content; examples are separate reads.
- The resulting Page is site-owned and retains no origin.
- Collection installation and removal never mutate Page routes.
- Collection upgrades never rewrite Pages created from examples.
- Removing a still-used Bloc remains blocked by usage analysis.

### Public delivery and SSR

- `resolve-path` handles Page, redirect, gone, robots, sitemap, web manifest,
  favicon, installed asset, range, HEAD, conditional and not-found cases.
- Reserved Edge routes never reach Content.
- Anonymous, authenticated and administrator rendering receive correct actor
  context.
- Personalized output is not publicly cached.
- SSR executes queries only and propagates delegation correctly.
- The official Content delegation policy excludes sensitive queries.
- Timeouts, invalid Provider responses and stale Page revisions fail safely.

### Fresh instance journey

```text
start Repository
create instance
import profile
install official collection
seed official Pages from examples
create administrator
start Edge
sign in
open /admin
create and publish a Page from an example
render it with an SSR Provider query
inspect the complete trace in Observability
```

## Explicitly Rejected Alternatives

- Keep collection Pages but hide their routes: the duplicate Page lifecycle and
  URL ownership remain.
- Treat every example as a Page template: examples have broader uses and no Page
  identity.
- Add `pages.import-example`: it incorrectly places examples inside the Page
  domain. Editors read a generic document and submit ordinary HTML to Content.
- Keep separate public robots, sitemap, manifest, asset and Page capabilities:
  Edge would retain knowledge of Content's internal URL namespace.
- Let Providers pass a subject ID: it makes them identity authorities.
- Derive delegation dynamically from each Page: it adds a second runtime grant
  model when static exact and effect/sensitivity selectors provide a sufficient
  bounded policy.
- Put implementation requirements back into contracts: it prevents genuinely
  different conforming implementations.
- Rename the runtime to Gateway: Gateway is one internal mechanism, while Edge
  also owns public HTTP, identity, cache, MCP and security policy.
- Automatically erase or migrate V1 storage: the cut is intentionally explicit
  and destructive operations require operator intent.

## Completion Criteria

- No admitted contract contains implementation requirements.
- Every capability has an explicit sensitivity classification.
- Provider-wide and selected-implementation requirements are the sole source of
  machine inter-Provider authority.
- Delegated authority comes only from exact or effect/sensitivity selectors on
  the selected source implementation, reduced by site and user authority.
- Every legitimate Provider-to-Provider call crosses Edge and is traced.
- Delegated SSR never exposes or accepts a CMS subject identifier in authored
  input.
- collections contain no Pages, routes or Page imports/exports.
- Examples remain generic documents and can initialize, but never become, a
  collection-owned Page.
- All non-reserved public GET/HEAD paths resolve through Content.
- Edge contains no Page rendering or sitemap business semantics.
- Fresh official provisioning creates real site-owned administration Pages from
  profile seeds.
- Removed formats have no runtime compatibility path; the fresh baseline uses v1 identifiers.
