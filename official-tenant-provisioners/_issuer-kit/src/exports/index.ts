// Public barrel of `@bernouy/issuer-kit` (the sign side). Surface filled in
// 04→08. The kit consumes ONLY `@bernouy/tenant-provisioner-contract` for the
// wire contract — never `@bernouy/tenant-provisioner-sdk` (verify side).
export { IssuerError, KeyStoreError } from "src/core/errors";

// Contracts (sign side)
export type { KeyStore } from "src/interfaces/KeyStore";
export type { IssuerConfig } from "src/interfaces/IssuerConfig";
export type { SigningKey, PublishedKey } from "src/types/SigningKey";
export type { MintInput } from "src/types/MintInput";

// Key stores: FileKeyStore (encrypted, persistent default) / Memory (tests)
export { MemoryKeyStore } from "src/default-implementation/MemoryKeyStore";
export { FileKeyStore }   from "src/default-implementation/FileKeyStore";

// RFC 8414 publication primitives. `mountIssuer` is the canonical wiring;
// `buildMetadoc` / `buildJwks` are exposed for consumers embedding the
// issuer in an HTTP stack that isn't a `@bernouy/core` `Runner` (e.g.
// directly on `Bun.serve`, Express, Hono — proven by the conformance test).
export { buildMetadoc } from "src/core/publish/metadoc";
export { buildJwks }    from "src/core/publish/jwks";

// HTTP mount + the two ready-to-use profiles (proxy / hub).
// `parseIssuerConfig` / `createMinter` / `Minter` stay internal — bring them
// up to the public surface only when a real consumer needs a custom profile.
export { mountIssuer } from "src/exports/mountIssuer";
export { createTenantIssuer, createControlPlaneIssuer } from "src/exports/issuers";
export type { IssuerOptions, TenantIssuer, ControlPlaneIssuer } from "src/exports/issuers";
