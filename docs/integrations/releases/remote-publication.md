# Remote release publication

Remote publication promotes an audited local release through the repository's
authenticated candidate protocol. The server, rather than the workstation,
makes the final admission decision.

This page defines the remote contract. Local package and downstream site
acceptance do not provide evidence that a real remote worker or deployment has
passed this gate.

The remote repository must preserve the same package model as the local
repository. Push is promotion of an already built local artifact, not another
build.

## Required invariants

The implementation must satisfy all of these rules:

1. Upload the exact canonical package bytes stored locally.
2. Recompute and compare the SHA-256 digest on both client and server.
3. Treat `kind@version` as immutable.
4. Make an identical coordinate and digest an idempotent no-op.
5. Reject a coordinate that already points to another digest.
6. Validate package identity, definition, dependencies, and release ordering.
7. Rerun the shared release-verification plan in server-owned disposable
   infrastructure. Client evidence is diagnostic only and cannot admit a
   release.
8. Publish package objects before atomically updating version references and
   `stable`/`latest` channels.
9. Keep all previous objects and references readable after a failed push.
10. Record actor, time, digest, verifier identity, and admission result in an
    append-only audit trail.

The server must never reconstruct a package from Git, a ZIP, or a source
directory during push. Otherwise the locally audited digest would not describe
the remotely installed artifact.

## Command behavior

```bash
ulvia push <kind> [--version <version>]
ulvia push --all
```

The client:

- resolves only locally released coordinates;
- reads their immutable package object and recorded digest;
- compares remote state before uploading;
- uploads the canonical candidate containing the exact package and immutable
  verification evidence;
- requests atomic admission of the coordinate and channel update;
- reports `published`, `already published`, or an actionable rejection.

`push --all` should use dependency order and skip identical remote
coordinates. A failure must not mutate later coordinates silently, and a retry
must safely resume from objects already uploaded.

`ULVIA_URL` is the manager CMS base URL. That CMS authenticates the user's
Personal Access Token and forwards only allow-listed repository operations to
the private management listener. `ULVIA_TOKEN` supplies the PAT as an
environment secret. Tokens are never accepted in URLs, manifests, packages, or
CLI output.

`ULVIA_REPOSITORY_URL` remains a separate anonymous read endpoint. After a
candidate is admitted (or found unchanged), the CLI reads the coordinate from
that public endpoint and compares its SHA-256 digest with the local object. This
also fails closed when the configured manager and public repository do not
expose the same admitted coordinate.

The default admission timeout is 15 minutes and can be changed with
`ULVIA_PUSH_TIMEOUT_MS` or `--timeout-ms`. Remote HTTP is accepted only for
loopback hosts unless `--allow-insecure-http` is explicitly supplied for a
trusted internal network.

## Shared verification trust boundary

Local and remote verification use the same canonical planning code. The plan
contains every installable historical version, its exact package digest, the
portable business-fixture metadata, and the deduplicated crash-recovery matrix.
The portable fixture source closure is stored in a separate immutable
verification bundle bound to the target package digest.

The repository builds this plan from its authoritative catalog; it never trusts
a baseline list supplied by the client. Worker transport then supplies every
exact historical package and rejects omissions, extras, reordering, changed
bytes, or a fixture plan that differs from the verification bundle.

A plain client boolean such as `verified: true`, and even a signed local
attestation, is not sufficient for publication. The remote worker must execute
the plan again and bind its result to the package, verification bundle, upgrade
baselines, dependencies, admission plan, runner image, and policy digests.

The remote verifier now composes two independently bounded proofs. The existing
PostgreSQL sandbox checks static, SQL, schema, RLS, grant, author-suite, and
migration contracts. A dedicated release runtime executes the mandatory
`platform-release-runtime` suite against disposable CMS, MongoDB, Supabase Auth,
Storage, PostgreSQL, and Edge Function services. The supervisor accepts only the
complete joined result and validates it against the original admission plan.

The release runtime uses the same `executeReleaseVerificationPlan` and scenario
implementation as local `ulvia release`; it is not a second upgrade algorithm.
It controls a private disposable Docker daemon and never receives the repository
worker credential, production credentials, production data, or the host Docker
socket. `ulvia push` uses this candidate path and never receives repository
worker credentials.

## Deployment gate

The client implementation covers exact-byte submission, immutable conflicts,
idempotent retries, bounded rate-limit retries, concurrent identical
publication reconciliation, public digest round-trips, and dependency-ordered
batch publication. Before production cutover, deploy the new repository image
to staging, run a real candidate through both verifier workers, interrupt and
resume one publication, and validate the existing production catalog and CMS
consumer routes against the new public endpoint.

ZIP archives may exist as transport or download conveniences, but they are not
the source of truth. The canonical content-addressed package and its digest are.
