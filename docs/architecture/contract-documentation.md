# Contract documentation

Contract documentation is immutable release data. `repository` admits and
transfers it; `documentation` retrieves and ranks it; the Provider runtime
injects instance selection, Mongo storage and a local multilingual embedding
model. Generic ranking and vector preparation live in `@bernouy/text-search`;
runtimes explicitly import the subprocess backend from `@bernouy/text-embeddings`.
Selected documentation scope remains in this feature.
The explicitly enabled Registry uses the same runtime adapter for its separate
public resource index. Edge does not choose a model.

## Authoring and publication

Place optional UTF-8 Markdown under a contract's `docs/` directory. Its relative
POSIX path is its identity, for example `pages/create-and-publish.md`. Each
document requires exactly one top-level Markdown H1, including Setext syntax.
The compiler derives its display title from that heading. There is no authored
ID, frontmatter, title field, summary or special workflow directory.

A capability may declare `"docs": ["pages/create-and-publish.md"]`. References
must exist in that declaring release. Documents without a capability link are
also searchable. Inverse capability links are derived, never authored twice.
An inherited capability and its documents retain the exact declaring parent
release; a child cannot reinterpret those references.

The CLI compiler generates `documentation` metadata with path, title, byte
length and SHA-256 digest. The contract digest includes this manifest and its
capability links. Text is a separate asset identified by `docs/<path>` in the
account-authorized publication protocol. Full bundle admission verifies UTF-8,
Markdown, exact byte sets, sizes, hashes and internal document links before publication.
Internal links stay inside `docs/` and must target included Markdown documents.
V1 does not package local images or validate heading fragments. External links
are source text and are never fetched by search or admission.

Limits per release are 64 documents, 128 KiB per document, 4 MiB total and 16
links per capability. Paths are ASCII, case-sensitive, relative `.md` paths
without traversal or encoded separators. The source reader rejects symlinks
and bounds directory depth and entries. Authored manifests are rejected:
`documentation` belongs to compiled releases.

Public immutable reads use
`GET /.cms/call/ulvia/repository/v1/assets/contract/{publisherId}/{contractId}/{version}/{assetId}`.
Encode `docs/<relative-document-path>` as the single `assetId` URL component.
HEAD returns metadata without text. Pull, Provider imports and the local bootstrap transport
and verify these assets. Mongo stores text separately in
`cms_contract_documentation`, keyed by content digest; normal contract and route
reads hydrate only metadata. Publication requires actual verified bytes even
though metadata-only admission is available for discovery and stored records.

## Agent discovery and use

The CMS Edge supplies English `instructions` in the authenticated MCP
`initialize` response. They explain when to search and how to read guides.
When the selected `ulvia/cms.installations` release contains
`working-with-ulvia.md` and an MCP binding for `documentation.get`, the response
includes the actual reading tool name and arguments with that release's digest.
Initialization resolves only contract metadata; it does not read or index the
guide. Missing guides omit the direct reference. Clients decide how to present
server instructions to their agent; tool-linked references remain available.
The generic Gateway transport accepts host instructions without Ulvia-specific
content. Simple operations with clear schemas do not require repeated searches.

`ulvia/cms.installations` exposes administrator capabilities
`documentation.search` and `documentation.get`, with HTTP QUERY bindings at
`/documentation/search` and `/documentation/get`. Their authored MCP names are
`installations_documentation_search` and `installations_documentation_get`; the
Gateway emits a truncated name prefix plus an identity hash. Always use the
actual name returned by `tools/list` or initialization instructions.
They use the same live invocation authorization as other selected capabilities.

Search accepts `query`, optional `contractId`, `capabilityId` and `limit` (1–10,
default 5). The instance owns the scope: all currently selected exact contracts
and their pinned ancestors. A client cannot select another instance, site or
arbitrary historical release. Results include title, section heading, bounded
excerpt, inverse capability links, version and an exact reference:

```json
{
  "contractId": "ulvia/cms.content",
  "releaseDigest": "sha256:<64 lowercase hex digits>",
  "path": "pages/create-and-publish.md"
}
```

Get accepts `reference` and optional `offset`. It returns raw Markdown in
Unicode-safe slices of at most 16,384 UTF-16 code units, with `nextOffset` or
null. Follow offsets until null. A deselected release returns
`REVISION_CONFLICT`; search again. Both operations recheck the selection
revision before returning. Instance-bound stores never reuse another
instance's corpus or query results.

MCP tools remain discoverable through `tools/list`. Their descriptions include
up to three linked document titles and paths; `_meta["io.ulvia/docs"]` carries
all exact references and titles. Discovery reads metadata only, without loading
document bodies or invoking a model. The existing site-files and
collection-authoring resource URIs resolve selected release documents through
`documentation.get`; inventory resources retain their existing behavior.

