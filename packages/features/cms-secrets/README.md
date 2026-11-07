# @bernouy/cms-secrets

Credential-scoped namespaces, metadata, lifecycle and explicit value resolution.
Encrypted value storage uses the injected Foundation `SecretStore`; metadata uses
`CmsSecretMetadataStore`. Mongo and memory adapters remain explicit subpaths.

## Public API

The package root exports `CmsSecrets`, `CmsSecretNamespaceStore`, domain errors,
structural `SecretsService`/`SecretsServices` ports and metadata types inferred from
Zod schemas. `./feature` exports the complete `secretsFeature`; `./mongo` and
`./memory` expose persistence adapters. Schema/capability construction files remain
internal.

## Authoring

`src/feature.ts` owns identity, version, capabilities and the documentation URL.
Reusable Zod data models live in `src/schemas/`. Capability descriptors are grouped
under `src/capabilities/namespaces/` and `secrets/`; each owns its bindings, errors
and default `execute`. `docs/overview.md` remains ordinary Markdown, scanned only
by the build. Public v1 schemas, bindings, error ordering, document bytes and digests
are unchanged by the SDK migration.

Executors receive a structural `SecretsService` port, not its private backing stores.
The Provider surface selects the complete feature, maps injected ports and localizes
declared failures. Runtimes choose adapters, namespace ownership and durable execution.
Generic secret storage stays in Foundation.

## Authorization and replay

Metadata reads require their namespace permission; value resolution additionally
requires `secrets.resolve`. Foreign, revoked and expired credentials refuse before
plaintext access. Metadata never includes secret values.

The keyed `secrets.create` and `secrets.rotate` capabilities have an `authorize`
hook. It rechecks namespace write permission before durable receipt access, including
replays. The service retains its own authorization for direct callers. A new command
therefore performs two namespace credential reads; replay performs one and no value
write. Receipts contain input/principal hashes and metadata outcomes, never secret
values or namespace keys. Namespace/key creation returns credentials and remains
unkeyed. HTTP authentication and administrator authorization stay host-owned.

Namespace expiration is checked at invocation time; omitted expiration is allowed,
while null/past values fail without mutation. Metadata lists pass their requested
limit through unchanged, return at most 100 items and do not load plaintext. The
current list contract has a limit and no continuation cursor; pagination evolution
requires a separate contract change.
