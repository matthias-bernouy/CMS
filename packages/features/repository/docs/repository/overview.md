# Ulvia Repository

The Repository publishes immutable contract, provider and collection releases. Public catalogue, search, namespace metadata, publication state and downloads require no account.

## Public catalogue

Use `catalogue-list` for bounded pages of public release metadata. Optional `publisherId`, `id` and `version` filters match exact coordinates and apply before pagination. A cursor belongs to its resource kind and filters; changing those values requires starting a new page sequence. Resource details and a namespace's public publications use this same metadata API. Exact immutable downloads remain available through the release and asset capabilities, including after a release is yanked from new catalogue discovery.

## Accounts and namespaces

Register and authenticate through the selected `ulvia/cms.access` contract. Ordinary accounts can manage their own personal access tokens and claim up to 32 namespaces without administrator rights. Protected registry capabilities use the verified account identity; request bodies never select the acting account.

Read `namespace-list` for your own inventory. Public namespace metadata omits internal account identifiers. Claiming an existing namespace does not reassign it. An owner may explicitly transfer it to another existing account, using its current revision. Suspension preserves the reservation, and transferring a suspended namespace does not reactivate publication. Owners must transfer their namespaces before their accounts can be deleted.

## Publication

Read the current namespace revision, then begin a staged publication. The server binds the upload to the authenticated account, namespace and revision. Every asset, status, abort and commit operation checks that binding and current ownership. Transfer or suspension prevents continuation using the old revision. Revoked or expired PATs cannot authenticate subsequent calls.

Stream each declared asset with its exact SHA-256 digest and byte length, then commit. Assets remain private until the immutable registry accepts the complete release. A retry can resume only the same account and ownership revision. Private collection sources require current namespace ownership and are not public download assets.

## Errors

Use declared error codes. `REJECTED` indicates invalid data, unavailable ownership, a stale revision or a quota refusal. Reread current state before retrying. Technical failures use `CORE_UNAVAILABLE`; they do not grant permission to bypass checks. Clients must bind Access PAT credentials to the expected Repository origin and identity and must refuse redirects when sending credentials.

## Collection Publication Preflight

`publication-check-collection` is an authenticated `QUERY` at
`/v1/publications/check-collection`. Supply the owned namespace, its current
revision and the canonical collection JSON. The Repository validates the
candidate identity and checks its publication evolution, including yanked
historical releases, without opening an upload or writing a release. Evidence is
limited to one collection, 64 historical metadata documents and 32 MiB; exceeding
that budget returns `complete: false`. The input string is limited to 8,388,608 UTF-16 code units; CMS authoring also
caps the candidate UTF-8 payload at 8 MiB.
The returned digest identifies the checked candidate. Publication still repeats
authoritative checks because the history may change after preparation.

Collection evolution refusals use `REJECTED` with a safe `publicationCode` and
optional resource identity. These are business refusals, not infrastructure
unavailability. Exact immutable reads and compiled-only replays of already stored releases remain available.

## Repository-owned collection builds

A new collection publication includes `sourceJson` in the binary upload manifest,
plus the exact asset bytes referenced by its source paths. Source references are
labels for uploaded bytes; the Repository never fetches CMS files or arbitrary
URLs. Snapshots are limited to 8 MiB UTF-8, 16,384 files including assets and 1,024 assets.
Each text file is limited to 1 MiB UTF-8. Collection assets are limited to 10 MiB each
and 50 MiB combined, independently of source JSON. The binary upload manifest is limited to 40 MiB to include escaped source and compiled JSON.
Existing asset upload transport limits also apply. Uploads expire after one hour.

Use `publication-build` (`POST /v1/uploads/build`) with the upload ID, namespace,
revision and an `Idempotency-Key`. Its `202` response contains an `operationId`.
Poll `publication-build-status` (`QUERY /v1/uploads/build-status`) with those same
coordinates and the operation ID. Only the same actor in the same instance with
current namespace ownership can read it. The durable host queue recovers work
after restart and repeats ownership checks before execution. A changed command
requires a new idempotency key. A failed operation retains its terminal failure;
start a fresh publication attempt after correcting its cause.

The server compiles against its own published contract catalogue using the same
source compiler as local CLI releases. It refuses a result differing from the
reviewed canonical release. Under the Repository and namespace write fences it
checks evolution, persists assets and verified editable sources, then publishes
the immutable release marker. The marker is the visibility boundary. Interrupted
writes before it leave no discoverable release; an exact retry completes them.
Builds are serialized by a separate build fence; status reads and namespace transfers remain available during compilation. Finalization rechecks ownership and catalogue admission under the publication fences. The synchronous commit
binding remains available with its existing result shape.

New compiled-only collection publications are refused. Compiled-only exact
replays cannot restore missing sources. `source-put` explicitly repairs sources
for an existing release only after a server build reproduces its exact bytes;
no automatic reconstruction or migration runs. Private source reads omit
snapshots whose release marker has not been published. Contracts and Provider
manifests retain their existing publication flows.


Private `source-read` (`QUERY /v1/source-snapshots/read`) accepts `kind`, `id`,
`version`, `namespace` and `namespaceRevision`, retaining account ownership checks.
It returns source snapshots up to 8 MiB. Existing `source-get` and
`artifact-source-get` retain their 1,048,576 UTF-16-unit output bounds and refuse
larger snapshots without truncation. Current CLI/CMS clients use `source-read`.
