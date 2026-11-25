# Phased distribution publication

Date: 2026-11-25. Base: `a1e964808` on `v1.0.23`.

The config-only image-ID assumption below was subsequently corrected. See the
[Docker identity correction](2026-11-25-docker-publication-identity.md) for the
observed Docker 29 failure and the real local-registry regression journey.
The results below describe the original patch and its earlier test scope.

## Implemented boundary

The workspace publisher accepts `--phase runtime`, `--phase catalogue` and default
`all`. One existing build receipt still binds the CLI archive, revision, inspected
image config IDs and catalogue hash. Receipt validation now also requires the two
correct official component coordinates and config ID formats. No contract,
Provider manifest or persisted installation schema changed.

Runtime publication performs no Ulvia Repository connection/PAT lookup. It verifies
both local images and public registry state, publishes missing identical runtime
artifacts, and publishes the CLI with `runtime-<version>`. Catalogue publication
requires matching remote images and npm integrity, without requiring local Docker
images; it pushes the existing snapshot through ordinary Repository authorization.
Only catalogue success followed by fresh runtime checks permits npm promotion.
The promotion command pins both the default and `@cyaxis` scoped npm registries.

Failures expose the current phase and exact resume command. Confirmed existing
artifacts are reused; observed different image IDs/archive integrities refuse.
Lost write acknowledgements reconcile by remote reads. An older current release
cannot move a channel backwards. No completion journal, remote rollback,
automatic deployment, automatic contract selection or new manifest type was added.

A stack upgrade updates its parser but does not universally switch selected
instance contracts. Workflow publication needs the shipped Registry capability
(`ulvia/repository@1.4.0` here); an older selection may require the existing reviewed
instance system-upgrade API as a separate explicit operation. The operator guide
records this step and its authority/revision/plan-digest requirements.

## Validation

- Initial `bun run check`: 10 gates passed.
- Final focused publication tests: 63 passed, 241 assertions, zero failures.
- Full `bun run verify`: exit 0; 4,738 general tests passed, 164 gated skips,
  zero failures. Real Mongo and browser regressions, historical crash upgrade
  (250 assertions), account/Forms workflows, shared-hosting browser restart
  (2,485 assertions) and fresh/restart TLS (18/19 assertions) passed.
- Final `bun run check`: 10 gates passed on the final source.
- `git diff --check` and new relative documentation links passed.

The focused tests cover phase parsing, no Repository contact in runtime-only mode,
missing runtime refusal before catalogue writes, image/npm conflicts, byte/depth/
time bounds and stream release, digest/index/attestation checks, local retagging,
channel preservation, refused promotion, old-version promotion refusal and uncertain
write reconciliation. Runtime disappearance during catalogue publication prevents
promotion.

`tests/operations/distribution/publication/receiver.test.ts` uses the actual Registry
SDK HTTP codecs, PAT/namespace checks and filesystem publication. Its deliberately
old admission gate refuses event declarations; explicitly enabling the updated
admission gate allows the same saved catalogue to resume after a partial commit.
Docker/npm registries and their write commands are doubles in this scenario. It
models the receiver's update; it is not itself a real old-image deployment test.
The separate existing native upgrade journey remains part of `verify`.

The final explicit npm scope flag and receiver-selection diagnostic were refined
after the general unit stage. The focused 63-test run and final static checks
cover those final source bytes; runtime package code was unchanged by these
refinements. The new HTTP scenario models a receiver admission update rather than
a logical instance contract upgrade, which remains an explicit existing operation.

Read-only production probes successfully resolved both existing official Docker
1.0.22 images through the new manifest reader, including their OCI runtime config
identities. A read-only local npm config probe verified the explicit scoped-registry
flag. No real Docker push, npm publish, npm tag write or server upgrade was performed.

The full run began before the last receiver-guidance text and scoped npm flag were
finalized; the final focused suite and static checks cover those changes directly.

## Safety, cost and limits

This is publisher tooling, not a per-tenant HTTP path. An image identity read makes
one fixed-origin public token request and one manifest request, plus at most one
runtime child-manifest request. Each phase performs a fixed number of such reads
for exactly two components. There is no global credential/cache state. Registry
metadata keeps byte limits, depth-16 JSON parsing and 15-second header/body deadlines.
Indexes have at most 16 descriptors; redirects and foreign descriptor URLs cannot
forward a grant. Docker's manifest bytes and config identity are checked; Docker
owns layer upload/pull validation. npm integrity is verified from official registry
metadata against the local SHA-512.

The release-local native lock does not coordinate publishers on different machines.
Registry tag updates have no distributed compare-and-swap in this implementation:
pre/post checks refuse observed conflicts, but another writer could race them.
Use a single publisher for channel updates and registry immutable-tag policy where
applicable. A preparation npm tag leaves an exact version publicly installable;
it provides no confidentiality or promotion barrier for explicit version requests.

Protocols consulted: [Registry V2 manifests](https://distribution.github.io/distribution/spec/api/),
[scoped pull tokens](https://distribution.github.io/distribution/spec/auth/token/),
and [npm distribution tags](https://docs.npmjs.com/adding-dist-tags-to-packages/).

The artifact-proof test suite is 160 lines after adding receipt-coordinate
refusals. Its file-size INFO finding was reviewed: keeping these related build
proofs together is clearer than introducing an artificial split. No new blocking
shape finding remains.
