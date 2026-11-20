# Shared hosting validation

Historical command names below describe the dated run. For current commands,
see [development](README.md); `check` replaces `check:all` and `verify` now includes
the former `verify:full` stages.

Validation scope: the isolated `codex/shared-hosting` task checkout on 2026-11-09.
This report covers the fresh shared-hosting baseline, not an import of historical
installation state. See [architecture](../architecture/shared-hosting.md) and
[installation](../installation/README.md) for the implemented behavior and commands.

## Requirement evidence

Paths below are relative to the workspace root. Tests are evidence only when
executed with their documented prerequisites; a skipped opt-in test proves nothing.

| Objective | Implementation and authoritative verification |
| --- | --- |
| 1. Preserve existing work and establish a baseline | Separate `/tmp/cmscore-shared-hosting` worktree, branch `codex/shared-hosting`, starting at `f89cad1fc`; locked dependencies installed; initial `check:all` passed all ten checks. The original checkout is separate. |
| 2. Preserve layers and process ownership | `@bernouy/hosting` owns domain services and SDK features; runtime composition owns adapters and environment. `check:architecture` verifies dependency direction. Provider and shared Edge have independent executable entrypoints; the Edge imports no Content persistence or rendering engine. |
| 3. Persist installation, Control, domains and tenants | `hosting/interfaces/state.ts`, `ControlBootstrap`, `ControlAuthority`, `DomainRegistry` and memory/Mongo stores. Installation and bootstrap tests reject authority inferred from a name, moved origins and missing mandatory state. |
| 4. Use admitted management contracts | SDK `ulvia/cms.hosting` declares eight HTTP/MCP capabilities; generated official inventory and manifest include them. Feature tests compile metadata and exercise default executors and signed HTTP dispatch. The native smoke creates sites through HTTP and authorized OAuth/MCP. |
| 5. Separate authorities | Current persisted Control identity plus a fresh local administrator grant. `hosting/tests/instances/feature.test.ts`, management tests and Provider `CreationAuthority.test.ts` cover forged scope, revoked replay/recovery and unchanged business state. Native smoke refuses ordinary-admin Hosting access. No global operator access level is added. |
| 6. Resolve exclusive domains | Mongo hostname/claim unique indexes and bounded seek indexes; domain unit/Mongo tests cover concurrent claims, ownership proofs, revision fencing and indexed point resolution. Control's initial domain uses this same registry. |
| 7. Serve many tenants per listener | `cms-edge-server/src/runtime/hosting/SharedEdge.ts`, `ContextPool.ts` and scoped contexts. Tests cover same-path isolation, load coalescing, entry/load/waiter limits, disposal failure and body leases through EOF/cancel/abort. Native smoke serves three logical instances with one Edge. |
| 8. Keep warmed Edges coherent | Fresh admitted routing on every ingress; domain/instance revisions fence authority, a separate resource clock invalidates public caches. Native smoke warms both Edge caches, deletes a Page, then requires 410 from both; domain claim/disable and tenant disable probe both listeners directly. Resource-clock tests cover races, maintenance and failed invalidation. |
| 9. Decouple Caddy from site containers | Static shared upstream configuration, admitted TLS permission and private shared callback transport. The isolated Pebble fixture uses two Caddys, real ACME validation and a shared certificate volume across proxy recreation. It covers unknown/pending domains, invalid chains and unavailable entrypoints. |
| 10. Bootstrap protected Control once | Bootstrap tests cover sixteen concurrent starts, interrupted provisioning, missing operator credentials and unchanged ready restarts. Runtime Mongo composition and native CLI smoke exercise the real plan. The native restart removes the bootstrap file and preserves accounts, sessions and identities. |
| 11. Keep Control and fresh sites empty | Exact system plans contain no collection or Page. Native setup explicitly selects a Repository and empty completion; native smoke asserts empty Control/Registry before and after restart. The separate setup fixture authors a disposable recipe and installs it only after explicit selection. |
| 12. Make CLI infrastructure-only | Shared Compose, persisted installation configuration, exact image pins and process lock; no CLI instance creation or site-specific Edge files. CLI tests exercise lifecycle/status/log targets, resize/removal, incompatible images and secret-free output. Native smoke starts/stops/restarts and expands the Edge pool. |
| 13. Enforce the fresh baseline | Strict mandatory persisted provenance, Repository settings, initialization markers and launch state. Mongo/settings tests refuse missing/malformed records without repair. Retention and explicit upgrade tests preserve exact approved pins. Real image replacement preserves Pages, Registry publications and an existing MCP grant without restarting the Edge. |
| 14. Verify isolation and bounded work | Native browser/MCP tests plus real upload/foreign-admin checks. Mongo startup tests inspect cursor batches, projections, index use and early close over 101 instances and 100 unfinished transitions; idle tenants do not hydrate. Delivery instrumentation measures causal HTTP/Mongo calls and bytes. |
| 15. Finish repository validation and documentation | `format`, `verify` and `verify:full`; current installation, development, architecture and package instructions describe shared hosting. Local Markdown links and `git diff --check` are checked separately. |

