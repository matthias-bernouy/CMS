# @bernouy/secret-store

Foundation package for generic secret storage and secret reference resolution.
It must remain independent of CMS features, surfaces, and runtimes.

## Boundaries

- Root export exposes `SecretStore`, `SecretReader`, in-memory store,
  validation, `${VAR}` reference helpers, and `createSecretResolver`.
- `@bernouy/secret-store/mongo` exposes `EncryptedMongoSecretStore` for
  composition roots.
- Encryption primitives come from `@bernouy/envelope-crypto`; surfaces should
  receive a ready secret store instead of creating one.

## Rules

- Never log secret values or resolved headers.
- Secret keys must pass the shared key validator. Keep error messages specific
  but value-safe.
- `resolveSecretRefs` should preserve non-secret text and fail clearly when a
  referenced key is missing.
- Mongo storage must keep values encrypted at rest.
- Keep HTTP status mapping and product-specific authorization in consuming
  surfaces or features.
