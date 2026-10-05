# Control Pages And Provider-Managed CMS Instances

**Status:** target design with the immutable collection Page slice implemented.
Lot 1 provider-owned local instance discovery is implemented; site-owned Page
unification, rendering, Core data-plane contracts and Control replacement remain
planned.

This note records the intended direction for replacing visual Foundation
components and the removed collection View model. The former Dashboard system and
the static Control application have already been removed; this document retains
only the behavior that future Control Pages may need to recover.

## Objectives

The target is to:

- keep the removed filesystem-backed Control application from returning;
- move visual components into collections rather than Foundation;
- use the same page composition and future editor for public and
  administration pages;
- let collection Blocs implement Control interfaces through versioned
  capabilities;
- expose CMS domain operations through the existing contract/provider model;
- make the official local provider and autonomous Docker deployment the first
  reference implementation, before Ulvia Cloud;
- remove platform-owned assumptions about primary navigation, lateral menus,
  tabs and navigation depth;
- preserve explicit dependencies, resource generations, execution plans and
  access checks.

Collections become the distributable frontend application format. A CMS
provider creates and manages one or more CMS instances. Each instance runs an
exact Core release, owns its data and exposes the official CMS contracts that
this release supports.

## Minimal Domain Model

The proposed authoring model has four primary concepts:

```text
Collection
├── Blocs
├── Pages
├── Texts, assets and themes
└── Provider and contract requirements
```

At platform level:

```text
Bloc         reusable behavior and presentation
Page         one composed document rendered on one surface
Provider     creates, manages and routes to CMS instances
CMS instance exact Core runtime, data and supported contract set
Collection   immutable distribution and dependency unit
```

`Dashboard` has been removed. `View` and `Application` are not required in the initial target
model. A future grouping primitive should only be introduced for a demonstrated
access or lifecycle requirement, not to own rendering or navigation.

## Pages Have Exactly One Surface

A Page belongs to exactly one surface:

```ts
type PageSurface = "control" | "delivery";

interface CollectionPage {
    readonly id: string;
    readonly surface: PageSurface;
    readonly generation: number;
    readonly defaultPath: string;
    readonly document: PageDocument;
}
```

A Page must not support both surfaces. Its execution origin, routing lifecycle,
authorization context and Gateway plan must remain deterministic.

Blocs may support one or both surfaces:

```ts
interface CollectionBloc {
    readonly surfaces: readonly PageSurface[];
}
```

Admission validates the relationship transitively:

```text
Control Page
├── Control Bloc                    allowed
├── Control + Delivery Bloc         allowed
└── Delivery Bloc                   rejected

Delivery Page
├── Delivery Bloc                   allowed
├── Control + Delivery Bloc         allowed
└── Control Bloc                    rejected
```

A composition is only compatible with a surface when every nested Bloc and
composition dependency supports that surface.

## One Page Document And Editor

Control and Delivery Pages share the same composition document:

- Bloc tree and slots;
- settings;
- texts and translations;
- media and collection assets;
- theme tokens;
- dependency derivation;
- revisions and future history;
- collection migrations;
- rendering and editor canvas.

Surface-specific concerns remain outside the shared document:

- Delivery adds publication, localized routes, indexing and SEO;
- Control adds authenticated access and administration routing.

The editor engine remains common. Its surrounding panels may differ according
to the Page surface. This is one editor with surface-specific host controls, not
two composition systems.

## Page Ownership

Two ownership modes are expected while retaining the Page concept in the
product.

### Collection-Owned Page

A collection release can provide an immutable Page:

```text
ulvia-control:pages-management
```

It has a resource digest and generation, upgrades with its collection, can be
exported selectively and may be referenced by another collection.

### Site-Owned Page

A site collection can author a Page with the same editor. It can start empty or
copy the document of an existing collection Page. A copied Page becomes an
independent resource; its optional origin metadata is informational rather than
live inheritance.

