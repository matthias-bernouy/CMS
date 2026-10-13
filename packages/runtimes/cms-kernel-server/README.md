# @bernouy/cms-kernel-server

Private production composition root for the CMS application.

It reads and validates the listener plus one Provider endpoint/token pair,
performs the versioned Provider handshake, projects the Provider-owned instance
APIs into the Kernel and mounts the site HTTP surface. It owns no database,
files, sessions, installations or migration state. Ulvia Provider runs in
`@bernouy/ulvia-provider-server`.

Run it from the workspace root with:

```sh
bun run packages/runtimes/cms-kernel-server/src/index.ts
```

This package is marked `private` because it is a deployable composition root,
not a reusable library. See the [workspace package map](../../../docs/architecture/packages.md).
Licensed under the repository [MIT License](../../../LICENSE).
