# Provider domain workflows

These workflows run locally against explicit ports and deterministic memory
implementations. They do not send HTTP requests, store secret values, authorize
administrators, execute business capabilities or attest provider conformance.

## Publish and compare manifests

`InMemoryProviderManifestCatalogue` takes a contract catalogue, optional manifest
limits and a clock. Publication verifies the admission envelope, canonical JSON,
digest and current contract references. A `(providerId, version)` cannot change
content; the same artifact can be published idempotently. Publisher ownership
cannot change between versions, including different major lines.

Catalogue acceptance time is separate from manifest provenance. Reads by version
or digest remain available after a yank. A yank is metadata, not deletion, and
does not rewrite installations. Historical idempotent publication and comparison
do not require the manifest's referenced contracts to remain installable.

`compareProviderManifests` returns deterministic additions, removals and changes
for implementations, requirements, endpoints, credentials, configuration, build
ranges, policies and metadata. It verifies artifact integrity but does not claim
SemVer compatibility or provider conformance. Every different manifest digest
requires explicit approval, even for a metadata-only update. Comparing different
provider/publisher identities reports `sameIdentity: false`; it does not transfer
ownership or authorize reconnecting an existing installation.

## Prepare and approve an installation

1. A host obtains a provider report through its own future transport and puts
   the submitted connection token in a secret store. Domain inputs contain
   only secret references, a canonical origin and non-secret configuration.
2. `ProviderInstallationLifecycle.prepare(candidate, report)` validates the
   exact published manifest, endpoint, provider/account identities and report.
   It issues an immutable, temporary proposal; no installation is written.
3. An authorized host caller invokes `approve(preparation, approvedBy)`.
   Approval revalidates the proposal and stores the exact manifest pin. A
   preparation is single-use after success and expires after five minutes by
   default; the configured CMS clock and maximum age control this bound.
4. The installation starts administratively enabled, with no stored runtime
   observation. `observe(scope, revision, report)` separately validates and
   records an observation with a CMS-owned timestamp.

Possessing a preparation or supplying `approvedBy` is not authentication or
authorization. The host must authorize every site-scoped action. Preparations
are local ephemeral objects, not persisted drafts or HTTP exchange tokens.

## Change, disable or revoke an installation

- `prepareModification` validates proposed endpoint, token-reference,
  configuration or manifest changes. `modify` applies an explicit approval at
  the expected installation revision. Provider, account, site and installation
  identities cannot change; reconnecting to another account needs a new record.
- A modification preserves administrative status and invalidates the old
  observation. It never upgrades site selections or adds gateway grants.
  `gatewayTokenRef: null` explicitly removes the local optional reference;
  omission preserves it. Removing the reference does not revoke the secret.
- `disable` and `enable` change administrative intent, not remote account state.
  A fresh observation is needed after a status change.
- `revoke` is terminal for that installation. Old records and selection pins
  remain readable; new selection plans cannot use the revoked installation.
  Creating a new connection requires a different installation ID.
- Mutations carry an expected revision, including observations, so a stale
  approval cannot overwrite a concurrent observation or administrative action.

These are local domain transitions. The future gateway must enforce revocation;
remote callback deletion, credential revocation and cleanup are not side effects
of these methods. Disconnecting a site must not delete shared hub business data.

## Validate and store explicit site selections

`planContractSelections` checks the caller's complete proposed site graph. It
does not find a preferred version, upgrade dependencies or switch providers.

Each contract has one exact version, digest and installation for a site. The
planner checks enabled installations, exact approved published manifests,
implemented releases, capability existence, accepted ranges and dependency
cycles. It checks both contract requirements and additional manifest requirements.
All capabilities of a selected contract are in scope; this is not a model of
partially enabled capabilities.

An absent optional manifest requirement is permitted. If that contract is
selected, its capability and range must match the optional requirement too.
Failures identify the dependency path. A valid result says
`runtimeReadiness: "not-evaluated"`: structural compatibility does not prove a
live provider is reachable or ready.

V1 replacement requires every proposed contract and manifest pin to be
non-yanked, including unchanged pins in a replacement. Historical stored graphs
remain readable after a yank; they are neither deleted nor silently upgraded.

`InMemoryContractSelectionStore.replace` revalidates the entire proposed graph,
then replaces it atomically within the memory store at the expected site revision.
It accepts selections, not a caller-supplied prevalidated plan. Its dependency
source supplies a coherent snapshot and checks its revision again before commit.
That revision must cover installations, releases, manifests and yank metadata.
Production adapters must provide the corresponding consistency guarantees; this
port does not implement a cross-database transaction. A stored plan records a
historical validation, not perpetual readiness or invocation authorization.

## Commerce and payment example

With `commerce@1.0` requiring `payment@1`, a provider may publish a new manifest
serving both payment majors and `commerce@1.1`, which accepts either major.

1. Publishing that manifest changes no installation or site selection.
2. Explicitly approving it changes the installation's manifest pin, not the
   site's contract pins. Retaining old functionality requires the new manifest
   to keep serving the selected old releases.
3. Replacing only payment with V2 while retaining commerce V1.0 is rejected.
4. Replacing commerce with V1.1 and payment with V2 together is accepted if the
   rest of the site's graph also remains valid.
5. A subsequent disable or revoke leaves those pins recorded but does not make
   them executable. Runtime invocation must recheck current installation state.

Manifest approval and site selection are separate operations, not one atomic
upgrade transaction. If a new manifest removes a selected release, the existing
selection becomes unusable; hosts must plan coordinated changes before cutover.

## Observations, persistence and remaining runtime work

`getProviderInstallationReadiness` separates disabled/revoked state from missing,
stale or current observations. It lists only exact releases reported ready in a
fresh observation; it does not turn the whole installation into a ready provider
or assert conformance. The caller chooses the maximum observation age.

Memory catalogues and stores are reference adapters, not durable storage.
Production persistence, authorized host actions, dependency snapshot coordination,
HTTP transport, secret rotation/revocation, registration/grants, UI and conformance
execution remain separate implementation work.