An agent should search before unfamiliar or complex work, read the relevant
documents, clarify material ambiguity, discover current tool schemas, execute
the requested actions and read back results. The Content guides include
revision conflicts, structural checks and publication steps. Visual checks
require an actual rendering/browser tool and cannot be claimed from successful
schema validation. Documentation describes procedures; it does not create a
workflow engine, grant permissions or enforce an agent's review behavior.
Provider-specific validation rules remain Provider behavior. Branch on error
codes and use localized `error.output.message` to explain refusals.

## Search and operational bounds

V1 combines lexical BM25 ranking with normalized embedding similarity using
reciprocal rank fusion. Filters apply before ranking. At most one section is
returned per document. Text, headings, paths and linked capability names provide
context; H1s are display titles, not a replacement for useful explanatory text.

The reference runtime uses local CPU `Xenova/multilingual-e5-small`, q8, pinned
to revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, with E5 query/passage
prefixes. `@bernouy/text-embeddings` is an explicit runtime
adapter. No hosted inference account is required. The runtime initializes the
shared model in a background job after mounting HTTP. A dedicated child process
owns tokenization and ONNX inference, keeping that work off the HTTP event loop.
Its native environment contains `ORT_DISABLE_TELEMETRY=1` before ONNX loads and
does not inherit Provider credentials. Thread-local JavaScript environment
changes do not reliably reach the native library's `getenv`.
The adapter bounds outstanding calls and is disposed by the runtime. Images ship
the verified model in `/opt/ulvia/models` and configure `ULVIA_EMBEDDING_MODEL_DIR`
for strictly local loading, outside data volumes. Native development without that
variable retains `<CMS_FILES_DIR>/.documentation-models` and downloads on an empty
cache. An explicitly configured model directory always requires local files.
See [model packaging](../../infra/models/README.md) for preparation, build caches
and offline tests. Hybrid retrieval still requires model loading and corpus embedding.

The Provider image uses a pinned Bun Debian base and `libgomp1`
for ONNX's native CPU bindings. Edge retains its Alpine image. Docker
image execution must be checked separately from a successful macOS model run.

Search returns `mode: "hybrid"` only when both rankings succeed; otherwise
`mode: "lexical", degraded: true` explicitly identifies fallback. An unprepared
corpus returns lexical results without waiting for inference. Once prepared,
the query-embedding wait is bounded to ten seconds. Native inference can outlive
that wait, so its
slot remains occupied until completion: four inferences maximum across the
shared model, four query embeddings per instance and one corpus rebuild per
instance. The runtime runs one preparation job at a time, with at most 32 pending
instance jobs and coalesced updates. Its ONNX session uses two intra-operation
threads and one inter-operation thread. The service admits at most sixteen
searches and sixteen reads per instance. It never queues unlimited inference work.

One instance corpus is bounded to 128 releases, 512 documents, 8 MiB and 4,096
chunks. Chunks are at most 1,800 UTF-16 code units, preferring paragraph breaks.
Embeddings use batches of sixteen. Mongo `cms_documentation_vectors` stores
rebuildable vectors with 30-day TTL, bounded batch reads and model/content cache
keys. Missing vectors rebuild from admitted documents. A model change uses new
keys. Search retains one complete corpus and vector index per instance; filters
select rows before ranking and never rebuild the index. Background preparation
runs after instance composition and committed contract selection changes, and
at startup for ready instances. Queued records acquire an instance lease only
when their job starts. The runtime rereads the instance record before opening a
queued instance; unavailable or transitioning instances are skipped. Retained
compositions request maintenance every six hours;
the index revisits persisted vectors at most daily, renewing valid active rows
when less than seven days remain. Unused vectors still expire.

Search never indexes business Pages, secrets, private collection sources or
arbitrary URLs. Background preparation reads only admitted documentation for
the instance's selected exact releases. A failed job does not fail an installation
or general Provider readiness. Derived-cache index initialization also runs in
preparation rather than composition. Lookups can request a throttled preparation retry;
selection revision checks still fence returned results. Shutdown cancels queued
jobs, drains the active native batch and queries, closes instance services and
stores, then disposes the shared model and waits for its process to exit naturally.
Already admitted calls drain before close; new calls are refused. Parent IPC
disconnection also disposes the model. Unexpected child exits reject pending work
and remain visible as shutdown failures. Native calls are not instantly abortable.
Vector quality depends on the model and authored prose; this version does not
implement cross-encoder reranking or a separate vector database.
