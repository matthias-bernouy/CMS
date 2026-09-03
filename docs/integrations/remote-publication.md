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
7. Require trustworthy verification evidence or rerun the same verifier on the
   server.
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

## Verification trust boundary

The current local release proves source tests and disposable runtime scenarios,
but author tests are not yet stored in package bytes. The remote design must
choose and enforce one trustworthy model:

- submit an immutable verification bundle and server-verifiable attestation;
- or let the remote admission service rerun the same candidate verification.

A plain client boolean such as `verified: true` is not evidence. Admission must
bind the verifier result to the exact package digest, baseline digests,
dependency digests, fixture bundle digest, and verifier policy version.

## Implementation sequence

1. Audit the existing remote repository read and candidate-management APIs.
2. Reuse the local canonical object/reference format where possible.
3. Define authenticated staging, verification, admission, and status contracts.
4. Add conflict, interruption, retry, and concurrent-push tests on the server.
5. Implement single-coordinate push with a read-only admission preflight, then
   verify remote pull round-trips the same
   digest.
6. Implement dependency-ordered `push --all`.
7. Enable the command only after end-to-end staging and recovery tests pass.

ZIP archives may exist as transport or download conveniences, but they are not
the source of truth. The canonical content-addressed package and its digest are.
