# @bernouy/envelope-crypto

Envelope encryption foundation package. It must stay CMS-agnostic and free of
surface/runtime imports.

## Boundaries

- Root export `@bernouy/envelope-crypto` exposes crypto contracts, AES-GCM
  helpers, `EnvelopeSecretCrypto`, `LocalKekProvider`, `loadKek`, and
  `FieldCrypto`.
- `@bernouy/envelope-crypto/mongo` exposes `MongoDekRepository` and
  `createFieldCrypto`. Treat this as a composition-root-only adapter subpath.
- Keep `interfaces/` inert. Crypto behavior belongs in `core/` or
  `default-implementation/`.

## Rules

- Do not import CMS packages here.
- Do not log plaintext secrets, KEKs, DEKs, blind-index inputs, or decrypted
  field values.
- Changes to encrypted blob serialization or blind-index behavior require
  compatibility tests.
- Keep Node/Bun-specific APIs out of browser-reachable exports unless the export
  is explicitly server-only.