Automatic inheritance and three-way merging are intentionally excluded from
the first model. A later comparison tool may show differences with the original
Page without mutating the site copy.

## Routes And Site Overrides

A Page has a stable qualified identity independent from its current URL:

```text
publisher / collection / page
```

A collection Page provides a default path. Site state may override that path
without changing the Page identity:

```json
{
    "page": "ulvia/ulvia-control/pages-management",
    "path": "/content/pages"
}
```

An upgrade may change the collection default when the site has not customized
the route. It must not overwrite a site-owned route override.

Control and Delivery maintain separate route registries. The same path string
may exist on both surfaces without collision because every Page has one fixed
surface. Delivery may additionally resolve locale, publication state and
redirect history.

The intended resolution flow is:

```text
request path
    -> surface route registry
    -> stable Page reference
    -> access/publication checks
    -> Page document rendering
    -> exact Bloc and provider execution plan
```

## One Link Model

There must not be separate Control, Delivery, Dashboard or Application link
types. Internal links store a stable Page reference rather than a route string:

```ts
interface PageReference {
    readonly publisherId: string;
    readonly collectionId: string;
    readonly pageId: string;
}

interface PageLink {
    readonly page: PageReference;
}
```

The target Page already identifies its surface. The renderer resolves the
reference through the appropriate route registry:

- Control Page to Control Page produces a Control URL;
- Control Page to Delivery Page produces a public URL;
- Delivery Page to Delivery Page produces the localized public URL.

If fragments or query values become necessary, they must extend this one link
model for both surfaces. They must not introduce surface-specific link types.
Fragments are not required for the first implementation.

External URLs remain a separate target kind:

```ts
type LinkTarget =
    | { readonly kind: "page"; readonly page: PageReference }
    | { readonly kind: "url"; readonly url: string };
```

The same editor picker and Bloc setting control this type on both surfaces.

### Cross-Collection Page References

Pages need selective exports and imports alongside Blocs, tokens, texts and
assets. A saved reference to another collection's Page must produce or validate
an explicit dependency with the understood Page generation.

This permits admission to reject missing Pages, unsupported generations and
invalid references before a release reaches a site.

## Layouts And Navigation Are Blocs

A layout is a normal composition Bloc. An official administration layout may
declare:

```ts
surfaces: ["control"];
```

and expose ordinary slots such as navigation, header, actions, main and aside.
For example:

```html
<ulvia-control-layout>
    <ulvia-control-navigation slot="navigation"></ulvia-control-navigation>
    <ulvia-control-pages-table slot="main"></ulvia-control-pages-table>
</ulvia-control-layout>
```

The official layout may provide sidebars, tabs and responsive navigation, but
those are collection UI decisions rather than platform grammar. A collection
may provide another layout or omit a layout entirely.

A site can centralize common administration chrome in its own composition Bloc:

```html
<my-site-control-layout>
    <slot name="main"></slot>
</my-site-control-layout>
```

Pages then reuse that Bloc and provide their main content through normal slot
composition. No special shell or `cms-view-outlet` primitive is part of this
proposal.

Navigation Blocs use the same `PageLink` setting as every other link-capable
Bloc. The platform does not understand primary, lateral or tab placement, and
does not impose a navigation depth.

## Provider-Managed CMS Instances

CMS domain operations use the existing provider and contract model instead of a
second system-capability protocol. There is no special local CMS singleton in
the target model. Every CMS is an instance created, adopted and managed through
a conforming provider.

The provider may be:

- the official Ulvia Cloud service;
- an official local or development provider;
- a Docker or Kubernetes provider;
- an enterprise or third-party hosting provider.

Local and remote are transport/deployment properties, not different domain
models.

```text
CMS provider
├── creates and manages instances
├── instance A: Core 1.x, contracts set A
├── instance B: Core 2.x, contracts set B
└── instance C: Core 2.x, contracts set C
```

The Core remains a real runtime artifact with storage and executable code, but
it is deployed as an instance rather than treated as the one locally composed
CMS product.