## Recorded results

All results below were observed in the task worktree on 2026-11-09. Images and
CLI archives are local artifacts; no publication or production CA was used.

| Check | Observed result |
| --- | --- |
| Initial and final `bun run check:all` | 10 passed, 0 failed in both runs. |
| `bun run format` and diff inspection | Applied; `git diff --check` clean. |
| `bun run verify`, invoked by `verify:full` | 3,577 passed, 53 opt-in cases skipped, 0 failed; performance budgets passed. |
| Complete `bun run verify:full` | Passed all four stages on final matching image set `0.1.0-hosting-test.8`. |
| Fresh shared-stack browser smoke | 142 assertions, one Edge serving Control plus two sites, restart and two-Edge coherence. |
| Delivery performance | 1,521 assertions; 420 requests per load scenario, approximately 126 seconds each. |
| Isolated ACME, fresh and recreated proxies | 18 + 19 assertions, both phases passed. |
| Actual Mongo startup/registry and Repository settings | 16 tests, 316 assertions, passed. |
| Compatible image replacement without Edge restart | 91 assertions, passed. |
| Bare Registry publication/install/restart | 47 assertions, passed. |
| Explicit recipe and offline empty-site setup | 47 assertions, passed. |
| Cold collection discovery and 31-version history | 48 assertions; 30 Provider health probes, maximum 32.8 ms in this fixture. |
| Localhost Repository transport and CLI PAT isolation | 9 focused tests, 45 assertions, passed. |
| CLI archive | Built `cyaxis-ulvia-0.1.0-hosting-test.8.tgz`; packaged help and version checks passed. |

The final delivery report records a quiet Page HIT ratio of
100%: 20 requests,
20 routing exchanges,
140 metadata operations and
0 Content operations; median
3.57 ms. The uncached literal Page recorded
28.2 Mongo operations and
3.5 internal exchanges per request,
including the explicit seven-read routing floor; median
42.86 ms. Compare these fixture-specific observations with
[the delivery guardrails](guardrails.md); they are not a production capacity claim.

## Reproduction

Use Bun 1.4.4, Docker/Compose and Playwright Chromium. Build matching local images;
no command below publishes an image, CLI release or certificate to production.

```bash
bun run images:build --version 0.1.0-hosting-test.8 all
ULVIA_SMOKE_IMAGE_VERSION=0.1.0-hosting-test.8 \
ULVIA_TLS_TEST_IMAGE=docker.io/cyaxis/ulvia-provider:0.1.0-hosting-test.8 \
bun run verify:full
```

`verify:full` invokes `verify`, the fresh shared-stack browser smoke, delivery
performance and the two-phase isolated ACME fixture. Do not set the generic MCP
image variables on this command: those opt into unrelated optional suites during
the standard test stage. Individual integration commands and their environment
variables are documented in `tests/integration/instance/README.md`.

The local CLI archive is generated separately with:

