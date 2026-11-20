# Gateway control representations and MCP lookup

Installations 1.5.0 adds four HTTP-only, control-authority capabilities. Existing 1.4.2
capabilities and their exact retained execution pin remain available. Edge
negotiates an explicit supported pin from the authenticated runtime report;
older pins keep the original complete-route and MCP discovery paths.

`gateway.route.snapshot` returns current route metadata with immutable admitted
contract/manifest definitions referenced by SHA-256 of their complete serialized
representation. The canonical release alone is insufficient: compiled bindings
and property order must also remain exact. `gateway.route.get` keeps its original
representation. This is an admitted capability, not a private transport.

One tenant control client retains at most 128 definitions and 8 MiB of accounted
source/graph storage. It validates definition hashes and kinds, freezes decoded
definitions, and leases advertised references until response consumption or
failure. Definitions that cannot fit remain transient for that response. Failed
loads never enter the cache. Mutable routes, grants, status and credentials do not
enter this immutable cache. The original full-route 1 MiB admission ceiling and
512 KiB route-cache ceiling remain enforced without serializing the whole graph.
The existing live dispatch checks still fence execution.

`gateway.mcp.resolve` validates the full selected catalogue's tool identity space
before returning one exact admitted contract. `gateway.mcp.authorized` also checks
the current actor's authority and reads selected IDs inside that control call,
avoiding a separate installation-list invocation for targeted tool execution.
Discovery still obtains selected IDs through the ordinary actor-authorized
Gateway invocation. Execution uses the same Gateway and exact MCP binding as
discovery-based lookup. Unknown tools and invalid global catalogues cannot
bypass validation.

`gateway.command.prepare` combines current identity resolution, durable audit
start and command preparation in one admitted call. Business execution still
passes through the Gateway, and the terminal audit remains separate. The
retained 1.4.2 pin keeps the original separate control exchanges.

The Provider retains only a tool-name-to-exact-pin index, at most 1 MiB per
instance Gateway. A fresh fingerprint includes selections, installations and
observations, contract releases and Provider manifests. Every hit re-resolves the
target route. Missing revision ports disable reuse. Changed revisions during a
build prevent retention without retrying or changing the reference read result.
The index grants no authorization and is isolated by the instance-owned Gateway.

Discovery and index construction read at most two independent contracts at once.
They preserve root/parent discovery order, the 256-contract bound, global tool
limits and duplicate detection. Failure drains all started reads and returns the
first failure in input order. No detached request or hidden retry is introduced.

Run `bun run verify` for protocol, compatibility, authority and static performance
coverage checks. Real latency measurements remain separate under `bun run perf`;
select exact scenarios with repeated `--scenario` flags. When comparing a 1.4.2
baseline to 1.5.0, record the changed release/inventory identities explicitly and
prove unchanged business capability schemas and workload parameters. Such a
comparison is not an exact-inventory regression reference.
