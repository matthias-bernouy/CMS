# Ulvia Kernel image

This image contains only the stateless CMS Kernel runtime and the browser
assets it serves. Build and publish official tags from the workspace root:

```bash
bun run images:build --version 0.0.1-beta kernel
bun run images:publish --version 0.0.1-beta kernel
```

The image requires one Provider instance URL and opaque access token. It does
not contain the Provider or Repository runtime, mount persistent data, or
receive database credentials.

Image tests live in [`tests/images/kernel`](../../../tests/images/kernel).
Run them from the workspace root with `bun test ./tests/images/kernel`.