### Provider Control Plane

A CMS provider implements a provider lifecycle contract. It is published as
`ulvia.provider.cms-instances`; its provider namespace prevents confusion with
the `ulvia.cms.*` Core data-plane contracts.
Its capabilities include:

```text
ulvia.provider.cms-instances/create
ulvia.provider.cms-instances/get
ulvia.provider.cms-instances/list
ulvia.provider.cms-instances/start
ulvia.provider.cms-instances/stop
ulvia.provider.cms-instances/backup
ulvia.provider.cms-instances/restore
ulvia.provider.cms-instances/available-updates
ulvia.provider.cms-instances/plan-update
ulvia.provider.cms-instances/apply-update
ulvia.provider.cms-instances/rollback
ulvia.provider.cms-instances/delete
```

This contract belongs exclusively to the provider control plane. It is not a
Core contract and is never implemented by a managed CMS instance. It remains
available even when one managed instance is stopped, migrating or unable to
serve its data-plane contracts.

### Instance Data Plane

Each created instance exposes the official CMS contracts supported by its exact
Core release:

```text
ulvia.cms.pages
ulvia.cms.files
ulvia.cms.collections
ulvia.cms.users
ulvia.cms.secrets
ulvia.cms.providers
ulvia.cms.settings
```

These contracts operate inside the already authenticated instance context.
They do not list, create, select, start or stop CMS instances. Instance
lifecycle is a provider responsibility expressed only through
`ulvia.provider.cms-instances`.

Example Page contract capabilities:

```text
ulvia.cms.pages/list
ulvia.cms.pages/get
ulvia.cms.pages/create
ulvia.cms.pages/update
ulvia.cms.pages/delete
ulvia.cms.pages/publish
```

List operations must be cursor-paginated from their first version. A generic
`get-all` operation must not expose unbounded persistence reads.

The provider may route these operations to a logical tenant, dedicated runtime,
container or cluster. Consumers must not depend on that physical choice.

### Provider-Owned Instance Identity And Opaque Routing

The provider owns its instance registry, authentication format and routing. It
may encode the selected instance in a signed Bearer token, associate an opaque
token with server-side state, use a dedicated hostname, or broker the call by
another private mechanism.

CmsCore does not standardize Bearer claims, persist a shared `ProviderInstance`
record or add an instance identifier to collection inputs and execution plans.
It treats provider credentials as opaque secret references and uses the
existing provider installation, selection and invocation flow.

An execution plan pins only CMS-owned authority and compatibility information:

```text
provider installation
+ exact contract release
+ capability
+ Page and collection release
+ actor and site authority
```

The provider determines the account and instance from the opaque authenticated
context it issued. A collection never receives provider credentials and cannot
submit or replace an `instanceId`. Provider-specific instance records,
observations, desired state and deployment generations remain private to each
provider implementation.

### Same Capability Syntax

Control Blocs declare and call these contracts through the canonical provider
capability format:

```json
{
    "contractId": "ulvia.cms.pages",
    "capabilityId": "list",
    "versionRange": "^1.0.0"
}
```

```text
/.cms/call/ulvia.cms.pages/list
```

No separate `/.cms/system` call namespace is needed. The immutable execution
plan resolves the requirement to an approved provider installation. That
provider authenticates the opaque credential and routes the call to the CMS
instance it represents.

### Transport Is An Implementation Detail

Local development, a dedicated remote runtime and a provider-brokered logical
tenant may use different transports behind the same contracts:

```ts
type ProviderTransport =
    | { readonly kind: "local"; readonly invoker: ProviderInvoker }
    | { readonly kind: "http"; readonly endpoint: string }
    | { readonly kind: "brokered"; readonly providerId: string };
```

The invocation still goes through contract validation, output projection,
access checks, plan authorization, error normalization, metrics and audit.

Within a standard Core runtime, feature ownership remains unchanged:

