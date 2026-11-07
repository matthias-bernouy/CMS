# @bernouy/ulvia-sdk

Define typed feature operations, expose contracts, assemble a Provider and compile
its exact manifest from the same handler table. The optional `./provider` adapter
mounts that build through the existing Gateway HTTP receiver.

The Emailer/SMTP pilot uses the SDK in the official Provider and bootstrap. Other
feature families retain their existing adapters. Release orchestration lives in
the CLI and infrastructure; the SDK remains free of filesystem discovery and publication.

## Public API

| Entry | Responsibility |
| --- | --- |
| `.` → `z`, `defineOperation` | Stable operation IDs, access, behavior, HTTP/MCP bindings, typed data/errors and named mocks. |
| `.` → `defineContract` | Contract identity/version, parent, operation list and document/fixture sources. |
| `.` → `contractString`, `contractMap`, `contractBinary` | Zod schemas with exact Ulvia v1 semantics. |
| `.` → `implementContract`, `defineProvider` | Typed handler factories and static manifest metadata. |
| `.` → `operationError`, `isOperationFailure` | Declared, validated business errors without HTTP policy. |
| `.` → `OperationInput`, `OperationOutput`, `OperationHandler` | Infer domain types from operation schemas. |
| `.` → `ContractHandlers`, `ProviderOperationHandler` | Infer inherited handlers, streaming inputs and operation handles. |
| `./build` → `compileSchema`, `compileContract`, `compileContracts` | Produce validated schemas and immutable contract admissions. |
| `./build` → `compileImplementations` | Compile a partial surface with exact claims and a captured handler plan. |
| `./build` → `compileProvider` | Generate exact manifest claims and a captured runtime handler plan. |
| `./provider` → `registerProviderHandlers` | Mount a partial build in an authenticated host registry with explicit scope and durable keyed execution. |
| `./provider` → `createProvider` | Inject dependencies, authentication, authorization and scope; return a Fetch-compatible receiver. |

## One definition, two stages

A feature owns each operation's stable ID, access, behavior, HTTP/MCP bindings,
data schemas and errors in `defineOperation`. Its `feature.ts` uses `defineContract`
to declare identity, version, parent and an explicit `operations` list. The Provider
selects implementations and applies its mounting/authentication policy.
The [notes example](examples/notes.ts) includes typed mocks, verified Markdown and
an injected business handler. [Its Provider](examples/provider.ts) assembles it:

```ts
const implementation = implementContract(notesContract, {
    "notes.read": (dependencies: NotesDependencies) =>
        createReadNoteHandler(dependencies.notes),
});
```

Operation IDs are declared once. Duplicate IDs within a contract or redeclared
inherited IDs refuse compilation. Literal IDs and behavior remain inferred across
package exports, preserving typed inherited handler coverage and execution modes.

`mocks` is an optional array on each operation, not a scanned source directory.
Scenarios may share input and have different named success/error outcomes. The
[imported notes mocks](examples/mocks/notes.ts) need no owning capability ID.
TypeScript checks their inferred shapes; build admission also validates inputs,
success/error payloads, declared error codes, asset references and unique local IDs.

Handler factories are an explicit table, not a function that discovers handlers
by running code. Build checks the full effective key set, including inherited
capabilities, and captures the factories without calling them. Factories should
only capture injected services; adapters belong to the host composition root.

```ts
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";

const build = await compileProvider(definition);
const provider = createProvider(build, dependencies, {
    scope: { siteId, instanceId },
    authenticate, // Verify credentials and signed claims; derive host-owned scope.
    authorize,    // Explicit per-invocation host policy.
});
// build.manifest, build.contracts; pass provider.fetch to a host-owned HTTP server.
```

Only explicitly implemented concrete releases appear in the manifest. Ancestors
and separately declared dependency contracts are compiled for reference checks.
Exact contract versions/digests are calculated, never copied into the source
manifest. Configuration, origins, credential slots, requirements, delegation and
provenance remain explicit declarations validated by `ulvia-providers`.

The runtime validates Provider/site/instance scope before dispatch. The Gateway
receiver handles input/output validation, admitted routing and error envelopes;
the SDK does not parse JSON DTOs a second time. Dependency factories run once per
mounted effective handler. The captured plan cannot be replaced by mutating the
source table after compilation.

## Errors, versions and execution

Use `throw operationError(operation, code, payload)` in a business handler. Code
and payload are inferred from that operation. Runtime checks the error's owner
and admitted payload, then selects the status of the actual HTTP binding. Unknown
errors and invalid results use the existing receiver's generic failure response.

