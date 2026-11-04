# Background documentation preparation

This is a historical validation report for the thread-based model adapter.
The current adapter uses a separate native process with telemetry disabled at
startup; see [the architecture guide](../../../../../docs/architecture/contract-documentation.md).

The runtime now initializes one model worker after mounting HTTP and prepares
selected documentation in a background queue. It retains at most 32 pending
instance jobs and executes one preparation at a time. Queued records acquire
resources only while executing; the instance registry is reread before opening
an instance. Instance stores publish a preparation hint after a validated
selection CAS commit. Refused commits do not notify, and observer failures do
not turn a committed operation into failure.

`CmsDocumentation.prepare()` builds one full selected corpus and retrieves
content/model-keyed vectors, embedding only missing passages. Filters select
candidate rows before ranking and share the same prepared index. Cold lookups
return explicit lexical fallback without launching inference. Prepared lookups
embed only their query. Active compositions request maintenance every six hours;
persisted rows are revisited at most daily and valid vectors approaching their
30-day expiry are renewed. Unused cache rows continue to expire.

The Transformers adapter owns one dedicated worker for tokenization and ONNX
inference. The reference runtime configures two intra-operation threads and one
inter-operation thread. The worker receives model configuration and texts, with
an empty environment; it does not inherit Provider environment secrets. Calls
and native slots remain bounded. Shutdown cancels queued work, lets the current
native batch finish, drains queries, closes instance stores, disposes the model
and waits for natural worker exit. Native calls are not instantly interruptible,
and a worker thread is not isolation from a fatal native process abort.

## Validation approach

Unit tests count actual mock-model passage/query calls, including parallel
filters, service restart, one changed passage, cache maintenance, failure and
selection fencing. Queue tests cover coalescing, capacity, continuation after a
failure, commit notification and shutdown. The native matrix uses real Mongo,
Repository, Provider, Edge, browser OAuth and the pinned cached model. It reads
runtime preparation counts and performs actual HTTP/MCP requests. All publication
and mutation data belongs to a private loopback test environment.

The baseline is the [historical cold matrix](RESULTS.md). Timing comparisons are
observations on one machine, not an SLO or an isolated measurement of a single
change: explicit preparation, worker execution and ONNX thread configuration
changed together. Package/architecture documentation describes operational bounds.

## Observed results

The complete native directory passed eight tests and 447 assertions. After moving
cache index initialization into preparation, the targeted native matrix was
repeated and passed one test and 82 assertions. All three Provider generations,
Edge, Repository and Mongo exited with code zero, without native crash signatures.
The final native measurements were:

| State | Preparation work | Three parallel HTTP/MCP lookups |
| --- | --- | --- |
| Initial selected corpus ready | 87 passages embedded in 16,142 ms in background | Unfiltered hybrid: 53–62 ms; distinct-filter hybrid: 48–57 ms. |
| Restart with persisted cache | Zero passages embedded, 87 reused; preparation 163 ms, excluding the separate model initialization job | Hybrid: 111–121 ms. |
| Cache deleted while stopped | 87 passages rebuilt in 12,775 ms | During reconstruction: lexical, 418–419 ms; after completion: hybrid, 131–139 ms. |
| Reviewed selection commit, same pins/docs | Revision advances from 1 to 2; zero passages embedded, 87 reused; preparation 6 ms | Successful asynchronous operation and a preparation event for revision 2. |

The earlier complete run observed 309–310 ms during reconstruction and the same
87/zero passage counts. A development version running tokenization in the HTTP
process still took roughly 8–11 seconds during reconstruction despite background
scheduling; that observation motivated worker execution. A forced-worker cleanup
also produced a Bun native abort in development. The final adapter disposes the
model and awaits natural worker exit; both successful native runs had clean
shutdowns. This is evidence for the implemented lifecycle, not proof that every
possible Bun/ONNX native failure is eliminated.

The final focused unit run passed 28 tests and 181 assertions. A changed release
with one changed passage embeds exactly that passage; unchanged content is reused.
Failed derived-cache index setup stays inside preparation, and lexical search and
direct reads still work. Searches after preparation make zero document-body reads
and one query embedding each in the actual offline model evaluation. The same
16/17 relevance labels pass, including all ten original questions; the existing
French first-component query still misses the direct source guide. The evaluator
therefore exits unsuccessfully for that known miss, not for degraded retrieval.

## Limits and artifacts

Cold work still takes time and may need a model download when files are absent.
Before readiness, a French lexical query can still return zero English documents;
this happened during reconstruction and is not presented as a successful search.
Model download cancellation, production Linux/Docker execution and large-scale
multi-tenant load were not verified. The persisted vector cache uses TTL and
bounded per-corpus batches, without a separate global Mongo byte quota.

Raw local evidence: `/tmp/ulvia-warm-native-all.log`,
`/tmp/ulvia-warm-native-cold-accepted.log`, `/tmp/ulvia-warm-unit-final.log` and
`/tmp/ulvia-warm-retrieval.log`. These temporary logs are machine-local.

## Repository verification

The initial and final `check:all` each passed all ten checks, including architecture,
style, logging, types and dead code. The integration TypeScript project also
passed. Formatting and local link checks passed. Runtime orchestration lives in
`ProviderDocumentation`; indexing stays in the feature and selection commit
observation stays in runtime composition. Selection capability helpers were
grouped with the observer under `stores/selections` to keep directory fanout
within its existing limit. No contract release or HTTP/MCP schema changed.

The existing composition-root file-size warning remains: `ProviderInstanceHost`
is 460 lines, versus 427 at the task's start. Its assembly and cleanup remain
cohesive; the new scheduling/model ownership was extracted into its own component.
The native test harness retains a 163-line INFO finding. No directory-fanout
error was introduced.

Final `verify:full` reached the global tests: 2,849 passed, fifteen were skipped,
and the same four pre-existing failures remained: changed pinned-IP socket reuse,
the URL-encoded workspace path in a build boundary, and two Linux `flock`
ownership cases on macOS. It stopped before performance, Edge smoke and delivery
stages. Raw output is retained at `/tmp/ulvia-warm-verify-full-final.log`. Final
process inspection found no remaining native CMS test processes.
