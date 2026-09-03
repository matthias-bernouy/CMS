# Remote integration publication

Remote publication is the next milestone after the local-first release flow.
`ulvia push` is currently disabled and no command writes to the remote
repository.

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

## Proposed command behavior

```bash
ulvia push <kind> [--version <version>]
ulvia push --all
```

The client should:

- resolve only locally released coordinates;
- read their immutable package object and recorded digest;
- compare remote state before uploading;
- upload missing objects and verification evidence;
- request atomic admission of the coordinate and channel update;
- report `published`, `already published`, or an actionable rejection.

`push --all` should use dependency order and skip identical remote
coordinates. A failure must not mutate later coordinates silently, and a retry
must safely resume from objects already uploaded.

Authentication must be supplied through a credential store or environment
secret, never embedded in the repository URL, manifest, package, or shell
history produced by the CLI.

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

The existing remote PostgreSQL verifier does not yet provide a disposable CMS,
MongoDB, Supabase Auth, Storage, and Edge Functions environment. The protocol
and immutable workload are prepared, but remote runtime execution and `ulvia
push` remain disabled until that server-owned capability exists. The production
runner must not gain a host Docker socket; use a dedicated, resettable service
stack or an equally isolated worker boundary.

## Implementation sequence

1. Provision the server-owned disposable CMS, MongoDB, Supabase Auth, Storage,
   and Edge Functions execution adapter behind the existing worker boundary.
2. Make the mandatory platform suite execute the shared canonical release plan
   and reject publication when any scenario is missing or fails.
3. Enable strict rollback, cutover, and delayed-cleanup policy flags only when
   the runner emits the corresponding evidence.
4. Add conflict, interruption, retry, and concurrent-push tests on the server.
5. Implement single-coordinate push using the existing candidate protocol,
   then
   verify remote pull round-trips the same
   digest.
6. Implement dependency-ordered `push --all`.
7. Enable the command only after end-to-end staging and recovery tests pass.

ZIP archives may exist as transport or download conveniences, but they are not
the source of truth. The canonical content-addressed package and its digest are.
