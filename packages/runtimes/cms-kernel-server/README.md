# @bernouy/cms-kernel-server

Private production composition root for the CMS application.

It reads and validates the listener plus one installations Provider
endpoint/token pair, checks the public Provider report, composes the
provider-neutral Gateway inside the Kernel and mounts the site HTTP surface.
Gateway routes, identities, audits and short-lived invocation tokens cross the
published `ulvia.cms.installations` contract. The runtime owns no database,
files, sessions, installations or migration state.

Run it from the workspace root with:

```sh
bun run packages/runtimes/cms-kernel-server/src/index.ts
```

This package is marked `private` because it is a deployable composition root,
not a reusable library. See the [workspace package map](../../../docs/architecture/packages.md).
Licensed under the repository [MIT License](../../../LICENSE).
