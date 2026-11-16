# Ulvia Edge image

This image contains only the stateless CMS Edge runtime and the browser
assets it serves. Build and publish the complete official distribution from the workspace root:

```bash
bun run build --version 1.0.7
bun run publish --version 1.0.7
```

The image requires one Provider instance URL and opaque access token. It does
not contain the Provider or Repository runtime, mount persistent data, or
receive database credentials.

Image tests live in [`tests/images/edge`](../../../tests/images/edge).
Run them from the workspace root with `bun test ./tests/images/edge`.
