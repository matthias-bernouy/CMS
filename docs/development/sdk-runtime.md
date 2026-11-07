# SDK runtime artifacts

The official Provider executes SDK Emailer/SMTP and Secrets capabilities from
trusted build metadata shipped with their executor code. Installed catalogue data
never grants executable support by itself.

## Build and deployment

`compileOfficialFeatures` compiles the surface's single implementation inventory.
`createImplementationArtifact` emits `ulvia-sdk-runtime/v1`: canonical contract JSON,
exact digests and complete implementation claims. Executable callbacks, service
instances and document/fixture bytes are absent.

The CLI bootstrap generator emits `dist/bootstrap/feature-runtime.json` from the
same compilation that supplies contract releases and manifest claims.
`infra/bootstrap.ts` copies it to the surface's
`src/capabilities/features/generated/runtime.json`. This is generated code-owned
metadata; regenerate it with `bun run generate:official-bootstrap`, never edit it.
The source inventory is `src/capabilities/features/inventory.ts`; the build compiler
entry is `src/capabilities/features/build.ts`.

The Provider image ships that metadata with its source modules. Runtime startup
neither opens authored Markdown/fixture directories nor converts Zod schemas.
Source documents are needed by the build and published separately as verified assets.
A ready instance remains independent from its original installation kit.

## Attachment and selection

`loadImplementations` captures executor factories, lineage and policy before awaits.
It checks the bounded artifact shape, verifies canonical contract bytes/digests,
resolves exact parents and checks source identity, complete capability coverage,
access/behavior/error codes and implementation claims. Schema compatibility is
established by producing metadata and code together during the build; this API is
not a verifier for arbitrary executor code or remotely supplied TypeScript.

Limits are 512 contracts/implementations, 1 MiB per canonical contract and 64 MiB total
UTF-8 metadata. Required fields, format version and coordinates have no implicit
fallbacks. Corrupt, duplicate, oversized or mismatched artifacts fail before service
construction. No document/fixture asset hydration occurs during attachment.

`loadOfficialFeatures` caches one verified attachment per process. Mounting receives
exact approved `{ contractId, version, digest }` pins from the instance profile.
The existing execution support matrix remains required. A source feature missing its
runtime service refuses mounting; disabled features require no service. HTTP routes
and validators come from admitted artifact metadata. Source definitions supply their
captured default executors and private error ownership.

## Domain authorization before replay

A default capability may declare `authorize({ input, services, context, fail })`.
The hook uses the same captured service projection as `execute`, runs after admitted
input validation/host authorization and before any durable receipt access. It is
also used by local `executeCapability`; local callers still own authentication and
host authorization. Alternative implementations own their complete domain policy.

Secrets uses this hook for keyed create/rotate. A fresh credential read checks
namespace write permission before every invocation, so revocation/expiration or a
foreign namespace refuses before a receipt lookup. Domain service methods retain
their own checks for direct callers. A successful new create/rotate performs two
namespace credential reads and one value write; replay performs one credential read
and no value write. A rejected replay performs one credential read and no receipt IO.

The durable receipt path remains one insert/one completion update for a new command,
and a duplicate insert/one indexed lookup for replay. It retains input/principal
hashes and small metadata outcomes, never values or namespace keys. Namespace/key
creation returns credentials and is unkeyed. HTTP authentication, administrator
policy and official error localization remain in the Provider host/surface.

## Evidence

SDK runtime-artifact tests cover missing source assets, absent schema conversion,
corruption, budgets, source mismatch and denied replay. The surface starts a fresh
bundle from generated metadata without source compilation/document directories.
Secrets HTTP tests cover all 13 capabilities, refused mutations, cross-instance and
namespace access, revoked keys, bounded lists and safe error presentation. Runtime
receipt tests use the real Mongo adapter with an atomic collection double to verify
replay after executor recreation and refusal before receipt lookup after revocation.
