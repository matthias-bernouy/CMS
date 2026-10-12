# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener and receives validated per-instance
infrastructure configuration. The CMS Kernel is a separate process.

```bash
bun run packages/runtimes/ulvia-provider-server/src/index.ts
```
