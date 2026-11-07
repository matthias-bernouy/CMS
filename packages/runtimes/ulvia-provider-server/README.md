# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, profile transitions
and recovery. The CMS Edge is a separate stateless process connected only
through the public Provider report and admitted contract capabilities.

For each instance, this runtime selects the account, local-credential,
session-token, administrator-grant, Emailer, content, collection, gateway and
Files adapters injected into `@bernouy/ulvia-provider`. Browser credentials are
resolved through the official `ulvia/cms.access` contract; outbound delivery
uses the `ulvia/cms.emailer.smtp` specialization of `ulvia/cms.emailer`, and no authentication store or session secret is
shared with the Edge.

New `ulvia@1.1.0` (default) and `repository@1.1.0` instances start with system
contracts and an administrator, but no collections or Pages. A Repository API
can therefore start before any public catalogue or browser interface exists.
Authenticate through `ulvia/cms.access` and publish resources through CLI/API;
initialization never publishes the bundled system releases to the catalogue.

Run `bun run generate:official-bootstrap --core-only` from the workspace root
before native startup to stage admitted system contracts, documentation and the
Provider manifest in this package's `dist/bootstrap`. Production images use
this snapshot and omit authored collections and compiled starter assets.
Discovery reads profile references only; provisioning reads the selected profile's
resources and never falls back to the configured public Repository. Set an absolute
`ULVIA_BOOTSTRAP_DIR` to select another pre-built snapshot. Public resource
discovery and explicit imports still use the configured Repository connection.

The full `bun run generate:official-bootstrap` remains available for authoring
and example tests. Exact `1.0.0` starter profiles retain their original meaning
and require those optional resources for new or unfinished provisioning. A
core-only image refuses such provisioning when resources are absent. Existing
ready instances reopen from persisted execution and do not read their old kit.
Profile versions are independent of contract and collection release versions.

```bash
bun --no-macros run packages/runtimes/ulvia-provider-server/src/index.ts
```
