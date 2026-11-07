# @bernouy/ulvia-sdk

Typed authoring and Provider assembly SDK. Depend only on Platform and Foundation.

- Emailer/SMTP, Secrets, Files, Observability, Access and Content are the production migration pilots. Keep other feature families
  outside the SDK until their migration is explicitly requested. Release discovery
  and publication remain CLI/infrastructure responsibilities.
- Root definitions perform no filesystem, network, environment or runtime initialization.
  `./build` admits artifacts and emits `ulvia-sdk-runtime/v1` metadata; it does
  not publish or approve them. `./provider` attaches matching default/alternative
  executors with `loadImplementations`, without scanning source assets or converting
  Zod schemas. Treat runtime artifacts as trusted build output shipped with its code,
  never as executable support supplied by an installed catalogue.
- `capabilitiesFor<Services>()` creates only a typed capability definer.
  `defineFeature` is the single authored source for identity, version, parent,
  capabilities, documents, fixtures and default execution. Contracts are generated
  projections; never maintain a second contract declaration or a createFeature wrapper.
  `implementFeature` captures own and inherited `execute` functions as one static
  runtime plan; declarative-only operations cannot claim an implementation.
  `implementContract` remains the explicit complete alternative-implementation API.
  Never invoke executors or service projections at build time. Capture metadata
  and executor identities before awaits. Inherited ports are required at mounting; incompatible shared parent ports reject at definition.
- Preserve exact parent pins, handler coverage, version selection and error ownership.
  Reject ambiguous inherited routes and conflicting coordinates.
- `./provider` reuses the Gateway receiver. Hosts own authentication, explicit
  authorization, trusted site/instance scope, credentials, quotas and listeners.
- Keyed commands require a host-owned durable executeKeyed adapter. Never silently
  activate them with an in-memory deduplication fallback.
- Keep the v1 UTF-16 and format rules unchanged. Native Zod string schemas differ;
  use the documented adapters and reject unrepresentable checks or transformations.
- Account for registered adapter children in schema node/depth budgets. Snapshot
  mock assets and enforce build count/byte limits before hashing.
- Stream binary bodies without whole-body buffering. Propagate cancellation,
  enforce byte limits and close the handler's borrowed input lease on completion.
- Documentation accepts in-memory sources or an explicit file URL to a Markdown
  directory. Only compilation scans that directory, recursively and within bounded
  count, bytes, entries and depth. Reject symlinks and preserve exact UTF-8 bytes.
  Root definitions perform no discovery. Fixtures remain explicit in-memory sources.
- Keep business errors independent from HTTP statuses. Only map the current
  capability's declared error through the actual admitted binding.
- Maintain the executable fictitious Provider example and the real signed HTTP
  Gateway journey, including cross-instance and refusal-without-mutation checks.

- `defineCapability` owns ID, access, behavior and bindings, plus optional
  deprecation/response effects. `defineFeature` owns identity, version, parent
  and an explicit capability list. Keep the emitted v1 capability format unchanged.
- Preserve literal capability IDs, execution modes and binding types. Named mocks
  belong to their operation; never discover them by scanning package directories.

- Operation failures may retain standard private `cause` values. Never serialize
  those causes. A host's optional `formatCapabilityFailure` hook can format the
  declared error payload, response headers and stable diagnostic reason only.
  Validate original and formatted payloads; derive code/status from the admitted
  operation/binding. Apply formatting before durable execution captures failures.
- Local `executeCapability` validates synchronous JSON input/output through the
  capability's Zod schemas. Its caller owns authorization. Streaming inputs/outputs
  and operation handles use the admitted Provider path; reject unsupported local
  modes before invoking business code. Provider calls retain generated Ulvia
  validation and do not parse the same JSON DTO again with Zod in the executor bridge.

- Hosts may restrict `registerProviderHandlers` to exact implementation pins.
  Validate every version/digest and duplicate before service projection or registry
  writes. Mount no unselected capabilities and require durable adapters only for
  selected keyed commands. `createProvider` always mounts its complete manifest.

- Capture code identity, lineage, policy and factories before asynchronous artifact
  verification. Reject corrupt/noncanonical contracts, duplicate coordinates,
  mismatched lineage/coverage/claims and oversized metadata before service projection.
- A default capability's optional `authorize` hook runs with the same captured
  services as `execute`, before every invocation and before durable receipt access.
  Preserve error ownership/presentation and refuse denied replays without a receipt
  lookup or business mutation. HTTP authentication/authorization remain host-owned.
  Alternative implementations own their complete authorization behavior.
- `contractString` preserves literal enum unions and explicit v1 bounds. Zod
  readonly wrappers preserve JSON acceptance and do not add contract fields.

- Optional `defineFeature.mapError` is a synchronous domain classifier returning
  `{ code, output? }` or undefined. Apply it to default execution and guards using
  the declaring feature's captured policy. Validate against the actual capability,
  retain original causes privately and never reassign explicit or foreign failures.
  Alternative implementations own their own classification. Never run or serialize
  mappers during compilation/attachment. HTTP presentation remains host-owned.
- Local feature execution receives the feature and capability ID explicitly so
  inheritance and error policy remain unambiguous. Standalone capability calls
  remain independent. Keep Zod input/output validation outside error classification.

- `capabilityResponse` preserves JSON output types through the Platform response
  envelope. Keep effect authority and wire validation in existing admitted Gateway
  handling. Local JSON execution refuses declared effects before invoking services;
  never issue credentials and then reject the local output envelope.

- Native resource capabilities may return `resourceResponse(Response, {vary, cacheTags})`
  from the SDK root. Keep the narrow Platform response import free of HTTP bootstrap.
  Preserve native representation metadata, bound bodyful statuses, and reject metadata
  on ordinary binary outputs. Release readers/listeners on completion, cancellation,
  error and request abort, including pending reads and backpressured consumers.
