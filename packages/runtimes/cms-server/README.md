# @bernouy/cms-server

Private production composition root for the CMS application.

It reads and validates environment configuration, initializes infrastructure,
selects Mongo, blob, crypto, image, mail, and rate-limit adapters, then mounts
Ulvia Provider and the site Kernel on Bun runners. Features and
surfaces receive their dependencies from this runtime.

Run it from the workspace root with:

```sh
bun run packages/runtimes/cms-server/src/index.ts
```

This package is marked `private` because it is a deployable composition root,
not a reusable library. See the [workspace package map](../../../docs/architecture/packages.md).
Licensed under the repository [MIT License](../../../LICENSE).
