# Page performance and headless hosts

Investigate host scheduling, available memory, kernel messages and container
restarts before attributing a slow Page to MongoDB or adding a cache. Record
TTFB, browser resource timings and Gateway phase timings separately. A healthy
`/readyz` response only establishes Edge readiness; it does not measure Page
rendering or Provider dependencies.

The local instance Docker journey exercises `/admin/pages` twice with an active
browser session. It checks that the document stays private/no-store and that
versioned public Bloc JS/CSS retain immutable caching and conditional 304
responses. Timings are printed as diagnostic evidence, without brittle
machine-specific latency assertions. Unit tests gate artifact read counts,
cache bounds, preparation concurrency and live revocation fences.

## Cirrus framebuffer stalls on a headless VPS

On an affected host, Linux kernel traces may report repeated `cirrus-qemu`
framebuffer work, vblank timeouts and soft lockups while application containers
have no OOM or restart. Confirm these traces and that SSH plus an active serial
console are available. This is an operator mitigation for that failure, not a
required part of an ordinary Ulvia installation.

[`headless-console.py`](../../infra/operations/headless-console.py) discovers the
framebuffer by its console name, checks for a bound Cirrus PCI device and an
active serial console, then detaches only the framebuffer. It never unloads the
driver, stops SSH, disables the serial console or restarts applications. Its
optional [systemd unit](../../infra/operations/ulvia-headless-console.service)
runs this check after device initialization on subsequent boots. Install the
script as `/usr/local/lib/ulvia/headless-console.py` and the unit under
`/etc/systemd/system/` only on a confirmed affected headless host. Enable with
`sudo systemctl enable --now ulvia-headless-console.service`.

Before applying it, save every framebuffer console's original `bind` value.
Rollback disables the unit and writes those original values back to the saved
`/sys/class/vtconsole/vtconN/bind` paths; stopping the oneshot unit alone does
not reattach a console. Keep the original kernel traces for diagnosis. No
kernel replacement or reboot is required to apply or undo the runtime change.

