# @bernouy/cms-secrets

Feature package for the `ulvia.cms.secrets` domain. It owns secret metadata,
lifecycle and administrator/runtime resolution while delegating encrypted value
storage to the generic `@bernouy/secret-store` Foundation port.

- Never log, cache or include secret values in errors.
- Administrative reads expose metadata only.
- Persistence adapters are exported through explicit subpaths.
- HTTP and capability authorization belong to the mounting provider surface.
