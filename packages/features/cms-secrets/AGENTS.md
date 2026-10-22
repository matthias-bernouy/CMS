# @bernouy/cms-secrets

Feature package for the `ulvia.cms.secrets` domain. It owns credential-scoped
namespaces, secret metadata, lifecycle and explicit value resolution while
delegating encrypted value storage to the generic `@bernouy/secret-store`
Foundation port.

- Never log, cache or include secret values in errors.
- Metadata reads never expose values; resolution requires a namespace key with
  the dedicated `secrets.resolve` permission.
- Contract implementations consume isolated namespace adapters; they never
  receive the encrypted backing `SecretStore` used by the Secrets implementation.
- Persistence adapters are exported through explicit subpaths.
- HTTP and capability authorization belong to the mounting provider surface.