```text
cms-content      implements page and file capabilities
cms-auth         implements profile, user and identity capabilities
cms-repository   implements collection and provider management capabilities
cms-gateway      implements source and execution administration capabilities
```

The provider either invokes this runtime locally or routes to it. Control only
uses the generic provider invocation transport.

### Official Contracts, Conforming Providers

The official contracts form two distinct families:

```text
ulvia.provider.cms-instances   provider control plane and CMS lifecycle
ulvia.cms.*                    data plane exposed by one running CMS Core
```

The provider lifecycle contract is implemented by a CMS provider. The Core
contracts are implemented by the managed Core runtime or by a conforming
replacement behind the provider. Neither family is restricted to one built-in
implementation, but an implementation must pass its applicable compatibility,
conformance, isolation, backup, update and security policies.

Once a site is created, its Core contracts remain bound to the opaque provider
context that routes to it. CmsCore must not independently select one provider
for Pages, another for files and a third for users unless a future explicit
federation model permits that composition.

```text
provider installation
├── private provider instance registry
└── opaque authenticated context
    └── managed CMS Core
        ├── pages
        ├── files
        ├── collections
        ├── users
        └── settings
```

### Authorization

Provider availability never grants authority by itself. An invocation succeeds
only when all applicable checks pass:

1. the exact Page and collection release are installed;
2. the Page document actually uses a Bloc requiring the capability;
3. the Bloc supports the Page surface;
4. the capability permits the Page surface;
5. the authenticated actor satisfies the capability access policy;
6. the plan selects an approved provider installation and opaque credential;
7. the exact provider execution plan remains current;
8. input and output satisfy the contract schemas.

The server injects CMS-owned site and actor identities. A collection cannot
choose another site, replace provider credentials or impersonate another user
through capability input. The provider independently authenticates its opaque
credential and enforces its own account and instance isolation.

Administrative capabilities should declare both access and origin constraints,
for example:

```json
{
    "access": "administrator",
    "surfaces": ["control"]
}
```

This leaves room for future authenticated member, editor or read-only
capabilities without granting every Control Page full administration authority.

### Ulvia Cloud And Local Providers

Ulvia Cloud is the official remote CMS provider. An official local provider
implements the same provider lifecycle contract and routes the same Core
contracts by starting local processes, containers or development storage. A
third-party provider can implement the same contracts for another
infrastructure.

```text
Ulvia Cloud provider     -> remote instance
Ulvia Local provider     -> local process/container instance
Kubernetes provider      -> namespace/deployment instance
Enterprise provider      -> provider-specific instance
```

The CLI and Control host should exercise the same creation, backup, update and
rollback workflows in local development that Ulvia Cloud uses remotely.

### Local-First Reference Implementation

The first implementation is the official local CMS provider, not Ulvia Cloud.
It is a production-capable self-hosting path rather than a mock or test double.
The complete fresh-install, restart, Control bootstrap and recovery sequence is
specified in [Local provider and CMS initialization](./local-provider-initialization.md).
After the required images and artifacts have been obtained, an operator must be
able to launch and operate the complete CMS without:

- an Ulvia Cloud account;
- a remote Ulvia token;
- a mandatory connection to an Ulvia service;
- a subscription or hosted control plane.

The initial physical deployment may keep the provider and one CMS instance in
the same process, image or Docker stack. Provider/instance separation is a
domain boundary; it does not require premature process or network separation.

```text
Autonomous local Docker deployment
├── official local provider
├── default CMS instance
│   ├── exact Core runtime
│   ├── Control capability endpoint
│   └── Delivery
├── bootstrap official collections
├── persistent files
└── persistent database
```

The first provider version may keep one private `default` instance record. Its
identity does not enter CmsCore plans or Core contracts: the provider's opaque
authenticated context selects it. Later multi-instance support therefore
changes provider-owned authentication and routing rather than every CMS
contract.

The local reference implementation must eventually prove:

