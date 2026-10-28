# Ulvia Provider image

This image contains only the official multi-instance Provider runtime. Build
and publish official tags from the workspace root:

```bash
bun run images:build --version 0.0.1-beta provider
bun run images:publish --version 0.0.1-beta provider
```

The Provider owns database access, instance provisioning and file storage. It
does not contain the Edge or Official Repository entrypoints.

Image tests live in [`tests/images/provider`](../../../tests/images/provider).
Run them from the workspace root with `bun test ./tests/images/provider`.
