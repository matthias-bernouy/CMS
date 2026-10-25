# @bernouy/official-repository-server

Production composition root for the official immutable repository.

## Rules

- Read environment only in this package and fail before listening when storage
  is invalid.
- Production publication uses owner keys only; never enable operator-token
  writes from environment. All namespaces use public first claim; startup must
  never overwrite ownership or recover lost keys.
- Keep `packages/official-repository` declarative. Releases are published through
  the signed protocol; this runtime never scans or auto-publishes source folders.
- The filesystem composition is single-active-replica. It requires one persistent
  local volume with atomic create, rename and hard-link semantics.
- Always compose durable upload staging and replay claims with the immutable
  registry. Never use the process-local replay store in production.
- Do not log private keys, authorization headers, signatures or bodies.
- Preserve bounded request handling, staged asset verification, idempotent commit,
  artifact-last visibility and graceful shutdown.
- TLS is terminated by deployment infrastructure. Health checks remain unauthenticated;
  mutation endpoints remain authenticated and catalogue reads remain public.
