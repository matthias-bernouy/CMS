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

Capabilities may declare mandatory, provider-neutral `requires` entries naming
an external contract, capability, and compatible SemVer range. The catalogue
checks that one published release jointly satisfies requirements to the same
contract, including historical yanked releases. Installation must later select
an available release and provider for the whole graph.

[HTTP parameters](./http-parameters.md) specifies `json-percent` URL scalar transport and explicit header encoding,
safe query methods and derived bodyless HEAD error identity. These are validated declarations and codecs,
not a runner or a passing-provider attestation. Provider-specific call
permissions belong to provider manifests.
Initial collection authored bundles live in the repository's `src/collections/`
domain, with their own [fixtures](../../collections/v1/README.md). Resource
packages may publish collection resources, including Pages;
they must reference this contract format rather than extending it. The
[package overview](../../../README.md) distinguishes implemented and planned work.