- startup and recovery from persistent Docker volumes;
- Control and Delivery without Cloud availability;
- exact instance and contract discovery;
- local collection installation and migration;
- backup and restore;
- maintenance and adjacent Core update planning;
- rollback after a failed update;
- exportable data and backups that are not locked to Ulvia Cloud;
- bootstrap Control resources available without a live remote repository.

Ulvia Cloud is a later remote implementation of the same contracts. It must
pass the behavior and conformance rules first established by the local provider,
not introduce a second privileged execution model.

### Control Is A Generic Instance Client

Once Control Pages and capabilities are collection-backed, Control does not
need to be authored inside every instance. A generic Control host can:

1. authenticate the operator;
2. call `ulvia.provider.cms-instances/list` on the provider control plane;
3. ask the provider to select or open one instance through its own opaque
   authentication flow;
4. read the Core contracts and versions exposed in that provider context;
5. resolve the latest compatible `ulvia-control` collection release;
6. render its Control Pages;
7. execute their plans through the selected provider installation and opaque
   credential.

An old instance can therefore use an older compatible Control collection while
a recent instance uses the latest one. Instance operation must not depend on
Ulvia Cloud availability when a local/self-hosted provider and compatible
Control host are used.

## Capability Derivation From Blocs

Administration behavior belongs primarily to Blocs:

```text
ulvia-control-pages-table
└── requires ulvia.cms.pages/list

ulvia-control-page-form
├── requires ulvia.cms.pages/get
├── requires ulvia.cms.pages/update
└── requires ulvia.cms.pages/publish
```

A Page's requirements are derived transitively from its Bloc composition. Page
authors should not duplicate those requirements manually. Direct Page-level
provider calls may remain possible only when the document format has a concrete
need that a Bloc cannot encapsulate.

The former View execution grant consequently becomes a Page execution grant,
keyed by the exact Page resource, surface, collection release and provider plan.

## Multiple Core Versions And Provider Versioning

A provider may manage instances running several exact Core releases
simultaneously. Contract support belongs to the instance, not only to the global
provider release:

```text
instance A: Core 1.8 -> pages@1, files@1, collections@1
instance B: Core 2.4 -> pages@1 + pages@2, files@2, collections@2
instance C: Core 3.0 -> pages@2, files@2, collections@3
```

Compatibility decisions should use advertised protocol and contract versions,
not hard-coded branches for every Core patch release. Newer Core releases may
temporarily expose an older contract major through an adapter so runtime and
Control collection upgrades can be decoupled.

Providers need an explicit support policy, for example current major, previous
major and selected LTS releases. Compatibility adapters must not be retained
forever.

The provider model reuses:

- contract SemVer and compatibility comparison;
- provider and instance release identity;
- immutable execution plans;
- conformance suites;
- upgrade compatibility checks;
- health reporting.

It does not replace the other migration domains:

| Change | Mechanism |
| --- | --- |
| Capability schema or semantics | Contract SemVer |
| Provider control plane | Provider release/version |
| Runtime implementation | Core artifact version selected for the instance |
| Internal Mongo document schema | CMS internal persistence migration |
| Site Page/Bloc references | Collection data migration |

The provider may withhold a new instance contract version until its internal
persistence migration completes, but the histories remain distinct.

### Adjacent Core Updates

The provider maintains a supported update graph rather than every direct
version pair:

```text
Core 1 -> Core 2 -> Core 3
```

An update from Core 1 to Core 3 executes the supported adjacent transitions. A
typical provider-owned orchestration is:

1. resolve the target artifacts and compatible collection releases;
2. produce a digest-pinned update plan;
3. obtain site policy/administrator authorization;
4. create and verify a backup;
5. place the instance in maintenance;
6. deploy the next supported runtime transition;
7. let the target Core migration runner update its own internal data;
8. update compatible official collections and execution plans;
9. run health and functional smoke checks;
10. commit the transition or roll it back;
11. repeat for the next adjacent transition.

The provider owns infrastructure orchestration. The Core migration runner owns
the meaning of CMS data. A provider must not mutate Mongo collections directly
with provider-specific assumptions.

