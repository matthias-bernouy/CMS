# @bernouy/cms-kernel-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Validate the public report and compatible `ulvia.cms.installations` release
  exposed by the independently running installations Provider.
- Compose the provider-neutral Gateway locally from remote route, identity,
  audit and invocation-token capabilities.
- Resolve Content reads, collection assets, robots and sitemap resources
  through the selected `ulvia.cms.content` capabilities.
- Instantiate only the stateless Kernel HTTP composition.
- Refuse to start unless the Provider instance and official resources were provisioned beforehand.

## Rules

- Keep the Kernel process stateless. It receives only its public URL,
  installations Provider endpoint and opaque control token; persistence,
  authentication state, Gateway state, files and migrations remain behind
  contracts.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Consume the installations control Bearer only at that Provider boundary.
  Never send it to a selected capability Provider: request a scoped,
  short-lived invocation token through `ulvia.cms.installations`.
- Changes here usually need an integration-style test or a clear manual
  verification path.
- Resolve request actors and public capability calls through the local Gateway.
  Do not add private Gateway operations to the Provider instance API.
- Never mount or start the Ulvia Provider surface from this package.

- Require the selected `ulvia.cms.observability` read/ingestion surface at startup. Collect asynchronously with a bounded memory queue; never add a persistent Kernel journal. Machine ingestion authority is distinct from user identity.
