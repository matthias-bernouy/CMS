# @bernouy/ulvia-sdk

Define typed feature capabilities, expose contracts, assemble a Provider and compile
its exact manifest from the selected implementations. The optional `./provider` adapter
mounts that build through the existing Gateway HTTP receiver.

The official Provider and bootstrap use the SDK inventory for Emailer/SMTP,
Access, Content, Authoring, Secrets, Files, Observability, Registry, Installations
and Provider connections. Provider instance discovery remains a declarative template. Release orchestration lives in
the CLI and infrastructure. Root authoring performs no IO; `./build` discovers
Markdown only below explicitly declared directories and never publishes releases.

## Public API

| Entry | Responsibility |
| --- | --- |
| `.` → `z`, `defineCapability` | Stable capability IDs, access, behavior, HTTP/MCP bindings, typed data/errors and named mocks. |
| `.` → `defineFeature` | Contract identity/version, parent, capability list, document/fixture sources and optional domain error policy. |
| `.` → `contractString`, `contractMap`, `contractBinary` | Zod schemas with exact Ulvia v1 semantics. |
| `.` → `capabilitiesFor`, `implementFeature` | Type capability services once; select complete default execution. |
| `.` → `implementContract`, `defineProvider` | Alternative complete implementations and static manifest metadata. |
| `.` → `capabilityResponse` | Typed public JSON output with an admitted semantic response effect. |
| `.` → `capabilityError`, `isCapabilityFailure` | Declared, validated business errors without HTTP policy. |
| `.` → `CapabilityInput`, `CapabilityOutput`, `CapabilityHandler` | Infer domain types from capability schemas. |
| `.` → `ContractHandlers`, `ProviderCapabilityHandler` | Infer inherited handlers, streaming inputs and operation handles. |
| `./build` → `compileSchema`, `compileContract`, `compileContracts` | Produce validated schemas and immutable contract admissions. |
| `./build` → `compileImplementations` | Compile a partial surface with exact claims and a captured handler plan. |
| `./build` → `createImplementationArtifact` | Emit bounded, serializable runtime metadata without executors or asset bytes. |
| `./provider` → `loadImplementations` | Verify trusted runtime metadata and attach matching code without source compilation. |
| `./build` → `compileProvider` | Generate exact manifest claims and a captured runtime handler plan. |
| `./provider` → `registerProviderHandlers` | Mount a partial build in an authenticated host registry with explicit scope and durable keyed execution. |
| `./provider` → `createProvider` | Inject dependencies, authentication, authorization and scope; return a Fetch-compatible receiver. |

## One definition, two stages

A feature owns each capability's stable ID, access, behavior, HTTP/MCP bindings,
data schemas and errors in `defineCapability`. Its `feature.ts` uses `defineFeature`
to declare identity, version, parent and an explicit `capabilities` list. The Provider
selects implementations and applies its mounting/authentication policy.
The [notes example](examples/notes.ts) includes typed mocks, verified Markdown and
an injected business handler. [Its Provider](examples/provider.ts) assembles it:

```ts
const implementation = implementContract(notesFeature, {
    "notes.read": (dependencies: NotesDependencies) =>
        createReadNoteHandler(dependencies.notes),
});
```

Capability IDs are declared once. Duplicate IDs within a contract or redeclared
inherited IDs refuse compilation. Literal IDs and behavior remain inferred across
package exports, preserving typed inherited handler coverage and execution modes.

`mocks` is an optional array on each capability, not a scanned source directory.
Scenarios may share input and have different named success/error outcomes. The
[imported notes mocks](examples/mocks/notes.ts) need no owning capability ID.
TypeScript checks their inferred shapes; build admission also validates inputs,
success/error payloads, declared error codes, asset references and unique local IDs.

A feature is the only authored definition. `defineFeature({ contractId, version,
extends, capabilities, documents })` combines its API, docs/mocks and optional
executors. Build projects this source into an immutable contract; it never serializes
or calls executors. There is no separate createFeature/defineContract API.

Feature authors type capability ports once in a shared authoring module:

```ts
export const defineCapability = capabilitiesFor<EmailerServices>();
```

`capabilitiesFor` returns a function, not another feature or a factory of feature
constructors. The feature itself is declared once with `defineFeature` imported
from the SDK. Service requirements compose from its capabilities and its parent.

A capability may then provide `execute({ input, services, context, fail })`.
Schemas infer input/result types and declared failure arguments; `services` is
feature-local. `throw fail(code, payload, { cause })` binds a failure to its owner
without referencing the capability during its initialization. An extracted function
can receive the inferred schema data and service ports instead of requiring a
handler factory or registry entry.

`implementFeature(feature, { requires })` captures the defaults and requires every
own/inherited capability to have an executor. Declarative capabilities can omit
`execute` and still compile. Features infer combined own and inherited service
requirements; incompatible shared ports reject, and inherited capabilities reuse their original executor. Published
contracts contain no executable code or service values.