A specialization references its parent SDK definition through `extends`. Build
calculates the exact parent pin, retains separate artifacts and requires the
inherited handlers. Multiple exact versions dispatch by verified contract/version
claims. Ambiguous inherited routes fail at build time rather than choosing a
handler implicitly. Compilation does not check release-version evolution against
previously published history and does not publish or approve an installation.

For `execution: "operation"`, Provider handlers return the standard operation
handle; the declared output schema describes the terminal result. The host owns
the operation lifecycle. Keyed commands require an explicit `executeKeyed` port
before runtime activation. That host port must provide durable receipts, full
scope/principal/input equivalence, replay protection and crash recovery. The SDK
ships no in-memory idempotency implementation for production.

## Schema profile

- Strict objects, nested JSON values, optional properties and nullable schemas.
- Finite numbers, safe integers and inclusive numeric bounds; booleans and null.
- String enums/literals and arrays with explicit maximum counts or exact lengths.
- `contractString({ maxLength, minLength?, enum?, format?, sensitive?, description? })`.
- `contractMap(values, { maxProperties, maxKeyLength, minProperties?, description? })`.
- `contractBinary({ maxBytes, resource?, description? })` for bytes and native resources.
- Description annotations and exact error/mock validation through normal admission.

The protocol remains `ulvia-schema/v1`: strings and map keys count UTF-16 units.
The pinned Zod version counts native string bounds differently and its native
format validators have different acceptance sets. `contractString` therefore
uses the existing Ulvia validator. Native string schemas, defaults, coercions,
arbitrary refinements/transforms, unions, recursive schemas and unrepresentable
constraints fail explicitly with their source path. Zod's documented
[Core visitor API](https://zod.dev/packages/core) is used with an allowlist.

Equivalence applies to interoperable JSON wire values; JavaScript `undefined` is
not a wire value. Optional means omission and nullable means null. Traversal,
node counts, cardinalities and emitted artifact sizes are bounded. Authoring code
is trusted source, not a sandbox for untrusted TypeScript.

## Binary and source assets

A synchronous binary handler returns `Uint8Array` or a `Response`. Byte results
require a single declared response content type; a Response explicitly chooses
its content type/status. The receiver validates those choices. Stream size bounds
are enforced without buffering the whole body; overflow aborts an already-open
response, and cancellation propagates to the source.

A streamed binary input is absent from the JSON handler input and available as
`context.binaryBody`. Its size is bounded while consumed. The input lease ends
when the handler returns: finish consuming/validating it before mutating business
state, and do not return that borrowed stream as a later response body. The host
owns admission/concurrency quotas and adapter lifecycle.

Set `documents: new URL("../docs/", import.meta.url)` in `src/feature.ts` to scan
`docs/**/*.md` during compilation. No Markdown imports, declarations or generated
source manifest are needed. IDs are case-preserving paths relative to that directory:
`docs/overview.md` becomes `overview.md`; `docs/setup/smtp.md` becomes
`setup/smtp.md`. Moving a file changes its ID, so update operation references and
internal links. The title comes from its single H1; references and links are checked.

The explicit directory must exist and contain regular files without symlinks;
non-Markdown files are ignored. Discovery allows at most 1,024 entries and eight
nested directory levels. Contract limits remain 64 documents, 128 KiB per document
and 4 MiB total. UTF-8 bytes, including line endings, are preserved. Discovery is
synchronous and bounded so source bytes are captured before asynchronous admission.
Definitions themselves perform no filesystem IO. Builds from bundled source must
preserve the directory's location relative to `import.meta.url`, or supply in-memory
`documents: { "overview.md": markdown }` sources instead. Admitted releases already
contain verified documentation assets and need no source scan.
Binary mock values use `{ assetId }` references to `fixtures: [{ id, mediaType,
bytes }]`. Sources are snapshotted before asynchronous hashing. Fixture metadata
and separate immutable bytes are verified by ordinary contract admission. SDK
fixture limits are 16 MiB per asset and 64 MiB total per contract.

The root and compiler do not read environment, initialize adapters or listen.
The CLI discovers explicit trusted `ulvia.release.ts` entry modules, checks release
evolution against its local catalogue and reuses ordinary artifact publication.
See [the release workflow](../../../docs/development/sdk-releases.md). The replacement
resource ZIP and migration of other feature families remain separate.

## Validation

```sh
bun test packages/platform/sdk/tests
```

The tests include negative TypeScript fixtures, JSON acceptance comparisons,
exact parent pinning, generated manifests, real loopback HTTP calls signed by
CapabilityGateway, cross-instance refusals, binary cancellation and host-owned
keyed execution. No external database is required for the SDK tests.
