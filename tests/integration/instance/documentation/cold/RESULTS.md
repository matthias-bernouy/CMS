# Cold-start diagnostic observations

This is historical evidence from before explicit background preparation. The
current test exercises the replacement flow described in the
[preparation report](PREPARATION.md).

Three matrices were run on 2026-11-02 with populated local model files and private
native MongoDB, Repository, Provider, Edge and Chrome OAuth. No agent missions,
background `check:all` or model benchmark ran concurrently with either matrix.
These are local observations, not latency SLOs or a load test.

## Authorization and retrieval

All thirteen requests in the initial matrix and sixteen in each instrumented matrix
returned HTTP 200 without MCP errors. The earlier first-trial HTTP 400 during
Access resolution was not reproduced. It remains unresolved; these successful
samples do not establish that the earlier failure was fixed.

The two instrumented matrices recorded:

| Phase | Requests per run | First duration | Repeat duration | Retrieval |
| --- | --- | --- | --- | --- |
| First sequential search | 1 | 14,199 ms | 12,010 ms | Lexical, three results in both. |
| Next parallel searches | 3 | 3,465–3,479 ms | 3,422–3,433 ms | Hybrid, three results each; initialization was still settling. |
| Restarted Provider, deleted vectors, unfiltered parallel searches | 3 | 11,200–14,168 ms | 10,991–10,993 ms | Lexical; English queries returned three results, French returned zero in both. |
| Restarted Provider, deleted vectors, distinct contract filters | 3 | 472–5,437 ms | 345–2,931 ms | One hybrid result set in each run; French had zero lexical results first, two hybrid results on repeat. |
| Model loaded, new unfiltered scope | 3 | 12,484–12,486 ms | 10,448–12,044 ms | First run all lexical, French zero; repeat English lexical, French hybrid with three results. |
| Same scope repeated | 3 | 273–275 ms | 199–200 ms | Hybrid, three results each in both. |

Each vector reset removed 87 derived Mongo records after the preceding Provider
stopped. English questions concerned Page verification and minimal collection
sources; the French question was “Comment transmettre les octets d'un fichier
privé ?”. All three used a limit of three. This probe counts results; it does
not grade semantic relevance. A successful HTTP response with zero results is
not counted as successful discovery.

The filtered calls use different corpus keys. The current single-flight vector
index can build one key while other keys fall back lexically. The ten-second
semantic wait bounds one stage, not total end-to-end HTTP duration; initial
work and event-loop/native CPU activity can make the observed request longer.
The first warm-labelled batch is not a clean steady-state latency sample. The
last same-scope batch provides the observed warm sample on this machine.

## Process lifecycle

The initial matrix's Provider log contained one native Bun panic in a series
that included restarts:
`A C++ exception occurred` and `Bun has crashed`, under Bun 1.4.2 on macOS ARM.
The matrix continued serving requests. The old harness discarded child exit
statuses and reused log sinks, so the exact generation and timing relative to
restart/shutdown are not established. That occurrence has no recorded exit code.
The initial test also failed an overly strict nonempty-result assertion for the French
lexical fallback; it was not an authorization failure.

The harness now records each child exit code, signal and native-crash signature
before restart logs can be overwritten. It explicitly clears each new child's
log sinks: a local probe confirmed that Bun preserves an earlier sink when the
next child writes nothing. A focused test verifies that an earlier crash stays
recorded without being attributed to a silent next generation. The harness
removes temporary state after cleanup. Cold and complete native journey tests
explicitly fail on a captured
native crash. The final matrix recorded three Provider generations, Edge,
Repository and Mongo exiting with code zero and no crash signature.

The crash has not been reproduced in either instrumented matrix. Native inference
and shutdown are an investigation lead, not an established cause. Production
Linux/Docker behavior, model downloads and higher concurrency were not tested
by this matrix. No runtime fix is claimed.

## Evidence

The instrumented runs each passed one test, with 94 and 95 assertions. Raw local
output is retained at `/tmp/ulvia-agent2-cold-instrumented-first.log` and
`/tmp/ulvia-agent2-cold-final.log`; the initial output is
`/tmp/ulvia-agent2-cold.log`. These are temporary machine-local artifacts. Run
the [documented command](../README.md#cold-start-diagnostics) for the current
background-preparation regression journey; it no longer reproduces the retired
search-triggered implementation.
