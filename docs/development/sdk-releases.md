# SDK release workflow

The Emailer pilot is implemented in `packages/features/email/base` and `smtp`.
Their documentation is authored as ordinary `docs/**/*.md` files and discovered
during SDK compilation. Reusable Zod data schemas live in `src/schemas/` and the TypeScript
ports infer their types from those schemas. Each operation declares its stable ID,
access, behavior and bindings. The `./feature` export owns contract identity,
version, parent and operation list. `@bernouy/ulvia-provider/build` assembles
implementations and manifest requirements. Nodemailer and durable storage are injected by the runtime.

## Sources and generated artifacts

`infra/releases/ulvia.release.ts` is the explicit trusted local source entry.
It prepares SDK Emailer/SMTP contracts, the remaining authored contracts and
collections, and a manifest with computed exact contract digests. SDK handler
factories are captured during compilation and invoked only during runtime mounting.
Older Emailer JSON and the authored manifest remain parity references; the new
bootstrap and release entry do not use them as generation inputs. Other feature
families continue using their authored JSON until their migration is requested.

```sh
bun run generate:official-bootstrap
bun run release:official
# Explicit publication through the configured, authenticated Repository connection:
bun run ulvia -- push all
```

Bootstrap and local release preparation share `prepareOfficialResources`.
Bootstrap emits admitted documents/assets and the Provider snapshot. It also
regenerates the runtime's current execution support pins from the manifest and
runtime package version. `supported-history.json` retains separately reviewed
older executable releases; merely admitting a contract does not add runtime support.
The resource ZIP and removal of collections are separate work.

## Versions and publication

Versions are explicit source data: each `src/feature.ts` owns its contract version and
the surface’s `src/exports/provider/definition.json` owns the manifest version/provenance. Compilation never invents
versions or publication timestamps. Update the corresponding source version
before releasing changed bytes. The ordinary catalogue checks immutable exact
coordinates, SemVer evolution, capability identities and exact parent pins.
A matching retry reuses the same immutable release.

`ulvia release <directory>` recognizes `ulvia.release.ts`; `--recursive` discovers
such roots alongside JSON resource roots and stops at each owned subtree. A module
default-exports an async function returning admitted `PreparedResource[]`, whose
public type is exported by `@bernouy/ulvia-cli/releases`. This executes trusted
local workspace code, not remotely supplied TypeScript. Remote authoring stays
data-only. Ambiguous JSON/module roots and symbolic module files reject.

Every module artifact is admitted again before local storage. The complete batch
is bounded to 256 resources and 512 MiB of canonical bytes/assets. Contract and
Provider history checks run before the first write. Storage failure can leave a
partial batch; retry identical coordinates. `push all` separately preflights local
artifacts and credentials, then uses the existing Repository publication protocol.
It publishes all non-yanked artifacts in the selected local cache, including any
previously prepared resources. Preparation never publishes remotely.

## SMTP replay and uncertain delivery

`registerProviderHandlers` mounts compiled Emailer handlers in the existing
Provider registry. The authenticated receiver supplies exact invocation identity;
registration checks the mounted site/Provider/instance before executing a handler.
The host still authorizes every invocation, including receipt replays.

The runtime claims a Mongo receipt with majority journaled writes before sending.
Keys bind Provider, instance, site, concrete contract/version and capability.
A fingerprint binds the input and authenticated principal; reusing a key for a
different message or actor refuses without another send. The parent alias and
concrete SMTP route share the same concrete execution receipt.

A completed result or declared failure replays after runtime recreation. A pending
receipt never expires or transfers ownership. A crash after SMTP acceptance but
before completion leaves delivery uncertain and refuses automatic resend. This
avoids silently duplicating mail; it does not promise exactly-once SMTP delivery.
No operator resolution API is implemented yet. Reconciliation requires checking
the external delivery outcome before deliberately initiating a new command.

Receipts retain hashes and small outcomes, never mail bodies or SMTP credentials.
They are not automatically pruned because expiry would permit duplicate sends.
Each instance admits at most 128 pending executions in memory; receipts have a
16 KiB outcome bound. A successful new command uses one insert and one update;
a replay or conflict uses a duplicate insert attempt and one indexed lookup.
There is no receipt scan, process cache or extra authentication/authorization pass.
The synchronous JSON adapter is currently wired only for Emailer send; streamed
commands and general receipt administration remain outside this pilot.

## Feature source layout

Features expose `./schemas`, `./operations` and `./feature`. Keep reusable Zod data
models under `src/schemas/`; infer port types directly from them. Each operation
has its own descriptor under `src/operations/`, grouped by domain such as
`configuration/get.ts`. Read/write/storage projections derive from shared fields;
private storage schemas remain internal. Business normalization belongs in core.
Documentation remains ordinary Markdown under `docs/`. `src/feature.ts` declares
`documents: new URL("../docs/", import.meta.url)`; compilation scans recursively.
IDs are case-preserving relative paths including the extension: `docs/setup/smtp.md`
becomes `setup/smtp.md`. Titles come from exactly one H1 per file. Operations reference
these IDs in `docs: [...]`; internal links resolve relative to the document. Moving a
file changes its ID and requires updating references and links.

The source directory must exist. Discovery rejects symlinks, invalid document paths,
invalid UTF-8, missing headings, broken links and dangling operation references.
Only `.md` files are included; other regular files are ignored. Limits are 64 documents,
128 KiB each, 4 MiB total, 1,024 visited entries and eight nested directory levels.
The SDK root does no filesystem IO; compilation snapshots exact bytes synchronously
before asynchronous hashing. Current Provider registration still compiles the source
once during initialization, so those source documentation directories must be shipped
alongside the feature modules. Mounting admitted artifacts directly remains future work.

Migrated feature definitions have no `contracts/` directory or public `./contracts`
entry. `src/feature.ts` declares identity, version, parent and the operation list.
Operation descriptors own IDs, access, behavior and HTTP/MCP bindings. Optional
deprecation and response effects retain ordinary admission rules. The Provider
selects implementations and enforces mounting/authentication policy.

Named mocks are explicit operation data, optionally imported from `src/mocks/`;
no directory scan or repeated owner ID is needed. Multiple scenarios may share
input. TypeScript inference and build admission validate their payloads and codes;
local mock IDs must be unique. Binary fixtures retain their verified asset references.

These changes preserve existing contract versions, canonical bytes and digests.
Runtime compilation and Provider handler adapters retain their current paths.
Adding domain folders does not change operation identities or release versions.
