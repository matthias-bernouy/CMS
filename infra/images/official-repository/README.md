# Official Repository Image

Build from the workspace root:

```bash
bun run images:build --version 0.0.1-beta repository
bun run images:publish --version 0.0.1-beta repository
```

Mount a persistent volume at `/var/lib/ulvia-repository`. No operator token or
private key belongs in the container. All namespaces use public first claim;
claim official names locally before exposing a new Repository. Run one active
replica and terminate HTTPS before the container. `/healthz` is the liveness
endpoint and `/readyz` is the readiness endpoint.

The image contains a pre-admitted snapshot of the official resources authored
in this workspace. It copies that snapshot into an empty persistent repository
on first start. Later image upgrades never overwrite an existing repository;
new immutable releases still use the signed publication protocol.

The image includes the pinned embedding model in `/opt/ulvia/models` and sets
`ULVIA_EMBEDDING_MODEL_DIR` to require local loading. It needs no Internet access
for model loading or inference. See [model packaging](../../models/README.md)
for build caches, native preparation and the offline image test.

Image tests live in [`tests/images/official-repository`](../../../tests/images/official-repository).
Run them from the workspace root with `bun test ./tests/images/official-repository`.