Linux documents this interface in the [framebuffer console guide](https://docs.kernel.org/fb/fbcon.html).

## Invocation preparation

Initial selection, installation and route reads may be shared by an explicit
`GatewayAuthorityReads` context during one operation. The context is bound to a
site and keys its reads by the exact store object, so equally named sites in
different instance stores cannot share data. Failed reads are not retained.
Final signing fences, native receiver checks and new operations read current
state independently. Secret values never enter this context.

Each instance-bound route resolver also retains bounded, verified immutable
contract lineages and manifests by exact digest. Every operation still reads the
current selection and installation; changing either pin loads the new artifact.
Execution pins exclude mutable catalogue yank/deprecation status. Catalogue and
`capabilities.describe` reads continue to observe that metadata directly. A yank
withdraws discovery and does not revoke an approved installation.

Collection theme composition is cached by the freshly read installation revision
and exact current site theme inputs. The cache owns one bounded projection per
repository and returns independent copies. Page, settings and installation reads
remain live. Resource role inspection runs once at the final signing fence,
after credential resolution; no actor decision is retained across invocations.

Mongo selection and installation adapters retain bounded decoded records, gated
by a fresh, instance-scoped revision read on every `get`. Store mutations use CAS
and always increment the revision, including grants, credentials and observations.
A changed revision reloads and validates the full record; missing records and
failed revision reads cannot serve a cached decision. No TTL permits execution
without consulting the database. The cache belongs to one adapter/database.

Content rendering reuses the settings returned by its final route check rather
than issuing a third settings read. The two ordered route/settings reads still
detect path replacement and language migration. Docker also warms a basic Page,
then unpublishes it and checks that anonymous delivery immediately hides it.

Pinned HTTP connections use bounded keep-alive agents keyed by the dialled IP,
port and explicit Host authority (plus TLS settings for HTTPS). Each exchange
still resolves and validates DNS and obtains fresh invocation authority before
using a socket. Connections retain no actor or credential decision; the current
request supplies its own headers. DNS refusal never falls back to an idle socket.

Delegation ticket creation initializes its bounded bucket, prunes expired entries
and conditionally appends a ticket in one atomic Mongo update pipeline. Its
preimage determines admission, so concurrent capacity checks and duplicate-ticket
refusal keep their existing semantics. Authored record values are Mongo literals,
not aggregation expressions. The Docker journey exercises concurrent capacity,
child budgets, closure, expiration cleanup and literal preservation.

Named secret resolution checks metadata-read and resolve permissions together,
then reads one metadata record and one encrypted value. It verifies namespace
and name before reading the value and performs no value or credential caching.

`capabilities.describe` remains a capability invoked through Edge. Its metadata
lookup resolves the exact selected release and pinned ancestors and checks the
selection again before returning. It does not load transport configuration or
attest Provider readiness; actual dispatch retains those checks.

Installations `1.1.0` adds the control-only `gateway.dispatch.prepare` command.
It combines identity resolution, optional root delegation and token issuance.
The Edge sends the resulting business request through ordinary pinned HTTP.
Commands still resolve identity before their start audit. Failed preparation or
transport closes any issued root ticket; a binary response retains it until
completion or cancellation. The official `1.2.0` profile uses manifest `0.3.0`.
Existing published profiles stay pinned. After changing the control contract,
restart the stateless Edge so its startup report selects the exact ready pin.

Repository execution metadata can be read through `ProviderExecutionStateReader`.
The Mongo adapter reads only the requested installation revision headers, then
looks up the current selection revision. The selection remains the final database
read even when no installation matches; there is no speculative first selection
read. Covering indexes on the site, ID and revision fields allow header-only
execution without fetching either full document. The Provider initializes these
indexes before serving an instance. The reader reloads validated payloads only
when a revision changes, then rereads the headers after those payload loads. Warm
hits need only the initial header query. A conflicting read retries once and fails
closed if it remains unstable; a database error never serves cached authority.

Preparation, signing and native receipt use separate captures. The final signing
capture checks both the current route and the capability grant. Native receipt
prepares its admitted execution pins before consuming an already verified
capability lease; it does not reread site authority for that lease. The private
control channel performs one fresh capture on its warm path. Routing
hints choose IDs for a later database query and cannot retain an old destination. Every cache belongs to its adapter, and every
lookup includes the site. Access actor checks, secret resolution, Provider source
authorization and HTTP credential verification remain independent.

Installed Bloc catalogues use the same `projectBlocList` projection as local
Blocs. The projection omits executable `viewJS` payloads, filters hidden entries
before cloning and returns independent nested values. Behavior bytes remain
available through the dedicated Bloc view readers. This reduces allocation work
without caching visibility, actor authority or mutable site Bloc state.

Page rendering and usage analysis request the `rendering` Bloc list projection,
which also omits insertion examples, editor settings, slot editing schemas and
thumbnails. Catalogue callers retain those fields by default. Root constraints,
browser permissions, dependency tags, behavior presence and styles stay in both
projections; executable behavior bytes still use the dedicated view readers.


Authenticated resource preparation keeps its root ticket inside an opaque
`PreparedDelegation` until the final Access inspection. Identity and root
preparation can run concurrently; secret and source authority loads finish before
that inspection. The authority verifies the original actor's subject, role and
authorization revision, then checks the current route. Its callback supplies the
same verified actor to resource signing, which also checks the Provider alias
against the CMS subject and retains the independent final route/grant fence.
Standalone resource issuance still performs its own Access inspection.

A prepared root is bound to the site, request, installation and exact capability
release. It can be finalized once; cancellation, expiration and failed signing
close the root without returning a usable response. Only the ticket hash is
stored. This is an internal coordination API, with no new wire authority or
cross-request authorization cache. Receiving Providers and delegated child calls
retain their own current authorization checks.


Root finalization shares its final route/grant read with token signing. The
Provider injects `CatalogueGatewayRouteResolver.checkAuthority`, so this phase
uses one fresh execution-metadata capture after the actor inspection. The signing
callback performs no asynchronous reads. It binds the expected selection,
installation configuration, instance audience, manifest and requested release to
the root's prepared route before accepting that shared fence. Standalone token
issuance retains its own independent final route/grant check; the receiving
Provider still performs its separate authorization phases.


Native receipt lazily prepares the report's exact ready contract pins and their
admitted ancestry once per instance composition. Concurrent preparation shares
one promise; failure clears it for a later retry. Preparation can precede the
instance's first execution because provisioning imports those artifacts before
it marks the instance ready. No selection, grant or credential decision is cached.

Installed calls use the signed capability as a short-lived lease. Issuance still
checks the current actor, target selection, capability grant and readiness.
Native receipt checks the audience and admitted capability after the host has
verified the signature, expiry, current instance activity and current connection
key. A later selection, grant, configuration or installation-status change stops
new issuance; it does not recall an already signed call before its expiry. The
nominal lifetime is 30 seconds, with the existing five-second clock tolerance.
Expiry is checked again after asynchronous immutable preparation.

The authenticated control channel continues to read current site authority. A
cold or stale installation-ID hint may require a second fresh capture; the warm
path uses one. Specialization resolution uses admitted ancestry and current
concrete grants at issuance and on the control channel. Failed immutable
preparation is never reused. Failed authority reads cannot authorize a control
request. No secret values enter the execution-metadata cache. Cross-request actor decisions are not cached.


## Host authentication material

The Provider host joins the enabled credential, its encrypted secret and the
ready instance in one Mongo command for each authentication attempt. Every call
reads current credential activity, instance readiness and ciphertext. These
checks are independent of the signed capability lease described above.

A private cache per database/scope reader retains only the decrypted control and
invocation keys, bounded to 32 entries and 128 KiB of payload. It does not retain
session secrets, instance KEKs or authorization decisions. An entry is usable
only after a fresh join returns exactly the same ciphertext and IV. Missing,
disabled or changed records and database failures cannot fall back to cached
material. The cache is in process memory and has no disk persistence; JavaScript
string eviction does not guarantee immediate memory erasure.

Cold or changed material is decrypted and validated, then the reader repeats the
join before use. Revocation during decryption denies the call; rotation retries
once and persistent instability fails closed. A warm authentication uses one
command, while a cold one normally uses two. Mongo still performs indexed joins;
one wire command does not mean one physical document read.


## Named secret resolution

`CmsSecrets.resolveByName` can receive an instance-bound
`CmsSecretResolutionReader` through its constructor options. The production
Provider reader joins the namespace key, named metadata and encrypted value in
one Mongo command. It narrows metadata/value lookups by the key proof, namespace,
permissions, revocation and expiry; it never sends the raw namespace key to
Mongo. These filters do not replace the domain authorization check.

The domain independently validates the key and both required permissions,
checks metadata ownership and name, then requests decryption of the captured
ciphertext. Missing values and database errors fail closed. Every resolution
performs a new read and decrypt; no plaintext, key decision or previous result is
cached. Generic SecretStore-backed compositions keep the same domain checks and
sequential read path. Writes and rotations still use the existing metadata and
encrypted-value adapters.

A Provider's generic Gateway invocation can share an explicit initial route
context between resolution, host grants and outbound token issuance. This option
requires a transport that independently fences the route. The context belongs to
that invocation and site, keys reads by adapter identity and is never accepted
from invocation input or encoded in the HTTP wire authority. Access probes and
standalone route discovery retain independent current reads. Token signing
still performs its fresh final capture after secret resolution, so withdrawing a
grant or installation during preparation prevents the HTTP request from being
sent.

## Rendering resource reads

One `getPageRenderInputs` operation owns a `RenderingResourceReads` context.
The installed-collection adapter uses it to share one current collection state
between theme composition, text contributions, Bloc projections and Page
requirements. The matching local rendering catalogue is read once and returned
as independent objects. Resource entries are keyed by the exact adapter owner;
separate adapters and instances cannot share them even with equal site IDs.

This context never caches Pages, routes, settings, users, grants or secrets.
Route resolution still rereads the route and settings, including the migration
marker and language configuration. This is not a database snapshot. The context
is closed after success or failure, rejects late reads and is recreated for the
next rendering. Collection and text revisions remain part of the render cache
identity; removing a collection or hiding a Page remains visible on subsequent
requests.


The delivery performance journey also measures response caching and sustained
quota behavior. See [Content delivery](../architecture/content-delivery.md#shared-edge-response-cache)
for the current cache and invalidation guarantees. Installations 1.2.0 groups
explicit machine authentication and preparation while delegated calls preserve
their original actor inspection path. Profile 1.3.0 selects these minor contracts.
Mongo diagnostic ingestion uses one unordered majority-acknowledged bulkWrite
per validated batch. The (instanceId, id) unique index rejects conflicting
fingerprints; concurrent equal upserts are reconciled with one bounded majority
read. Errors other than verified duplicate races remain unacknowledged.
The twelve indexes include Mongo's _id index, tenant/ID uniqueness, reception
pagination, eight supported filter indexes and TTL cleanup. They are retained:
this change reduces network commands without deleting supported query paths.
