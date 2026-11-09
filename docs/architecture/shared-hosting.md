# Shared hosting

The hosting feature separates installation authority, CMS tenant state, domain
admission and the HTTP listener. The Provider creates empty Control using the
ordinary provisioning state machine and an explicit Control system plan. Its
persisted identity and current local administrator grants authorize
`ulvia/cms.hosting`; a name, collection or installed contract grants no such role.

## Provider startup and initial access

The Provider requires `ULVIA_CONTROL_ORIGIN` and `ULVIA_EDGE_ROUTING_SECRET`.
On a fresh installation, `ULVIA_CONTROL_BOOTSTRAP_FILE` points to an operator-owned
JSON file containing exactly `email` and `password`. The file is bounded to 4096
bytes and initial credentials are validated before reservation. The existing
encrypted provisioning credential store stages the administrator; successful
provisioning clears the staged password. Ready restarts do not require the file
or reset the account.

Installation phases are `reserved`, `provisioning` and `ready`. A missing marker
on a populated database refuses startup. Missing ready instance, credential or
domain state is an operator recovery error, not a reason to create replacements.
Instance readiness, domain verification and TLS readiness are distinct.

`ULVIA_HOSTING_MANAGED_SUFFIXES` optionally supplies a JSON array of at most 16
operator-owned DNS suffixes. Management creation can admit those origins without
a customer TXT proof. Localhost origins are allowed only for local installations;
HTTPS localhost still requires TLS. Customer claims require their exact DNS TXT
proof. No collections or Pages are bootstrapped for Control or other sites.

## Contract boundaries

`ulvia/cms.hosting` has eight HTTP/MCP instance and domain operations. Creation
reserves the primary hostname and a unique request identity before provisioning,
so a conflict does not leave an orphan tenant. Exact retries reuse one persisted
identity; returned instance status distinguishes pending from ready. Lists use
bounded cursor pages. Management protects Control, its initial domain and an
already enabled exact Hosting selection.

Instance records persist immutable creation provenance: an operator entry point
or the original Control administrator actor. The creation fingerprint binds this
provenance, so a retry cannot substitute another creator. Provisioning and recovery
recheck the original actor before opening business services, before each unfinished
step and before committing readiness; completed replay also reauthorizes. Revoked
authority leaves the instance's business state unchanged, although an in-progress
transition can journal refusal. Restoring that actor's grant permits an explicit
retry without repeating completed steps. Missing persisted provenance is refused
without repair. Operator recovery remains a separate authenticated path.

Staged passwords are read only for administrator initialization, once on a normal
five-step creation rather than once per step. These checks add no domain scans or
persistence reads to ordinary Edge ingress. The operator creation endpoint returns
202 while provisioning is pending and 201 only for an actually ready instance.
Instance registry updates perform one indexed pre-read to validate mandatory
provenance followed by one revision-and-provenance CAS, replacing the former
single update. Invalid persisted provenance refuses before writing business state.

`ulvia/provider.routing` is a separate host-level, HTTP-only machine contract.
It is excluded from both ordinary and Control CMS plans. A signed `cms-edge`
invocation in the hosting technical scope can resolve one hostname. It cannot
invoke hosting administration or supply a CMS user identity.

The Edge receives a control lease lasting at most 60 seconds. The Provider verifies
its signature before doing persistence work, then checks the current domain and
instance revisions, assignment, origins and expiry before a report or broker
call. It never returns persistent tenant credentials or operator secrets. Existing
Installations capabilities still issue narrowly scoped business invocation tokens.

## Shared Edge

The Edge now starts with listener settings, `CMS_HOSTING_PROVIDER_URL` and
`CMS_HOSTING_EDGE_SECRET`. The old single-instance public URL and credential
configuration is rejected. `CMS_EDGE_MAX_CONTEXTS` defaults to 16 and accepts
1–128. Context loading is limited to four concurrent loads, each context to 64
active leases, and routing to 64 in-flight calls. Idle contexts expire after one
minute. A context holds at most 2 MiB of cached public representations, 128 cache
entries and eight concurrent cache fills.

