# Protocol v1 fixtures

`representative.contract.json` is an executable contract fixture covering:

- a paginated query;
- a keyed command and declared business error;
- binary upload and download;
- a long-running operation with a binary final result;
- a change feed and snapshot bootstrap.

`mock.contract.json` demonstrates a successful binary mock and a declared
business-error mock. `mock-assets/receipt.svg` is its small binary asset. A release declares its
ID, media type, byte length, and SHA-256 digest; mock values reference it with
`{ "assetId": "..." }` only at binary schema leaves. Asset bytes are supplied
separately to `admitContractBundle` and verified before publication. They are
not embedded in canonical release JSON, and mocks do not change capability
compatibility.

`conformance.contract.json` defines a standalone contract release.
`conformance.suite.json` is a separately versioned, statically validated test
suite pinned to that release's exact digest. It demonstrates ordered calls, an
admin actor, a captured ID and typed reuse, success checks, and a declared error.
It creates an item before querying it, then deletes that item before asserting
`NOT_FOUND`, so the scenario does not rely on pre-existing tenant data. The
suite requires a fresh disposable tenant per applicable scenario/profile pair,
even after failure, but
contains no runner, endpoint, credentials, or claim that a provider passed it.
Changing the suite does not change the release digest.

Capabilities may declare mandatory, provider-neutral `requires` entries naming
an external contract, capability, and compatible SemVer range. The catalogue
checks explicit `supportRanges` (defaulting to the whole `versionRange`)
against published history, including yanked releases. Requirements from one
capability to the same contract need a joint release witness; installations
must later select an available release and provider for the whole graph.
Dependency-profile examples live in
[tests/contracts/conformance/dependencies/](../../../tests/contracts/conformance/dependencies/): they
pin payment majors separately and validate external setup calls, captures, and
transitive requirements for each applicable profile. Scenario `profiles`
selectors allow separate major-specific scenarios; omission applies to all.
Support coverage requires a profile that actually invokes the root capability.
Dependency-free suites without new fields retain their digests.

[Conformance controls](./conformance-controls.md) specifies literal templates,
captures, keyed replay, operation completion, eventual queries and pagination.
[HTTP parameters](./http-parameters.md) specifies `json-percent` scalar transport
and bodyless HEAD error identity. These are validated declarations and codecs,
not a runner or a passing-provider attestation. Provider-specific call
permissions belong to provider manifests.
Collection definitions are planned for the repository's future `src/collections/`
domain. Resource packages may publish collection resources and back-office views;
they must reference this contract format rather than extending it. The
[package overview](../../../README.md) distinguishes implemented and planned work.
