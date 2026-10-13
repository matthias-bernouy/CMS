# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, profile transitions
and recovery. The CMS Kernel is a separate stateless process connected through
the versioned private Kernel protocol.

```bash
bun run packages/runtimes/ulvia-provider-server/src/index.ts
```
