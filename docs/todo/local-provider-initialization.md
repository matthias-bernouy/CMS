# Local Provider And CMS Initialization

**Status (2026-10-06): local and Docker bootstrap operational.**
Provider-owned discovery and durable registration of the existing local
`default` Core are implemented. The development CLI seeds its persistent
repository with official resources. The production image carries the same
pre-admitted snapshot; its private repository installs that snapshot atomically
on an empty volume, then Core idempotently connects the official provider and
installs or upgrades the Control collection. Provider-owned creation, update,
stop, backup and restore operations remain later lifecycle work.

This note defines the intended first-run, restart, Control bootstrap and
recovery flows for the official local CMS provider. It refines the broader
[Control Pages and provider-managed CMS instances](./control-pages-and-provider-managed-cms-instances.md)
proposal.

## Responsibility Boundary

The local product has two administration domains:

```text
Official local provider
├── owns CMS instance lifecycle
├── owns its private instance registry and routing
└── provisions storage and starts the Core

Managed CMS Core
├── owns CMS data meaning and migrations
├── exposes ulvia.cms.* data-plane contracts
└── renders Control and Delivery Pages
```

Instance lifecycle belongs only to the provider contract, whose published ID is
`ulvia.provider.cms-instances`. Core contracts such as `ulvia.cms.pages` never
list, create, start, stop, back up or update CMS instances.

Provider credentials are opaque to CmsCore. The provider may associate a
Bearer token with an account or CMS instance by any private mechanism. CmsCore
does not standardize token claims, persist a copy of the provider's instance
registry or place an instance ID in collection inputs and execution plans.

## Initial Local Composition

The first implementation may compose the provider and one CMS instance in the
same process, image or Docker stack:

```text
Autonomous local deployment
├── official local provider
│   ├── private instance registry
│   ├── lifecycle operations
│   └── private routing and credentials
├── private instance "default"
│   ├── exact Core artifact
│   ├── Control surface
│   └── Delivery surface
├── persistent CMS database
├── persistent files and encrypted secrets
├── provider state
└── verified bootstrap release bundle
```

The process boundary may change later without changing the contracts.

The current CLI starts these as separate local processes. It gives the provider
only the Core version and loopback reachability URL; the provider does not import
`cms-server`. The durable provider record deliberately excludes CMS secrets and
the published discovery response excludes its private health URL.

The production Compose stack uses one CMS service and one private repository
service from the same immutable image. This proves offline bootstrap; it is not
yet a general provider implementation capable of creating arbitrary instances.

For the current development stack, the CLI admits a checked bundle of canonical
official contract, provider and collection releases into its immutable local
repository before starting the HTTP repository. Runtime startup never reads the
authored source folders. A generation check keeps the bundle aligned with those
sources, and the same digest-pinned shape can be carried by a production image.

## Fresh Installation Flow

### 1. Start The Provider

The provider starts its control plane and opens its private state. On a fresh
deployment the instance registry is empty.

For the standard local Docker experience, the provider automatically creates
the private `default` instance on first start. This is equivalent to a provider
lifecycle `create` operation, but does not require the operator to invoke it
manually.

### 2. Provision Durable Resources

The provider reserves `default`, selects the exact bundled Core artifact and
provisions:

- the CMS database namespace and bounded database credential;
- the blob/file store;
- the encrypted secret store;
- durable migration and release state;
- provider-private routing and runtime credentials.

The provider may store desired and observed deployment state privately. Those
records are not shared CmsCore domain models.

### 3. Start The Core In Maintenance

The provider starts the Core with injected adapters and configuration. The
Core process itself is stateless; the managed CMS is not. The Core owns the
meaning of data stored through the provisioned adapters.

While the instance is not ready, public writes remain blocked. The Core:

1. creates or validates its internal schema;
2. runs its own adjacent persistence migrations;
3. initializes the migration and revision journals;
4. verifies required storage and secret access;
5. admits the exact bundled official releases;
6. installs or verifies the compatible Control resources;
7. runs readiness checks.

The provider orchestrates the transition but never edits Core-owned database
documents using provider-specific assumptions.

### 4. Admit The Bootstrap Release Bundle

The local image or stack includes a digest-pinned bundle sufficient to start
without a live repository service:

```text
required official contracts
ulvia-official collection
ulvia-control collection
```

`ulvia-official` currently provides the reusable theme, layouts, forms,
navigation, visual Blocs and the first Control Pages. A future
`ulvia-control` split may move Control-only Blocs and Pages behind explicit
selective dependencies on `ulvia-official`; no such split is required by the
runtime model.

The authored source directory is not mounted as a runtime repository. The
bootstrap bundle contains admitted immutable release artifacts.

### 5. Bootstrap The First CMS Administrator

