# Repository And Gateway Flows

`@bernouy/cms-repository` describes and validates artifacts and site choices.
`@bernouy/cms-gateway` executes selected capabilities. Runtimes supply storage,
network access, secrets and trusted actors; Control and Delivery mount the HTTP
entry points.

## Artifacts And Site State

| Object | Owner and current implementation |
| --- | --- |
| Contract release | Immutable schemas, capabilities, bindings, mocks and conformance suite definitions; memory/Mongo catalogue. |
| Provider manifest | Immutable provider claims and exact contract references; memory/Mongo catalogue. |
| Installation | Site-owned configuration, exact approved manifest, administrative lifecycle and runtime observations; revisioned memory/Mongo store. |
| Selection | Site-owned exact contract/provider choices, validated together as a bounded dependency graph; revisioned memory/Mongo store. |
| Collection release | Authored component/composition bundle admission and asset verification; no publication catalogue or installation workflow yet. |

Contract admission validates and canonicalizes a release. Provider admission
validates a manifest against releases. Site preparation and approval establish
the installation's permitted configuration and manifest digest. Selection
planning validates proposed choices against catalogue and installation revisions.
Runtime observations describe live state; they cannot approve a manifest or
change the site's selection.

These APIs exist in explicit `cms-repository/contracts`, `/providers` and
`/collections` subpaths. Mongo adapters use `/contracts/mongo` and
`/providers/mongo`. The package root exports types only. See the
[repository package guide](../../packages/features/cms-repository/README.md)
for the complete export map.

## Live Invocation

```text
Control or Delivery request
  -> trusted actor supplied by the surface
  -> exact site selection and approved installation
  -> current readiness and host authorization
  -> admitted binding plan, credentials and provider identity alias
  -> bounded transport to the provider
  -> contract validation and response projection
```

The current execution slice supports synchronous JSON queries, synchronous
commands with `none` or `natural` idempotency, and bounded file reads. Keyed
commands, asynchronous execution and binary request bodies are rejected. A
dispatched command whose response cannot be accepted can return an unknown
outcome with a request ID; consumers must reconcile it before retrying.
Keyed commands still require durable idempotency before activation.

When `CMS_GATEWAY_SITE_ID` is configured, `cms-server` constructs Mongo release,
manifest, installation and selection stores, a selected catalogue, network and
secret adapters, image storage and observation refresh. The current host policy
allows public/authenticated access on Delivery as declared by the capability;
Control invocation requires the configured local administrator. A broader grant
model is not wired into this runtime.

| Surface | Routes relative to its base path |
| --- | --- |
| Control | `POST /api/call/<contract>/<capability>`, `GET /api/media/<contract>/<capability>/<fileId>`, `GET /api/image/<contract>/<capability>/<fileId>/<width>.webp` |
| Delivery | `POST /.cms/call/<contract>/<capability>`, `GET /.cms/media/<contract>/<capability>/<fileId>`, `GET /.cms/image/<contract>/<capability>/<fileId>/<width>.webp` |

Routes are mounted only when their dependencies are configured. Image routes
also require the image service. Control's `GET /api/editor/capabilities` projects
selected capabilities for authoring. These reads do not publish or select providers.
Dynamic SEO invokes the gateway directly; see [page indexing](../surfaces/page-indexing.md).

## Identity And Media

A CMS user keeps one alias per **provider ID**, shared across sites and
installations of that provider. Existing authority aliases are reused; a new
alias is generated only when none exists. CMS subject IDs remain inside the
CMS. Revoking an installation does not delete the provider-wide identity.

File access and derivative requests resolve and authorize the selected
capability again. Image processing is shared with author files through
Foundation, while their storage and lifecycle remain separate. Gateway images
have a server derivative store and currently return `private, no-store` to
clients. See [image delivery](../images/delivery.md).

## Current Integration Gaps

- The runtime constructs durable stores, but Control has no mounted publication,
  installation approval, provider upgrade or site selection administration flow.
- Conformance suite validation exists; a live conformance runner is not wired.
- Mongo contract publication rejects fixture assets until a byte store exists.
- Collection admission is implemented; publication, installation, compatibility,
  renderer compilation, themes, translations and views/dashboard templates remain
  incomplete or absent from that new format.
- Provider image transforms run on demand; there is no durable derivative queue
  or public shared-cache policy.

The code establishing the production boundary is
[createProductionGateway](../../packages/runtimes/cms-server/src/runtime/gateway/createProductionGateway.ts)
and [mountSurfaces](../../packages/runtimes/cms-server/src/runtime/mountSurfaces.ts).
The [transition plan](../../PLAN_ACTION.md) tracks the remaining implementation work.
