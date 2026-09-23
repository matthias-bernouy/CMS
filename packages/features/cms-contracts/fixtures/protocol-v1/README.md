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
suite requires a fresh disposable tenant per scenario, even after failure, but
contains no runner, endpoint, credentials, or claim that a provider passed it.
Changing the suite does not change the release digest.

Provider requirements belong to the future provider-manifest fixture. Collection
blocs and back-office views belong to their future resource packages; they must
reference this contract format rather than extending it.
