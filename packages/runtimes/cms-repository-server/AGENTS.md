# @bernouy/cms-repository-server

Dedicated integration repository composition root.

## Responsibilities

- Read and validate repository runtime environment.
- Build and retain the last valid filesystem catalog snapshot.
- Mount anonymous repository reads and authenticated management routes on
  distinct listeners.
- Report liveness, readiness, and degraded snapshot state.
- Stop both listeners gracefully on process termination.

## Rules

- This runtime is the only package in the repository service that reads
  `process.env`, filesystem paths, or starts listeners.
- Keep public reads anonymous. Never add a read token.
- Mount every management operation through the injected management guard.
- Do not log the management credential or raw Authorization headers.
- Preserve the last valid snapshot when a later refresh fails.
- Do not introduce MongoDB or S3 dependencies for the filesystem MVP.
