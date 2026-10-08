# @bernouy/envelope-crypto

CMS-agnostic envelope encryption with per-scope data-encryption keys, KEK
providers, AES-GCM helpers, and field encryption.

## Public API

- The root entrypoint exposes crypto contracts and default implementations.
- `/mongo` exposes the Mongo DEK repository and composition helper.

Mongo is a composition-root adapter. Plaintext secrets, KEKs, DEKs, blind-index
inputs, and decrypted field values must never be logged.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
