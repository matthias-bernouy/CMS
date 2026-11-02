# Native documentation and authoring journeys

These opt-in tests use real isolated MongoDB, Repository, Provider and Edge
processes, browser OAuth consent, authenticated MCP calls and Chromium rendering.
They never publish to the public Repository. See [instance integration](../README.md)
for prerequisites and environment variables.

```sh
ULVIA_RUN_DOCUMENTATION_NATIVE=1 \
ULVIA_DOCUMENTATION_CHROMIUM="/absolute/path/to/chromium" \
ULVIA_DOCUMENTATION_MODEL_CACHE="/absolute/path/to/populated/model-cache" \
bun test ./tests/integration/instance/documentation
```

`native.test.ts` covers linked documentation, Page drafting and verification,
publication at mobile/desktop widths, file transfer, persistence and revocation.
`exotic.test.ts` runs the following more demanding scenarios:

| Scenario | Evidence checked |
| --- | --- |
| Collection authoring across a restart | Invalid source diagnostics; exact private file generation copied into immutable assets; retained preparation; repeated publication; retained sources rebuild to the same digest; installation and rendered asset bytes; restart persistence. |
| Collection upgrade | Reviewed plan invalidated by a concurrent Page edit; failed asynchronous operation with a message; unchanged installation; fresh plan; successful operation; replayed idempotency key; preserved Page content and updated rendering. |
| Concurrent authors | Exactly one update wins from the same revision; the loser receives a conflict; invalid HTML and duplicate paths are refused; stale publication remains private; corrected publication and withdrawal are visible in the browser. |
| Separate instances | Foreign Page IDs, OAuth tokens, upload capabilities and file-signing requests are refused; matching Page paths remain independent; refused transfers leave the receiving workspace unchanged. |
| Documentation discovery | French, Spanish and Chinese queries with the real embedding model; contract filters; direct links; EOF offsets; malformed paths; missing documents; all four MCP resources. |
| Multiple authorizations | Revoking one exact OAuth connection rejects its token while another connection continues to search documentation. |

The tests print observed stage and catalogue durations without machine-specific
latency assertions. Temporary processes, files, credentials and browser profiles
are cleaned up on success and failure.

`validation.test.ts` exercises authoring diagnostics through the real OAuth/MCP
boundary: expanded-example refusals, duplicate structures with no design warnings,
publication and installation, persistent editor warnings, effective template
links, progressive publication, refusal without mutation, scoped template IDs
and ARIA references, incoming-link protection, and a valid release whose upgrade
is blocked by incompatible expanded Page HTML. It also checks retained Page state
after restarting the Provider.

## Interpretation and limits

These are scripted protocol journeys. Reading a guide and executing assertions
does not establish that an autonomous language-model agent will spontaneously
follow the guide, ask the right questions, perform visual review or choose a good
design. Collection sources originate from an explicit test fixture: this is not
a demonstration that the current documentation alone teaches the entire source
format to a new agent.

The private Repository mounts the real filesystem publication, namespace and
signed source operations. Its source transport validates the admitted schema
and invokes the feature service. Production Linux process ownership, its full
Gateway composition, Docker images, hard crashes during a database transaction
and arbitrary third-party Provider contracts require separate validation.
Restarts here use graceful process termination.

For an actual agent using discovered guides, use the [application evaluation
harness](evaluation/README.md). Its [first trial](evaluation/RESULTS.md) records
a blocked baseline, three post-edit missions, independent state checks and
retrieval misses. Those observations are separate from these scripted journeys.

## Cold-start diagnostics

Run the separate authorization/search matrix without background validation:

```sh
ULVIA_RUN_DOCUMENTATION_COLD=1 \
ULVIA_DOCUMENTATION_CHROMIUM="/absolute/path/to/chromium" \
ULVIA_DOCUMENTATION_MODEL_CACHE="/absolute/path/to/populated/model-cache" \
bun test ./tests/integration/instance/documentation/cold/cold.test.ts
```

The matrix uses populated model files, so it does not measure initial downloads.
It waits for the runtime's background preparation, then compares unfiltered and
distinct-filter lookups, restarts with retained vectors, and a restart after
removing test-owned vectors. It measures requests during reconstruction and
after preparation. It also commits a reviewed selection revision with unchanged
pins and checks that the runtime prepares it without re-embedding documents.
HTTP status, MCP errors, mode, result counts, durations and actual preparation
counts are preserved. Native exits and crash signatures are recorded after
cleanup; a crash or nonzero process exit fails the test.

Read [the historical cold-start observations](cold/RESULTS.md) for the previous
search-triggered implementation. The current command validates explicit
background preparation instead. See [the preparation results](cold/PREPARATION.md)
for the current measurements and remaining limits.
