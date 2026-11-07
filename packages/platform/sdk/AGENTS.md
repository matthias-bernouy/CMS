# @bernouy/ulvia-sdk

Typed authoring and Provider assembly SDK. Depend only on Platform and Foundation.

- Emailer/SMTP is the production migration pilot. Keep other feature families
  outside the SDK until their migration is explicitly requested. Release discovery
  and publication remain CLI/infrastructure responsibilities.
- Root definitions perform no filesystem, network, environment or runtime initialization.
  `./build` admits artifacts; it does not publish or approve them.
- One static typed handler-factory table drives manifest claims and runtime registration.
  Never invoke dependency factories at build time. Capture source metadata before awaits.
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
  operation's declared error through the actual admitted binding.
- Maintain the executable fictitious Provider example and the real signed HTTP
  Gateway journey, including cross-instance and refusal-without-mutation checks.

- `defineOperation` owns ID, access, behavior and bindings, plus optional
  deprecation/response effects. `defineContract` owns identity, version, parent
  and an explicit operation list. Keep the emitted v1 capability format unchanged.
- Preserve literal operation IDs, execution modes and binding types. Named mocks
  belong to their operation; never discover them by scanning package directories.