Sites keep update control through policy such as manual, scheduled,
security-only or automatic-compatible. Remote operator intervention requires
explicit, scoped and auditable grants such as inspect, backup, plan-update,
apply-update and rollback; it must not be a hidden permanent backdoor.

## Not Every HTTP Route Is A Capability

Domain operations should become provider capabilities. Transport and bootstrap
routes remain platform-owned.

Capabilities include:

- page, route, SEO and publication management;
- file/folder metadata operations;
- collection installation and migration operations;
- user and provider administration;
- site settings and platform health projections.

Dedicated transports remain appropriate for:

- binary file and image transfer;
- collection assets and Bloc runtime loading;
- session cookies, CSRF and initial authentication;
- liveness/readiness;
- the minimal Control bootstrap and recovery document.

A capability may return a bounded media reference that the host converts into
an authorized media URL. Large binary bytes do not need to pass through JSON
capability payloads.

## Removing Static Admin And Foundation Components

The filesystem-backed Control application has been deleted. Visual Foundation
components remain until their collection replacements exist.

Control retains a minimal non-visual kernel responsible for:

- authentication bootstrap;
- provider authentication and opaque context bootstrap;
- Control route resolution;
- loading the exact Page and collection resources;
- capability transport;
- compatibility checks;
- fatal error, maintenance and recovery output;
- resolving or rolling back to a compatible official Control collection.

The kernel must remain usable when the administration collection is missing or
incompatible. It does not need a design system.

The current `@bernouy/components` package mixes visual components with generic
component, binding and source runtime primitives. Visual components can move to
the official collection. Required non-visual runtime behavior must first move
to a focused runtime package or the surface kernel before the package can be
deleted.

A likely collection split is:

```text
ulvia-official
├── theme
├── forms
├── generic layouts and navigation
└── reusable visual Blocs

ulvia-control
├── Control-only Blocs
├── official Control Pages
└── depends selectively on ulvia-official

site collection
├── public Delivery Pages
├── customized Control Pages
├── site Blocs and compositions
└── selective dependencies on both official collections
```

## Editor Runtime Modes

Control Pages may contain destructive administrative commands. The shared
editor needs explicit behavior modes:

```text
design   simulated data; commands disabled
preview  real or selected read data; commands disabled or explicitly confirmed
runtime  real behavior under the current actor's grants
```

Capability metadata should distinguish queries, commands and destructive
commands so the editor can prevent accidental mutations without maintaining a
hard-coded list of CMS endpoints.

## Removed Dashboard Responsibilities

The removed Dashboard model combined navigation, layout placement, View
reachability, activation, assignments and grants. If still required, those
responsibilities move as follows:

| Current responsibility | Target owner |
| --- | --- |
| View HTML | Control Page document |
| Dashboard navigation | Navigation Blocs using Page links |
| Primary/lateral/tab placement | Collection layout Blocs |
| Reachability | Control Page route registry |
| Capabilities | Transitively derived from Page Blocs |
| Grants | Exact Page execution plan |
| Activation | Collection/Page installation state |
| Administrator access | Page and capability policies |
| Member assignments | Future reusable access policy/group if required |

`cms-dashboards` has therefore been removed. If multiple Pages later need one
shared member assignment, add a small access-policy/group concept rather than a
rendering or navigation Application.

## Open Design Decisions

The following details must be decided before changing the collection protocol:

1. the precise shared `PageDocument` representation used by the future editor;
2. whether collection Pages and site-owned Pages share one persistence facade
   or separate ownership repositories over one document contract;
3. route default/override and redirect behavior during collection upgrades;
4. Page export/import descriptors and generation compatibility rules;
5. the Page access-policy model beyond the initial administrator-only case;
6. how a provider turns an operator's instance selection into an opaque
   authenticated context without exposing its token format to CmsCore;
7. how provider control-plane and Core data-plane contracts are advertised and
   digested without merging their responsibilities;
