# Ulvia Edge image

This image contains only the stateless CMS Edge runtime and the browser
assets it serves. Build and publish official tags from the workspace root:

```bash
bun run images:build --version 0.0.1-beta edge
bun run images:publish --version 0.0.1-beta edge
```

The image requires one Provider instance URL and opaque access token. It does
not contain the Provider or Repository runtime, mount persistent data, or
receive database credentials.

Image tests live in [`tests/images/edge`](../../../tests/images/edge).
Run them from the workspace root with `bun test ./tests/images/edge`.
