# Ulvia Provider image

This image contains only the official multi-instance Provider runtime. Build
and publish official tags from the workspace root:

```bash
bun run images:build --version 0.0.1-beta provider
bun run images:publish --version 0.0.1-beta provider
```

The Provider owns database access, instance provisioning and file storage. It
does not contain an Edge listener or a separate Repository server.
Explicit Registry instances run through the same Provider and their own Edge.
Exact admitted bootstrap resources are bundled with the image, so provisioning
does not depend on an available remote Repository.

The image includes the pinned embedding model in `/opt/ulvia/models` and sets
`ULVIA_EMBEDDING_MODEL_DIR` to require local loading. It needs no Internet access
for model loading or inference. See [model packaging](../../models/README.md)
for build caches, native preparation and the offline image test.

Image tests live in [`tests/images/provider`](../../../tests/images/provider).
Run them from the workspace root with `bun test ./tests/images/provider`.