8. local, remote and brokered transports and their failure/timeout semantics;
9. supported Core artifact catalogues, adjacent update graphs and EOL policy;
10. scoped grants and audit for provider/operator intervention;
11. capability classification for query, command and destructive command;
12. how Control Page previews receive safe representative data;
13. how a generic Control host selects the compatible `ulvia-control` release;
14. the minimal bootstrap and recovery UI retained outside collections.

These are design decisions, not reasons to restore the former Dashboard model
or preserve the static admin model indefinitely.

## Delivery Discipline

This proposal is intentionally not considered final protocol design. It changes
Page ownership, routing, Control rendering, provider targeting, instance
lifecycle and update responsibility at the same time. Implementation must use
small, reversible vertical slices rather than a repository-wide replacement.

Required working rules:

- treat the contracts as experimental until one complete local flow is proven;
- keep the current runtime and minimal Control kernel operational during exploration;
- begin with one provider, one explicit local instance and one read-only
  capability;
- validate each domain boundary before adding distributed transport;
- run old and new paths side by side where that makes comparison possible;
- require a recovery and rollback path before introducing destructive commands;
- do not remove Foundation component code merely because the target document
  says it may disappear; Dashboard and static Control were intentionally
  removed early because there is no production compatibility requirement;
- delete an existing path only after its replacement covers behavior, access,
  persistence, failure and upgrade tests;
- record decisions that survive the prototype as protocol/architecture rules,
  and discard prototype-specific mechanisms rather than preserving them for
  compatibility.

The first vertical slice should answer only this question:

> Can an autonomous local provider privately manage one local CMS instance,
> expose its provider lifecycle separately, and route one safe Core capability
> through the normal provider plan without changing current Control or Delivery
> behavior?

Only after that is proven should the work combine collection-authored Control
Pages, provider-managed updates and removal of the existing administration.

## Suggested Implementation Order

1. Capture current local startup, Control, Delivery, persistence and recovery
   behavior as the comparison baseline.
2. Characterize the current provider installation, opaque credential,
   selection, manifest and Gateway invocation flow without assigning token
   semantics to CmsCore.
3. Define `ulvia.provider.cms-instances` as a provider-only lifecycle contract;
   keep instance records, observations and routing private to providers.
4. Wrap the current local runtime as the private `default` instance of the
   official local provider.
5. Prove autonomous Docker startup and operation with no Cloud account or live
   Ulvia service.
6. Define one bounded read-only `ulvia.cms.*` Core capability and execute it
   through a normal plan selecting only the approved provider installation.
7. Define singular Page surfaces and Bloc surface compatibility.
8. Extract a shared Page document/composition contract without changing current
   storage.
9. Add Page resources, selective Page imports/exports and stable Page links to
   collection admission.
10. Introduce the Control Page route registry with collection defaults and site
    overrides.
11. Derive capability requirements from Blocs and compile exact Page execution
    plans while keeping provider credentials and instance routing opaque.
12. Rebuild one former Control read flow end to end while retaining the kernel
    recovery response.
13. Add local backup/restore, maintenance and destructive-command safeguards.
14. Prove one adjacent local Core update and rollback using two exact artifacts.
15. Add HTTP and provider-brokered transports only after the local semantics are
    stable.
16. Build official Control layout/navigation and Page-management Blocs in
   `ulvia-control`.
17. Convert one complete mutable Control flow end to end and validate routing,
    access, editing, upgrade and recovery.
18. Resolve different compatible `ulvia-control` releases for the old and
    current Core contract sets reported through provider contexts.
19. Rebuild the remaining administration incrementally from retained behavior.
20. Add access policies only if a concrete multi-Page member use case requires
    them; the old Dashboard assignments have been removed.
21. Extract non-visual collection runtime primitives, then remove obsolete
    Foundation visual components.

The current backend implementation and kernel should remain operational during
this sequence. No additional package should be removed until the corresponding
collection Page, provider capability and recovery path have been proven together.
