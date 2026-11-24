# Shared Resolved Schemas Review — 2026-11-24

This review records the native dynamic-schema implementation in `codex/contract-events-workflow-manifests`. It follows the [Events/Workflow reliability review](2026-11-24-events-workflows-reliability.md); that document remains historical evidence for the earlier source. The worktree is `/home/matthias/.codex/worktrees/contract-events-workflow-manifests/CmsCore`. No commit, push or merge was performed.

## Implemented boundaries

Events and capability JSON inputs/outputs share the native `resolved` schema node. The node identifies an admitted synchronous query resolver, statically checked root references for its selector and optional version, and an optional standard paginated picker. `schemaResolver` metadata establishes a resolver's exact descriptor protocol at admission. Descriptor schema data uses the existing native schema vocabulary; SDK helpers own its validation, serialization and digest. Feature-specific resource typing and Event resource-discovery wrappers were removed, without legacy aliases.

Event routing is independent: explicit `filterKeys` name required, static, nonsensitive root scalars. Subscriptions select bounded subsets through `filterJson`. Wildcards and subset routing use indexed canonical hashes; frozen subscription generations and durable batched fanout remain intact. Forms declares `formId` as a filter and puts resolution on `answers`, referencing the payload's `formId` and `formVersion`. Its public submission answer-array API remains unchanged.

Workflow publication materializes Event and capability schemas before accepting mappings. Selectors must be known from literals and installation parameters. Plans retain descriptor witnesses and schema inputs for health checks. Missing resource selection is a blocking `trigger.schemaSelectorMustBeKnown` diagnostic. Cross-Provider source changes remain independent: compatible consumed fields continue, incompatible consumed fields suspend the consumer, and outages defer revalidation.

## Execution and authority

The Gateway resolves and fully validates dynamic input before dispatch and validates output before returning success. Admitted dispatch metadata remains unchanged. Local SDK execution, signed Provider reception, restarted durable workers and retained-output projection use the same schema engine. Resolver authorization is checked separately from the business capability. Resolver effects, asynchronous resolver execution and nonconcrete descriptor schemas are refused.

The Provider receiver and the CMS Gateway each enforce durable version seals. A remote Provider cannot evade the CMS seal by bypassing SDK checks. The Edge uses the private ADMIN/control-only `gateway.schemas.seal` capability; it does not select a persistence adapter. The official surface forwards the seal store in both logged and quiet relay paths.

Seal identity includes site, Provider, installation, instance, declaring contract, resolver, resource and version. Inherited aliases share the declaring resolver identity. Distinct installations on one Provider instance remain isolated. Atomic immutable Mongo inserts accept one digest per identity and reject changed bytes as `SCHEMA_VERSION_CONFLICT`; no transaction or replica set is required. Seals have no payload and no retention TTL. Hosts without the required authority fail closed.

## Evidence

| Check | Result |
| --- | --- |
| Initial `bun run check` | 10 passed, 0 failed |
| Full `bun run verify` | Exit 0 |
| Full-suite static checks | 10 passed, 0 failed |
| General tests | 4,619 passed, 141 conditional skips, 0 failed |
| Collection browser tests | 4 passed |
| Capture/preview browser tests | 11 passed |
| Content/log/template Mongo tests | 18 passed |
| Forms/Events/Workflow standalone Mongo tests | 27 passed |
| Real Forms → Events → Workflow journey | Passed, including cold recovery |
| Edge smoke | Passed, including restart and two Edges |
| TLS | Fresh and restart journeys passed |
| Performance tooling | Types passed; 311 executors / 2,323 scenarios, no missing definitions or budgets |
| Retained performance compatibility | Passed; no measurement campaign |
| Final supplementary checks | `bun run check`: 10 passed, 0 failed; Workflow resource-health tests: 5 passed, 0 failed |

The missing-selection diagnostic and its focused regression were completed after the full verification's initial stages. The final supplementary check and five resource-health tests cover that last change. Root authoring documentation and this report were updated afterward. The full log is `/home/matthias/.codex/logs/CmsCore-resolved-schemas-2026-11-24-verify.log`; baseline, final check and focused-test logs are retained beside it.

Focused evidence includes:

- [Native resolution engine](../../packages/platform/contracts/tests/resolution/engine.test.ts) and [limits](../../packages/platform/contracts/tests/resolution/limits.test.ts): admission, descriptor integrity, bounded resolution and sensitive projection.
- [Signed Gateway execution](../../packages/platform/sdk/tests/schema/resolution/gateway.test.ts), [untrusted Providers](../../packages/platform/sdk/tests/schema/resolution/untrusted.test.ts), [inheritance](../../packages/platform/sdk/tests/schema/resolution/inheritance.test.ts) and [runtime execution](../../packages/platform/sdk/tests/schema/resolution/runtime.test.ts): full input/output validation, independent resolver denial, no business call after refusal, version conflicts, inherited identity and local execution.
- [CMS authority](../../packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/authority/schemas.test.ts): current exact source validation and caller/installation scope.
- [Official relay](../../packages/surfaces/ulvia-provider/tests/execution/messages/http/schema-resolution.test.ts): durable authority forwarded in logged and quiet modes.
- [Workflow health](../../packages/features/workflows/tests/resources/health.test.ts): unused-field evolution, consumed-field removal, outages, version conflict and missing resource selection.
- [Control performance recipe](../../tests/performance/scenarios/gateway/schema.ts): bounded fresh-tenant setup, actual control sealing, authentication/access/cross-instance refusal, invalid descriptors and immutable conflict behavior. Static plan validation passed; this is not a latency measurement.

Earlier verification attempts exposed stale release assertions and a missing official-relay authority argument; these were corrected before the successful full run. Earlier failed logs are not presented as current verification evidence.

## Cost and remaining limits

Static schemas keep their direct path. One signed JSON capability with dynamic input and output used three Provider network exchanges, four resolver executions across the two validation boundaries, and one business call in the focused test. An Edge adds two CMS control seal exchanges in that example. This is an operation-count observation, not a latency claim. Repeated identical selector/version lookups within one resolution share a cache; no cross-request cache or invalidation policy was introduced.

Resolution accepts at most 32 dynamic slots, 16 KiB of selector JSON per query, 256 KiB of descriptor schema JSON and 2 MiB cumulative resolver responses. Concrete schema complexity and depth are checked after substitution. Event filters allow at most eight declared keys and bounded scalar strings, producing at most 256 routing subset hashes. Invalid streaming resolver responses release their body before refusal. Existing Event fanout and list pagination bounds remain in place.

V1 is JSON-only. Array/map slots share a root-selected schema, without item-local resource correlation. Workflow selectors depending on future steps, unknown manual input or only a future result cannot establish publication-time mappings and are refused. Workflow-owned parameter/input/output declarations cannot introduce unowned resolver references. TypeScript sees `contractResolved` values as `unknown`; runtime materialization provides checked bindings. No administration UI, generic Bloc editor integration, webhook, binary workflow step or business-event ordering protocol was added.

Resolver and picker access may not exceed their consuming capability. An optional relaxation allowing public capabilities to reference an ADMIN-only editor picker was rejected by automatic approval review as an unauthorized security-boundary expansion; it was not applied. The ADMIN Forms/Workflow flow is covered by the retained stricter rule.

Repository shape has no blocking directory-fanout error. Existing cohesive Gateway/Workflow orchestration and atomic schema declarations retain size advisories; mechanically splitting them would obscure their validation sequence. See [authoring examples](../development/resolved-schemas.md) for the supported public helpers and host ports.