Each ingress resolves the hostname before using a context or resource cache.
A context key includes hostname, canonical/public origins, instance identity and
domain/instance revisions. Loads coalesce and failed loads release capacity.
Contexts hold separate Gateways, route caches, public caches, OAuth/MCP origins,
cookie policies and bounded diagnostic sinks. Registered aliases redirect to the
canonical CMS origin. Forwarding headers do not select a tenant.

Provider and Edge runtime leases stay held through response body completion,
cancellation or abort. Shutdown stops the listener before draining contexts.
A context disposal failure closes admission rather than hiding the resource leak.

## Caddy and certificate readiness

`ulvia/provider.tls` is an admitted public read-only GET contract. Its sole
`certificates.permit` binding is `/hosting/tls/permission?domain=...`. Caddy uses
the status code from this binding. The surface constructs an isolated anonymous
hosting scope and discards caller identity, credentials and transport headers;
this does not expose signed CMS or Edge-routing capabilities.

Permission first reads the indexed domain and its target instance. Only verified
or active HTTPS domains with ready instances continue to DNS verification. Every
A/AAAA address must belong to the operator-configured installation, and the public
port must match its HTTPS listener. Domain and instance revisions are read again
after DNS. An unknown domain costs one indexed domain read; an eligible successful
permission costs two domain reads, two instance reads and bounded A/AAAA queries.
Permission has at most 16 concurrent requests and never mutates domain state.

The Provider accepts `ULVIA_TLS_ENTRYPOINTS`, a JSON array of at most eight
`host`/`port` objects, and `ULVIA_TLS_PUBLIC_ADDRESSES`, at most 32 IP addresses.
HTTPS Control requires entrypoints and explicit public-address configuration
outside local development. An explicit empty array permits DNS-pending bootstrap
but cannot grant certificate permission; configure the installation addresses
before expecting HTTPS readiness. `ULVIA_TLS_TRUST_FILE` optionally supplies at most 64 KiB of mounted PEM
trust for local/test authorities. DNS has a five-second deadline. TLS probes
connect only to configured entrypoints; tenant hostnames supply SNI, not socket
destinations. Chain and hostname validation remain enabled.

After the permission listener starts, one coalesced background batch seeks at
most 50 domains, with four workers. Each eligible domain must pass configuration
and certificate probes on every entrypoint before its revision-fenced TLS write
activates routing. At most 32 TLS sockets can be pending with eight nodes. Stable
readiness does not increment revisions. Failures are persisted as TLS failure and
reported as configuration/certificate/unavailable outcomes in operator logs;
stale completion cannot reactivate a disabled domain. Unexpected storage failures
are reported; the error path never overwrites another revision. Shutdown aborts probes and drains
the current batch before closing the listener.

The ten-second timer never overlaps a running batch. Larger registries require
multiple seek pages; readiness follows completion of the relevant background
check, not a fixed ten-second guarantee. Backend health is a separate gate:
existing certificates may reload before shared Edge upstreams become healthy.