Providers with different feature ports may pass
`implementFeature(feature, { services: host => ({ emailer: host.emailer }) })`.
This typed projection selects existing runtime-owned ports once per mounted
capability; it performs no authoring/build IO and never runs during compilation.
Executors run only on invocation. Adapters belong to runtime composition roots.

The explicit `implementContract` factory table remains available for a complete
alternative implementation. Build checks its own and inherited handler coverage;
it never invokes factories, projections or capability executors.

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
the SDK does not parse JSON DTOs a second time in the executor bridge. Dependency
factories or feature service projections run once per mounted effective capability. The captured plan cannot be replaced by mutating the
source table after compilation.

For direct local synchronous JSON calls, import from `@bernouy/ulvia-sdk/local`.
`executeCapability(feature, capabilityId,
{ input, services, context })` from `./local` resolves the declaring feature and
uses its error policy. The standalone `executeCapability(capability, { input,
services, context })` form executes a capability independently, without feature policy.
Both forms validate input and output with the capability's Zod schemas. The caller owns authorization; this does not activate a
Provider or durable command receipts. Invalid input refuses before business calls.
Binary streams, declared response effects and asynchronous operation handles use the Provider adapter, and
are rejected by the local JSON helper before execution. The raw `execute` callback
is a validated-boundary body; use the helper for unvalidated local data.

## Semantic responses

`capabilityResponse(output, effect?)` preserves the public output type when an
executor returns a semantic response envelope. The existing Gateway receiver
validates the body and effect against the admitted capability. Session effects
remain restricted by the contract language to `ulvia/cms.access`; the helper does
not grant new authority. Tokens travel in the trusted effect envelope, outside
public JSON. The Provider never sets a browser cookie; the Edge applies validated
session effects.

The local JSON helper refuses capabilities declaring response effects before
calling executors or guards, so a rejected local login cannot mint credentials.
An effect-free response wrapper is unwrapped and its body is validated normally.
An undeclared effect is refused by the admitted Provider path.

## Errors, versions and execution


A feature may declare `mapError(cause, capability)`, returning `{ code, output? }`
or `undefined` to leave an exception unmapped. This synchronous domain classifier
replaces per-executor try/catch wrappers. The SDK verifies the mapped code and
payload against the executing capability and retains the original cause privately.
The mapping cannot choose HTTP status, headers or localization. Those remain host
presentation policy. Payload-free errors return only `{ code }`.

Default execution and its optional `authorize` hook share this error boundary.
Inherited capabilities retain their declaring feature's policy; the child does not
replace it. Explicit `fail(...)` errors keep their exact owner and skip classification.
Complete alternative implementations keep their own error handling.
The mapper is captured with the executor before awaits and never runs during
compilation or mounting. It is absent from published contracts and runtime metadata.
Local input/output validation errors remain validation errors and are not remapped.


Inside a default executor use `throw fail(code, payload)`. Explicit alternative
handlers can use `throw capabilityError(capability, code, payload)`. Code
and payload are inferred from that capability. Runtime checks the error's owner
and admitted payload, then selects the status of the actual HTTP binding. Unknown
errors and invalid results use the existing receiver's generic failure response.
An optional final `{ cause }` argument retains private diagnostics using standard
Error semantics; causes are never copied into wire payloads.

Hosts may supply `formatCapabilityFailure(failure, context)` when registering handlers
or creating a Provider. Context contains the selected contract ID, HTTP status and
trusted invocation context. Return `{ output, responseHeaders?, reason? }` for
localization or other presentation policy. Both the original and formatted payload
must satisfy the admitted concrete error schema. The hook cannot select code or
status, and runs before the durable executor captures a declared failure. Successful
calls do not invoke it. Hosts remain responsible for safe copy and replay presentation.

A specialization references its parent SDK definition through `extends`. Build
calculates the exact parent pin, retains separate artifacts and requires the
inherited handlers. Multiple exact versions dispatch by verified contract/version
claims. Ambiguous inherited routes fail at build time rather than choosing a
handler implicitly. Compilation does not check release-version evolution against
previously published history and does not publish or approve an installation.

For `execution: "operation"`, a default capability's `execute` returns the terminal
DTO described by its output schema. The Provider adapter returns the standard
operation handle. Hosts must supply `operations: ProviderOperationAdapter` before
activation; the SDK ships no queue, storage or in-memory durability fallback.

The host port registers captured workers and enqueues invocations. It owns durable
receipts, scheduling, leases, resource retention and restart recovery. Workers are
grouped by requested contract/capability with exact versions and digests, including
admitted parent aliases. The default bridge accepts JSON inputs and terminal DTOs;
stream-backed operations use a complete alternative implementation.

The authenticated receiver records the selected binding ID in trusted invocation
metadata. A recovered worker requires that evidence and matching Provider/site/
instance/version scope; it never invents a Request or chooses an arbitrary binding.
It validates persisted input and terminal output through the admitted schemas and
checks the host cancellation signal before and after guarded business execution.
Feature error classification and host presentation run before failure persistence.

