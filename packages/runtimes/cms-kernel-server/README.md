# @bernouy/cms-kernel-server

Private production composition root for the CMS application.

It reads and validates environment configuration, initializes infrastructure,
selects the Kernel's adapters, connects the configured Provider, initializes
official resources and mounts only the site Kernel. Ulvia Provider runs in
`@bernouy/ulvia-provider-server`.

Run it from the workspace root with:

```sh
bun run packages/runtimes/cms-kernel-server/src/index.ts
```

This package is marked `private` because it is a deployable composition root,
not a reusable library. See the [workspace package map](../../../docs/architecture/packages.md).
Licensed under the repository [MIT License](../../../LICENSE).
