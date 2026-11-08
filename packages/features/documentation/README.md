# @bernouy/documentation

Selection-bound Markdown retrieval and hybrid lexical/semantic search. Runtime
roots inject immutable storage, current selection checks, a multilingual model
and optional derived vector storage. Documentation never grants authority.

- `.` exports `CmsDocumentation`, `DocumentationError` and dependency ports.
- `/mongo` exports rebuildable model/content-keyed vectors with a 30-day TTL.

Search returns exact release references, section excerpts and an explicit
`hybrid` or degraded `lexical` mode. Get reads exact documents without building
an index, using Unicode-safe continuation offsets. Scope, corpus, response size
and concurrent work are bounded; both operations fence selection changes before
returning. No business content, arbitrary URLs or secret values are indexed.


Call `prepare()` from runtime background orchestration before expecting hybrid
retrieval. It prepares one complete selected corpus, initializes the model and
loads persisted vectors, embedding only missing passages. Derived-cache index
setup belongs to preparation, so its failure leaves lexical search and direct
reads available. Concurrent filters
share that corpus. Search never starts passage inference: an unprepared corpus
returns explicit lexical fallback immediately and may send a throttled scheduling
hint through the injected callback. A prepared lookup embeds only its query.

Runtimes import the explicit adapter from `@bernouy/text-embeddings`. It performs tokenization and inference in one
child process shared by the runtime. Its `localFilesOnly` option refuses missing pinned
files without initiating a download, including inside that process.

Call `close()` before closing the instance's stores. It aborts preparation between
batches and waits for outstanding native work; it does not dispose an injected
shared model. The model's runtime owner calls the adapter's `close()` after all
instance services stop. Active persisted vectors approaching expiry are renewed;
preparation revisits a retained corpus's cache at most daily.

See [contract documentation](../../../docs/architecture/contract-documentation.md)
for authoring, HTTP/MCP behavior, operational limits and the model cache.

Evaluate the actual pinned model against the generated official bootstrap:

```sh
bun run packages/features/documentation/tests/evaluation.ts \
  packages/runtimes/ulvia-cli/dist/bootstrap /absolute/path/to/model-cache
```

This explicit command may download the model. It checks seventeen English, French,
Spanish and Chinese questions against expected guides in the first three
results, reports retrieval mode, document reads, inference count and latency,
and fails on a missing guide or degraded retrieval. Cached model files load
from their exact local revision without a network probe. Malformed derived
vectors are discarded and recomputed from admitted documents.

Append `--offline` to deny network fetches and verify operation from an existing
model cache. A cold cache requires the initial model download.