`authorize` runs before every queue/receipt access, including replays, and again
before recovered business execution. Default operations use the operation port's
receipts once; they are not wrapped in synchronous `executeKeyed` receipts.
Synchronous keyed commands still require `executeKeyed`, with durable receipts,
full scope/principal/input equivalence, replay protection and crash recovery.
Complete alternative operation handlers retain their handle-returning API and own
their lifecycle and authorization policy. Keyed alternatives continue to require
the explicit `executeKeyed` port.

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

Native HTTP resources use `contractBinary({ maxBytes, resource: true })` and may
return `resourceResponse(response, { vary, cacheTags })` from the SDK root. The
receiver preserves admitted representation metadata and strips cookies/security
headers. Metadata wrappers are refused for ordinary binary capabilities. Native
resource body limits apply to error representations as well as successful ones;
redirect/revalidation bodies are discarded by the receiver. Request aborts cancel
the source even while it is backpressured or waiting for a chunk. Local JSON
execution refuses every binary mode before invoking services.

A streamed binary input is absent from the JSON handler input and available as
`context.binaryBody`. Its size is bounded while consumed. The input lease ends
when the handler returns: finish consuming/validating it before mutating business
state, and do not return that borrowed stream as a later response body. The host
owns admission/concurrency quotas and adapter lifecycle.

Set `documents: new URL("../docs/", import.meta.url)` in `src/feature.ts` to scan
`docs/**/*.md` during compilation. No Markdown imports, declarations or generated
source manifest are needed. IDs are case-preserving paths relative to that directory:
`docs/overview.md` becomes `overview.md`; `docs/setup/smtp.md` becomes
`setup/smtp.md`. Moving a file changes its ID, so update capability references and
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
See [the release workflow](../../../docs/development/sdk-releases.md). Generic ZIP
utilities do not define a CMS initialization format. All twelve official definitions are generated
from the shared feature/template inventory.

## Validation

```sh
bun test packages/platform/sdk/tests
```

The tests include negative TypeScript fixtures, JSON acceptance comparisons,
exact parent pinning, generated manifests, real loopback HTTP calls signed by
CapabilityGateway, cross-instance refusals, binary cancellation and host-owned
keyed execution. No external database is required for the SDK tests.

The authoring vocabulary uses `defineCapability`, `CapabilityDefinition` and
`capabilities/`. Protocol `execution: "operation"`, `operationId` and operation
handles still describe long-running executions and retain their published names.

## Mounting approved implementations

`registerProviderHandlers(build, registry, services, options)` mounts all compiled
implementations by default. A host mounting an installed profile passes
`options.implementations: [{ contractId, version, digest }]`. The SDK checks every
exact pin and rejects unknown or duplicate claims before constructing handlers or
registering capabilities. An empty list mounts nothing. Only selected implementations
project services or require durable keyed execution. Inherited calls retain the same
concrete handler and receipt identity. This selection runs during mounting, with no
additional per-request lookup or IO.

`createProvider` assembles a complete standalone Provider and always mounts all its
manifest implementations. Its runtime options do not accept a partial selection.

## Build output and runtime attachment

Build with `compileImplementations`, then emit `createImplementationArtifact(build)`.
Ship that `ulvia-sdk-runtime/v1` object with the same executor code. A runtime calls
`loadImplementations(implementations, artifact)` and passes the loaded plan to
`registerProviderHandlers`. Loading verifies canonical contract bytes/digests, exact
lineage, capability coverage, access/behavior/error codes and implementation claims.
It captures factories before awaits and constructs no services until mounting.

The artifact contains canonical contract metadata and exact implementation claims;
documentation/fixture bytes remain separately published assets. Loading neither scans
Markdown nor converts Zod schemas. Metadata limits are 512 contracts/implementations,
1 MiB per contract and 64 MiB total UTF-8 contract bytes. Artifact fields are mandatory;
unknown formats, duplicate coordinates and stale claims refuse. An installed catalogue
cannot grant executable support: the runtime artifact must be trusted build output.

`defineCapability` also accepts `authorize({ input, services, context, fail })` alongside
`execute`. Default implementations invoke that guard before every call and before
any durable receipt access. Both callbacks share their mounted service projection.
A denied guard maps its declared failure normally and cannot read a cached outcome.
The hook is not published contract data. Hosts still authenticate and authorize every
HTTP request; alternative implementations own their full domain authorization.

Use readonly Zod wrappers for readonly port results; they preserve emitted schemas.
`contractString({ enum: ["read", "write"], maxLength: 32 })` retains both the literal
union and the explicit v1 length bound.

Retaining an older admitted contract is explicit: `./provider` exports
`loadCompatibleImplementation` to compare its execution signatures with
one code-owned implementation, and `selectImplementationBuilds` to select exact
pins across verified builds. Executors may widen input string/binary ceilings;
retained receivers still apply their original bounds. Output schemas and other
execution fields remain exact. Hosts must supply their own bounded retention policy;
unknown or conflicting pins refuse before handler registration. See the
[runtime attachment guide](../../../docs/development/sdk-runtime.md).
