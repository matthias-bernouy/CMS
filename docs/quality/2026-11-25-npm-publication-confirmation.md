# npm publication confirmation

Date: 2026-11-25. Base: `9cf313353` on `v1.0.23`.

The runtime publisher previously read version metadata once immediately after
`bun publish`. A successful upload could therefore be reported as unconfirmed
while npm was still processing the version. npm documents this availability delay
in its [publish-time scanning announcement](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).
The observed message alone does not establish a local or CDN cache fault.

## Implemented behavior

Confirmation polls reads with exponential delays from 1 second to 30 seconds,
bounded to 20 minutes per verification or channel confirmation. A monotonic clock
accounts for elapsed work; an independent wall timer aborts pending reads on expiry.
Progress reports the next delay and remaining budget. HTTP 404 means not yet
visible; connection failures and HTTP 429/500/502/503/504 can be retried after a
write. Preflight failures still refuse before publication. Invalid JSON, wrong
name/version/integrity, oversized metadata and authorization refusals remain fatal.

No confirmation loop executes another upload or tag write. Final abandonment
preserves the uncertain cause and same-build recovery. Existing response bounds,
fixed public registry, redirect refusal and exact SHA-512 checks remain in force.
No release bytes, receipt fields, Docker identities or deployment commands change.
A new process has no durable record of a hidden accepted upload; an attempted
re-upload is rejected by npm's immutable version rule, then reconciled by reads.

## Evidence

- Frozen installation and initial `bun run check`: all ten gates passed.
- Final publication/workspace regressions: 91 passed, 364 assertions, zero failures.
  The gated native Docker scenario ran separately in full verification.
- Tests simulate five-minute availability, successful and lost write acknowledgements,
  transient reads, exact 20-minute abandonment, conflicting metadata and retry.
- A real loopback HTTP server serves missing/stale metadata for upload and channel
  confirmation; each write happens once. Test clocks accelerate waits; no production
  publication or real 20-minute wall-clock run is claimed.
- Read-only npm metadata confirmed `@cyaxis/ulvia@1.0.23` matched the existing local
  archive's SHA-512 during this task. No npm or Docker Hub writes were performed.
- Full `bun run verify`: exit 0; 4,765 general tests passed, 165 gated skips,
  zero failures. Real Docker publication, browser/Mongo journeys, crash upgrade,
  account/Forms workflows, shared-hosting restart and fresh/restart TLS passed.
- Final `bun run check`: exit 0; all ten gates passed.

The tag-endpoint 404 guard and two concurrent-channel regressions were refined
after the general unit stage. The final 91-test publication/workspace run and
final static checks cover those final source bytes; runtime package code was
unchanged. Native deployment verification continued to completion afterward.

## Cost and limits

There is no runtime request-path change. Confirmation performs fewer than 50 reads
within an all-missing 20-minute window in the regression, with the existing 1 MiB
metadata and request/body deadlines. Version preflight and publication checks add
their existing fixed reads. Retries do not prove when npm will finish processing;
manual review or registry outages can exceed the window. No journal, automatic
rollback, catalogue promotion before confirmation or negative-cache bypass is added.
