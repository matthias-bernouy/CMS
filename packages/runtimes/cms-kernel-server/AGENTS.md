# @bernouy/cms-kernel-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Validate the versioned handshake with an independently running Provider.
- Project the Provider's instance-scoped read and HTTP APIs into the Kernel.
- Instantiate only the stateless Kernel HTTP composition.
- Refuse to start unless the Provider instance and official resources were provisioned beforehand.

## Rules

- Keep the Kernel process stateless. It receives only its public URL, Provider
  endpoint and opaque instance access token; persistence, authentication,
  gateway state, files and migrations remain Provider-owned.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Consume the instance access Bearer at the Provider boundary. Never expose it
  to capability actor authentication or confuse it with Provider invocation
  credentials.
- Changes here usually need an integration-style test or a clear manual
  verification path.
- Inject only remote read/proxy boundaries into Kernel. Authoring,
  installations, sitemap state and authentication mutations stay behind the
  Provider instance API.
- Never mount or start the Ulvia Provider surface from this package.