`@bernouy/hosting/caddy` generates the optional Caddy adapter configuration with
static shared Edge destinations, active `/readyz` checks, round-robin balancing
and on-demand permission. There is no per-site destination or Docker socket.
The admin API is disabled. Explicit persistent certificate storage coordinates
multiple entrypoints; all nodes need a consistent shared store. Preserve Host
including its port and redirect HTTP using the configured public HTTPS port.
See the pinned [Caddy permission implementation](https://github.com/caddyserver/caddy/blob/v2.11.9/modules/caddytls/ondemand.go)
and [automatic certificate management](https://caddyserver.com/docs/automatic-https).

Disabling a domain denies new permission and the next Edge ingress. It does not
revoke an already issued certificate or immediately remove it from Caddy memory.
Certificate renewal is delegated to Caddy; forced renewal is not covered by the
current integration test.

## Private transport between shared services

The CLI supplies `ULVIA_HOSTING_PROXY_URL=http://proxy:8080`. Caddy's separate
unpublished HTTP listener uses the same shared Edge pool without the public
HTTPS redirect. This is a socket-routing adapter for existing admitted bindings,
not another capability protocol or instance selector. Logical CMS and Repository
URLs stay public, preserving account, PAT and Repository identity bindings.

Before each outbound request to a registered hostname, the Provider reads one
indexed domain and its ready target instance. A known disabled/pending domain,
wrong scheme/port or wrong target identity refuses without falling back to public
DNS. Unknown external origins retain the ordinary transport. The registered
logical Host replaces caller Host; redirects remain unfollowed. Scoped Gateway
credentials and selected capability authority remain unchanged. Gateway callbacks
authorize their original selected endpoint while the Node transport validates and
pins the private socket. A shared bound of 64 response streams releases at EOF,
cancellation or abort; failed loads release capacity. There is no hostname cache
or tenant-registry scan.

Discovery, namespace and publication clients receive this injected transport.
Content callbacks receive it through account-bound ProviderConnections. The real
separate-container browser journey now reaches catalogue discovery, explicit
collection publication/installation and rendered Page delivery after restart.
This replaces the old assumption that a public `.localhost` URL could resolve
from a Provider container to its own loopback. It does not weaken origin/identity
checks or expose an operator credential to Edge or browser.

## Coherence and request cost

A warm context or cached resource still requires one routing HTTP exchange at
ingress. Successful resolution reads one indexed domain record and one instance
record, rechecks the ready instance to select its database, then performs four
indexed cache-metadata reads. An unknown domain needs only the domain read.
There is no tenant-list scan or Content runtime hydration on this path. Routing
responses are bounded to 16 KiB. Cold context loading
resolves once more to fence races, then loads and validates the tenant report and
selected control capabilities.

A broker/report lease check reads the domain and instance again; runtime composition
then reads the exact current instance record. The ordinary native execution checks
still run. Invalid lease signatures or expired leases refuse before domain reads.

Domain changes and disables affect the next ingress on every Edge. Requests already
in progress may finish. Resource freshness uses a separate opaque revision in the
admitted routing response; it grants no authority and does not replace contexts.
Content, collection, selection and file mutations advance a durable shared clock
before releasing their write permit. Maintenance release also advances the clock.
Asynchronous image derivative publication uses the same write fence.

Revision reads bracket indexed maintenance and write-permit reads. During a write,
maintenance, a racing revision change or before the first clock exists, resolution
returns a unique revision so no existing representation is reused. Invalid persisted
clocks refuse routing. Failed invalidation keeps the durable permit; even an expired
permit cannot be treated as proof that a stalled writer is dead. This prioritizes
freshness over cache reuse and maintenance availability after an uncertain failure.

Each Edge purges cached entries and pending fills before handling an ingress whose
resource revision differs. An ingress resolved after an acknowledged local mutation
cannot reuse an earlier cache generation. Requests overlapping that mutation may
finish with the earlier representation. Quiet instances keep ordinary cache HITs.
External Providers' independently changing data still follows their admitted cache
policy; this clock tracks writes composed through this official Provider's fences.

## Bounded Provider startup

Startup streams metadata through indexed Mongo cursors with batches of at most
50. Retained transition plans are validated individually against admitted
resources and build support. Idle instances do not open CMS compositions.
Operation recovery projects one pending identifier per instance, including
unexpired running work, before opening an affected runtime. Documentation
preparation is lazy and uses its existing bounded queue. Early exits and refusal
close cursors. Repository configuration is mandatory persisted instance metadata;
missing or malformed settings refuse without default substitution or repair.

## CLI deployment

The CLI launches one Compose project with shared MongoDB, Provider, Caddy and a
configured pool of Edges. Both CMS images require exact image pins and
`io.ulvia.hosting-api=1` compatibility evidence. With compatible locally built or
published images available:

```bash
ulvia start --domain control.localhost --version VERSION
ulvia services status
ulvia configure hosting --edges 2
ulvia start
```

Compose removes obsolete Edge services when the pool shrinks. Site creation uses
Control's hosting contracts and never changes Caddy's static shared destinations.
Infrastructure mutations share a native process lock whose inode survives reset.
Health checks use `/readyz`; DNS, domain readiness and certificate readiness remain
separate from healthy backend services.

Mandatory hosting settings live in `services/installation.json`, launch intent
and image pins in `services/stack.json`, and private keys in
`services/runtime.json`. The initial administrator is written exclusively to
`services/credentials/control-administrator.json` with mode 0600 in a private
directory, before runtime keys are committed. Startup prints its path only.
Missing mandatory settings or keys over existing launch or database state refuse
without repair. Missing launch pins over populated MongoDB or CMS file storage
refuse before image lookup or credential generation. An interrupted first launch
with empty storage can resume. Ready restarts do not recreate a removed initial
administrator file. No collection is shipped or installed for Control.

## Verification and deployment boundary

`bun run verify:full` runs standard verification, the fresh CLI browser journey,
delivery measurements and the isolated ACME fixture. Optional integration tests
have their own explicit image/environment requirements; skipped tests are not
runtime evidence.

The native shared-stack smoke authenticates and configures empty Control, creates
Registry and a site through an authorized OAuth/MCP client, and explicitly
publishes test resources into that isolated Registry. Only the test site installs
a collection and publishes a Page. The smoke checks ordinary-admin Hosting
refusal, foreign Page/cookie refusal, empty Control/Registry, a full services
restart without the removed bootstrap credential file, and two warmed shared
Edges. Both Edge caches must HIT before Page deletion, then return 410 immediately
after the acknowledged mutation. Separate real-process tests cover OAuth resource
isolation, fresh domain admission and disabled warmed routes on both Edges.

The real upload/isolation fixture checks foreign administrator and owner-token
refusal on a foreign origin, public file visibility, private refusal and deletion.
Refused foreign renames preserve both the foreign workspace and the complete
owner file record. Unit tests cover hard context bounds, coalesced loads,
streamed-response lifetime, lease renewal and refusal without persistence reads.
Mongo tests cover exclusive claims, indexed pagination and four point reads for
the resource clock, with at most one examined key/document each and less than
256 bytes per loaded clock document. Startup fixtures inspect cursor batches,
projections, index use and early-close behavior over 101 instances and 100 active
transitions.

Delivery measurements use one shared Edge and distinct local domains. They cover
cached and uncached Pages/assets, private callbacks through admitted bindings,
request counts and loaded volume. A cache HIT still performs fresh routing and
bounded authority metadata reads; the performance guardrails account explicitly
for that cost. The repeatable measurements are written to
`artifacts/delivery-performance/latest.json` by the runner. They describe the
fixture and machine under test, not a general production throughput guarantee.

The automated TLS fixture uses two actual Caddy 2.11.9 processes, a shared
certificate volume and pinned Pebble with real validation. It checks fresh
issuance, dynamic domain admission, unknown/pending refusal, invalid chains,
unavailable entrypoints, Host/redirect ports and identical certificate serials
after proxy recreation. Its upstream is a fixture rather than the CMS Edge;
the separate native smoke proves the CMS journey. No production certificate
authority is contacted. Persistent storage and Caddy's certificate management are
configured, but this test does not simulate a complete long-lived renewal cycle
or a distributed production certificate-storage backend.

Published images and production DNS remain operator deployment inputs. The
source tests build local images; a passing local journey does not publish them.
Business quotas, billing, an agent engine and a console collection are outside
this change.
