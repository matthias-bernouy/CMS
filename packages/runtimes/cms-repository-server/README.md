# `@bernouy/cms-repository-server`

This runtime serves the global integration registry from a persistent
filesystem root. It owns two listeners:

- the public-read listener mounts anonymous `GET`, `HEAD`, and `OPTIONS`
  repository routes under `/.cms/repository`;
- the internal management listener mounts injected write routes behind one
  management service credential.

The runtime keeps an immutable in-memory catalog snapshot. A failed refresh
does not replace the last valid snapshot: reads remain available, readiness
stays true, and health becomes degraded. An initial snapshot failure prevents
the production listener startup.

## Operational visibility

Completed publication, stable-promotion, and compatibility-reevaluation
operations emit one JSON log record on standard output. The allowlisted schema
contains operation and report identifiers, kind, version, digest, evaluator,
outcome, and duration when available. It never contains the management token,
request headers, actors, reasons, package contents, or filesystem paths.

Authenticated management reads expose operational counters only through
`/.cms/repository-management/api/status` and
`/.cms/repository-management/api/diagnostics`. They include mutation outcomes
and latency, snapshot integration/version/quarantine/recovery counts,
compatibility warnings and reevaluations, public package bytes and rate-limit
rejections, and registry filesystem capacity. The public listener does not
expose these fields. The recent-operation diagnostic list is capped at 32 by
the runtime and at 100 by the management projection.

This MVP deliberately has no general metrics backend. Counters and recent
operations are process-local and reset on restart; immutable compatibility and
promotion histories remain authoritative on disk. Each CMS separately emits
`cms_integration_package_cache` JSON events for hit, miss, corruption, and
materialization bytes. Those per-CMS cache events are not aggregated into the
repository process. Operators that need long-term rates, percentiles, or
multi-instance aggregation must collect the structured logs externally.

The filesystem capacity sample uses `statfs` on the registry mount. A sampling
failure is returned as a sanitized `unavailable` metric and does not make a
valid catalog unready. Capacity values use decimal byte strings so large
filesystems do not lose precision in JSON.

## Recovery ownership

The registry is authoritative and must be backed up as one filesystem tree,
including immutable versions, indexes, compatibility and promotion history,
journals, quarantine, and recovery markers. CMS integration-package caches are
separate, consumer-owned stores with a different recovery policy; see the CMS
image backup documentation. Never merge a cache backup into the registry or
restore registry files selectively from a cache.

On a completely empty registry root, production prevalidates and publishes the
14 checked-in official packages before starting either listener. A durable
in-progress marker makes an interrupted seed fail closed on every later start;
an initialized volume is never reconciled with a newer image. The operator
procedure is documented in `infra/images/cms-repository/README.md`.