Provider administration and CMS administration remain separate authorities.
The local composition supplies a short-lived, one-time CMS bootstrap secret.
The Core uses it only to create the first CMS administrator and consumes it
after the protected mutation commits.

A provider administrator does not silently become a CMS administrator, and a
CMS administrator does not receive provider lifecycle authority.

### 6. Commit Readiness

The provider considers `default` available only after the Core reports:

- completed migrations;
- healthy durable stores;
- admitted required contracts;
- compatible installed official collections;
- mounted Control and Delivery surfaces;
- a consistent Core release and contract manifest.

Only then does the provider route its opaque authenticated instance context to
the Core.

## Control Bootstrap And Rendering

Provider lifecycle administration exists outside CMS Control Pages because it
must remain available when the Core is stopped or broken. Its first local
surface may be the CLI plus a minimal bootstrap/recovery document.

Rich CMS administration begins only after `default` is ready. A minimal,
non-visual Control kernel remains responsible for:

- CMS authentication bootstrap and session handling;
- Control route resolution;
- loading exact Page and collection resources;
- capability transport;
- fatal compatibility, maintenance and recovery output;
- reinstalling or rolling back to a compatible `ulvia-control` release.

It is not a second administration application or design system.

For a normal request such as `/admin/pages`, the kernel:

1. validates the CMS session;
2. resolves the stable Control Page reference from the Control route registry;
3. loads the exact `ulvia-control` release and Page document;
4. validates `surface: "control"` and every nested Bloc surface;
5. resolves Blocs, texts, translations, assets and theme tokens;
6. renders the Page and its collection-authored navigation.

Layouts, sidebars, menus and tabs are ordinary Control-compatible composition
Blocs. The Core does not impose their shape or navigation depth.

## Control Capability Calls

A Control Page derives its requirements transitively from its Blocs:

```text
ulvia-control-pages-table
└── requires ulvia.cms.pages/list
```

The compiled plan pins the approved provider installation, exact contract
release, capability, collection/Page/Bloc consumer and CMS-owned actor/site
authority. It does not contain a provider-private CMS instance ID.

At runtime:

```text
Control Bloc
-> same-origin Gateway call
-> CMS session and execution-plan checks
-> opaque provider credential
-> official local provider
-> provider-private routing to default
-> managed Core capability
-> CMS feature and persistence adapter
```

Collection JavaScript never receives the provider credential. Within the Core,
features use their direct domain and persistence interfaces rather than calling
their own public provider route recursively.

## Normal Restart

On restart the provider:

1. reopens its private registry;
2. finds `default` without creating a duplicate;
3. remounts the durable resources;
4. starts the recorded exact Core artifact;
5. waits for Core migration and release verification;
6. resumes opaque routing only after readiness succeeds.

The CMS administrator is not recreated and immutable releases are not
reinstalled when their exact digests are already present and valid.

## Failure And Recovery Flows

### Provider Ready, Core Stopped

The provider control plane can still inspect, start, restore, update or roll
back the instance. CMS Control Pages are unavailable because their Core is not
running.

### Core Ready, Control Collection Broken

The minimal Control recovery document can inspect compatibility, reinstall the
bundled compatible release or roll back `ulvia-control`. It must not grow into
a parallel full administration UI.

### One Control Page Broken

Other Control routes remain available. Recovery may restore a compatible Page
or collection generation according to the collection migration and retention
policy.

### Provider Control Plane Unavailable

The target architecture must eventually let an already running instance keep
serving Delivery without consulting the provider control plane for every public
request. The initial single-stack deployment may share a failure domain, but
must not encode that coupling into contracts.

## First-Version Decisions

The initial local implementation uses these decisions unless source
investigation proves one infeasible:

- automatically create one private `default` instance on a fresh local start;
- keep provider credentials and instance routing opaque to CmsCore;
- use a one-time CMS administrator bootstrap secret;
- ship an offline, digest-pinned bootstrap release bundle;
- provide rich CMS Control entirely through collection Pages;
- retain only a minimal built-in bootstrap and recovery document;
- keep provider lifecycle administration available independently from the
  managed Core;
- do not require Ulvia Cloud for startup, Control, Delivery or recovery.

## Initial Acceptance Flow

```text
fresh durable volumes
-> start provider
-> privately create default
-> provision CMS stores
-> start Core in maintenance
-> migrate Core data
-> admit bootstrap releases
-> bootstrap first CMS administrator
-> commit readiness
-> render a collection-owned Control Page
-> invoke one read-only ulvia.cms.* capability through the provider
-> restart the stack
-> recover the same data, releases and administrator
```

The first implementation is complete only when that flow works without a Cloud
account or live remote Ulvia service and when a failed readiness check leaves
the instance unavailable rather than partially active.
