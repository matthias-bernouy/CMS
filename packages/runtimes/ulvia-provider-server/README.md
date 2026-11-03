# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, profile transitions
and recovery. The CMS Edge is a separate stateless process connected only
through the public Provider report and admitted contract capabilities.

For each instance, this runtime selects the account, local-credential,
session-token, administrator-grant, Emailer, content, collection, gateway and
Files adapters injected into `@bernouy/ulvia-provider`. Browser credentials are
resolved through the official `ulvia.cms.access` contract; outbound delivery
uses the `ulvia.cms.emailer.smtp` specialization of `ulvia.cms.emailer`, and no authentication store or session secret is
shared with the Edge.

Run `bun run generate:official-bootstrap` from the workspace root before native
startup. It compiles the existing official sources once and stages their admitted
filesystem snapshot in this package's `dist/bootstrap`. Profile loading and
provisioning use that local read-only source, including documentation and assets;
they never fall back to the configured public Repository. Set an absolute
`ULVIA_BOOTSTRAP_DIR` to select another pre-built snapshot. Public resource
discovery and explicit imports still use the configured Repository connection.

```bash
bun --no-macros run packages/runtimes/ulvia-provider-server/src/index.ts
```