```bash
bun run cli:build --version 0.1.0-hosting-test.8 --stack-version 0.1.0-hosting-test.8
```

## Interpretation and remaining boundaries

The executable support matrix, admission and persisted exact selections remain
separate checks. Replacing an image is not an implicit contract/collection upgrade.
The image-replacement test uses two locally built compatible images; it does not
prove importing historical state or upgrading an arbitrary third-party Provider.

Cache measurements include one fresh routing HTTP exchange and seven indexed
metadata reads per warm public HIT. They exclude no hidden content work: causal
instrumentation separately records concurrent control/background traffic. Clock
integration tests verify four point reads, at most one examined key/document each
and less than 256 bytes per clock document. Startup metadata is streamed in batches
of at most 50; this avoids hydrating every tenant but still validates persisted
release retention at startup.

Caddy manages persistent certificates, and reconciliation checks each configured
entrypoint. The test proves issuance and recovery, not a complete long-lived
renewal cycle, production DNS propagation or a distributed certificate-store
backend. Those remain deployment validation. The TLS fixture's upstream is a
protocol peer; the independent native smoke verifies the CMS runtime journey.

Some older opt-in documentation/MCP scenarios retain pre-existing catalogue-count
assertions and need their own real embedding-model prerequisites. Their skipped
standard results are not claimed as acceptance evidence. The explicit native
smoke, delivery, setup, image-replacement and targeted Mongo tests provide the
hosting evidence listed above.

Size advisories remain for cohesive state machines/composition: provisioning,
Provider assembly, the Edge context pool, strict CLI installation parsing and
owned Docker fixture lifecycle. They were reviewed rather than split merely to
meet a line threshold. Directory fanout has no blocking error. Quotas, billing,
agent execution and a console collection remain outside this change.


## Revision-validated public response retention

Shared Edge resolves the admitted hosting route before every ingress, including
cache hits. A changed resource revision purges retained responses and pending
fills; routing or authority failures never authorize cached responses.

Content marks an exact rendered artifact as revision-bound only when it has no
live binding runtime or capability-backed SVG expansion. Public Page delivery
also requires a complete render snapshot, no declared capability dependencies,
and the ordinary public/non-dynamic access decision. Private, draft, dynamic
indexing, fallback and unsupported responses do not opt in. The marker travels
through native resource cache tags (`content:revision-validated:<source-revision>`), not an HTTP
header or a new endpoint. Weak metadata follows the actual compressed artifact,
including warm render-cache reads; it cannot retain discarded artifacts.

The producing instance reads its own resource clock before returning static
artifact metadata. An Edge must match that proof against its fresh hosting clock;
a remote Provider or another logical instance cannot opt into this policy using
an unrelated revision. This adds four bounded metadata reads on eligible origin
responses, never on the retained response path.

Only a shared Edge supplied with a freshly checked hosting revision may retain
these responses for 24 hours after their last use. Byte, entry, pending-load and
waiter bounds remain active. Recognized request `no-cache`, `max-age=0` and
`Pragma: no-cache` can reuse such a response after the revision check, reported
as `X-Cache: REVALIDATED`; ETags and HEAD still apply. `no-store`, unsupported
directives, credentials and ranges retain their bypass behavior. Other public
responses keep their origin's existing freshness policy. Browser cache policy
remains `public, no-cache`; the server does not grant 24-hour browser freshness.

Tenant contexts likewise expire after 24 hours of inactivity by default. The
context-count bound and least-recently-used eviction still apply before that
deadline; active response leases cannot be evicted. This is bounded retention,
not a promise that every tenant remains resident for a day.

Rendering identities hash the projected rendering settings rather than a
storage-only settings counter. Ordinary storage recovery therefore cannot change
asset URLs for unchanged rendering inputs. Theme CSS can regenerate an earlier
revision URL only if the exact content version still matches, like Bloc assets.
Historical styles whose actual bytes changed are not durably archived by this
mechanism and may remain unavailable after process-cache loss.

For independent latency scenarios and their measurement limits, see the
[public cache journey](../../tests/performance/public-cache/README.md).
