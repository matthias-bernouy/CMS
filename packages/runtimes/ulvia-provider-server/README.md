# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, profile transitions
and recovery. The CMS Kernel is a separate stateless process connected only
through the public Provider report and admitted contract capabilities.

For each instance, this runtime selects the account, local-credential,
session-token, administrator-grant, content, collection, gateway and Files
adapters injected into `@bernouy/ulvia-provider`. Browser credentials are
resolved through the official `ulvia.cms.access` contract; no authentication
store or session secret is shared with the Kernel.

```bash
bun run packages/runtimes/ulvia-provider-server/src/index.ts
```
