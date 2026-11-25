# Publishing a distribution in phases

Build one exact distribution, then publish its runtime and catalogue independently.
`publish` consumes the existing receipt in `artifacts/distributions/<version>/cli/`:
CLI archive hash, Git revision, inspected image config identities and catalogue hash.
It never rebuilds artifacts or reads the personal release cache. Contract release
versions remain independent of the shared CLI/Provider/Edge distribution version.

## Normal release

```bash
bun run build --version 1.0.23
bun run publish --version 1.0.23
```

The default phase is `all`: publish and verify both official Docker images, publish
and verify the exact CLI archive under `runtime-1.0.23`, publish the catalogue, then
promote npm `latest` for stable releases or `next` for prereleases. Publication of the
runtime does not activate it on a server. Existing exact published bytes are reused.

## Upgrade the receiving Repository before admitting a new format

A Repository using an older parser can refuse new contract events or Workflow
manifests. Publishing declarations cannot update that parser. Use the same build
across these steps:

```bash
# On the publisher, with the build already prepared:
bun run publish --version 1.0.23 --phase runtime

# On the server hosting the receiving Repository:
bun add --global @cyaxis/ulvia@1.0.23
ulvia upgrade --version 1.0.23 --plan
ulvia upgrade --version 1.0.23

# Check the receiver's selected Registry version as described below.
# Back on the publisher, after that check or explicit instance upgrade:
bun run publish --version 1.0.23 --phase catalogue
```

Use the installation's existing data/config environment for the server commands.
The protected [upgrade workflow](deployment-lifecycle.md) retains its backup,
maintenance frontend, migration planning and recovery semantics. Publishing does
not perform that deployment. Initial system declarations are bundled with the
runtime and do not require first publishing them to the receiving catalogue.

Check the receiving instance's selected Registry contract as well. Updating an image
preserves existing contract pins except for transitions explicitly included in the
reviewed migration plan. For this build, `ulvia/repository@1.4.0` supplies Workflow
manifest publication. If the receiving instance still selects an older Registry,
use the existing reviewed instance system-upgrade API before the final catalogue
retry. The loopback operator routes are `POST /ulvia/operator/instances/:instanceId/system/plan`,
then `/system` with the returned plan digest; `/system/resume` resumes an interrupted
transition. Review and apply require operator authentication, a current local administrator,
the current instance revision and the exact shipped target manifest digest. Apply
also requires the review's plan digest. Resume takes the administrator subject and
uses the already recorded transition.
See the [route implementation](../../packages/surfaces/ulvia-provider/src/transport/systemUpgradeRoutes.ts)
and [review rules](../../packages/runtimes/ulvia-provider-server/src/runtime/instances/system/execution/upgrades.ts).
This publication change adds no instance-upgrade command or automatic selection switch.

Do not rebuild or replace artifacts between phases. If release bytes need to
change after publication, build a new distribution version. An already published
npm version cannot be replaced.

## Phase guarantees

- `runtime` needs the saved build, local Docker images, Docker publishing credentials
  and Bun's npm publishing credentials. It never contacts the Ulvia Repository or
  reads its saved PAT connection. It does not require npm CLI and never promotes
  `latest` or `next`. The exact version is publicly installable once published;
  its preparation tag is not an access restriction.
- `catalogue` requires the saved build, matching public images and matching npm
  archive metadata. It does not require the local Docker images or daemon. It
  needs the saved Repository publisher connection and the npm CLI with credentials
  for promotion. Missing/conflicting runtime artifacts refuse before catalogue
  writes. The catalogue uses its existing ownership and immutable admission gates.
- `all` performs both phases. A Repository refusal leaves the runtime available
  with catalogue publication incomplete. Promotion happens only after catalogue
  success and fresh runtime verification.

The catalogue phase checks the current channel before promotion and refuses a
version lower than its current target. Exact retries are idempotent, including
lost acknowledgements reconciled by reading remote state. Failures report the
phase and an explicit resume command; no cross-registry rollback is attempted.
No local completion journal is trusted as evidence of a remote publication.

After a CLI upload or npm channel write, confirmation polls public registry
metadata with exponential delays from one second up to 30 seconds, for at most
20 minutes per confirmation. Progress output distinguishes waiting from success.
Missing metadata, transient connection failures and HTTP 429/500/502/503/504 can
be retried during confirmation. HTTP authorization refusals, malformed metadata
and mismatched archive integrity still fail immediately. Preflight read failures
remain refusals before a write. Existing `no-cache` requests do not guarantee
immediate availability: npm can process a newly uploaded package before exposing
it. See [npm publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

Confirmation repeats reads, never the upload or channel write. An exhausted
window leaves publication unconfirmed and reports the same-build resume command;
it does not treat absence as permission to replace release bytes. A fresh process
has no durable pending-upload journal: if a previous accepted version is still
hidden, another invocation can attempt an upload, which npm's immutable-version
rule must reject; it then reconciles through the same bounded reads. Once the
matching version is visible, retries skip its upload.

## Registry checks and operating limits

Docker publication checks the official public Docker Hub manifests against the
image ID recorded by local image inspection. Depending on Docker’s image store,
that ID can address the OCI index, the runtime manifest, or its configuration.
Manifest bytes, their reported digests and referenced runtime manifests are checked
before matching the recorded ID against those verified addresses. A different
index cannot satisfy an index-pinned receipt even when its runtime config is
unchanged. Exactly one runtime platform per component is supported, with optional
matching BuildKit attestation descriptors.
Existing build receipts need no conversion or rebuild. Layer transfer and
validation remain Docker's responsibility. Publication uses
ordinary Docker credentials; public metadata reads use ephemeral pull grants
restricted to the official repositories and fixed registry/auth origins, following the [Registry V2 API](https://distribution.github.io/distribution/spec/api/) and [token protocol](https://distribution.github.io/distribution/spec/auth/token/).

npm version metadata must match package name, version and the exact archive's
SHA-512. Publishing uses Bun; channel promotion uses `npm dist-tag add` against the
fixed official npm registry, explicitly overriding a configured `@cyaxis` scope registry. See [npm dist-tag semantics](https://docs.npmjs.com/adding-dist-tags-to-packages/). Configure credentials for both tools. npm CLI presence
is checked before writes in `all` and `catalogue`.

Public registry reads can fail on rate limits or outages; they refuse rather than
assume an artifact is missing. Metadata reads have 15-second header/body deadlines
and byte bounds: 64 KiB Docker grants, 4 KiB missing-manifest errors, 1 MiB manifests
and npm metadata. Indexes are limited to 16 descriptors and two manifest reads per
image verification. Redirects are refused and descriptor URLs are never followed.

Run only one publisher for the release channels at a time across machines. The
native filesystem lock serializes this checkout's build/publication, and the
remote pre/post checks detect observed conflicts; Docker tag writes and npm
channel updates do not provide a distributed compare-and-swap. Enable registry
immutable-tag policy where applicable. These commands do not configure it.
