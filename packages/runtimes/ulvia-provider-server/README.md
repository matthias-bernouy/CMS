# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, profile transitions
and recovery. The CMS Edge is a separate stateless process connected only
through the public Provider report and admitted contract capabilities.

For each instance, this runtime selects the account, local-credential,
session-token, administrator-grant, Emailer, content, collection, gateway and
Files adapters injected into `@bernouy/ulvia-provider`. Browser credentials are
resolved through the official `ulvia/cms.access` contract; outbound delivery
uses the `ulvia/cms.emailer.smtp` specialization of `ulvia/cms.emailer`, and no authentication store or session secret is
shared with the Edge.

New `ulvia@1.3.0` (default) and `repository@1.3.0` instances start with system
contracts and an administrator, but no collections or Pages. A Repository API
can therefore start before any public catalogue or browser interface exists.
Authenticate through `ulvia/cms.access` and publish resources through CLI/API;
initialization never publishes the bundled system releases to the catalogue.

Run `bun run generate:official-bootstrap --core-only` from the workspace root
before native startup to stage admitted system contracts, documentation and the
Provider manifest in this package's `dist/bootstrap`. Production images use
this snapshot and omit authored collections and compiled starter assets.
Discovery reads profile references only; provisioning reads the selected profile's
resources and never falls back to the configured public Repository. Set an absolute
`ULVIA_BOOTSTRAP_DIR` to select another pre-built snapshot. Public resource
discovery and explicit imports still use the configured Repository connection.

The full `bun run generate:official-bootstrap` remains available for authoring
and example tests. Exact `1.0.0` starter profiles retain their original meaning
and require an explicit matching historical snapshot for new or unfinished provisioning. A
core-only image refuses such provisioning when resources are absent. Existing
ready instances reopen from persisted execution and do not read their old kit.
The full generator emits current collections, not historical starter resources.
Profile versions are independent of contract and collection release versions.

New profiles persist a pending site-initialization marker. Edge serves native
setup at `/.cms/setup`; its ordinary Gateway calls use `ulvia/cms.installations@1.2.0`
for review and explicit asynchronous application. Starting empty works offline.
Optional bootstrap application imports exact verified releases, creates ordinary
Content Pages and checkpoints recovery under the site maintenance fence. Ready
instances with no marker are never silently initialized or backfilled. See
[initialization architecture](../../../docs/architecture/provider-instance-initialization.md).

```bash
bun --no-macros run packages/runtimes/ulvia-provider-server/src/index.ts
```

## Collection verification

One lazy CPU worker is shared across all open instances for collection metadata,
asset verification and publication-evolution checks used by the installation
surfaces, durable collection storage and initialization planner. Gateway dispatch,
credentials, authority checks and business writes remain on their owning paths.
The worker receives no environment credentials and never executes authored JavaScript.
It admits one active job and at most eight queued jobs, retaining at most 64 MiB
of input payloads. Each active job has a 30-second deadline; cancellation, worker
failure and shutdown release resources before a successor worker starts.

The host shares only immutable verified public evidence: 256 metadata summaries
within 4 MiB and eight admitted bundles within 32 MiB. Each cache bounds pending
loads to 16; canceled but unfinished loaders still occupy that capacity. Site
configuration, selected capabilities, browser approvals and installation actions
are rechecked separately and never cached as authority. Exact coordinate/digest
keys isolate releases, and failed loads can be retried.

The worker pool deliberately keeps queue, cancellation and lifecycle ownership in
one cohesive controller despite the file-size advisory; transport conversion and
wire types are separate modules. Responsiveness tests compare the host heartbeat
while verifying the same official Mossa artifact inline and in the worker. This
covers collection verification, not every authoring/compiler or documentation task.

## Paged collection catalogue

New profiles select `ulvia/cms.installations@1.2.0`, the Provider manifest at
`1.2.0` and (for a Repository instance) `ulvia/repository@1.1.0`. Existing sites keep
their exact approved manifests and selected releases; replacing an image does not
implicitly adopt these releases. Upgrade the Repository API before using its new
latest-collection route, then explicitly adopt the new installations API and
Mossa `1.2.0` on consuming sites.
For an existing Mossa site, create the ordinary Content Page at
`/admin/collections/releases` from the `application/admin/collection-releases`
example. A collection upgrade does not replay its bootstrap recipe or add Pages.

Latest discovery indexes coordinate heads from filenames, excluding yanked and
out-of-channel releases before pagination. It reads JSON only for the requested
page; one exact lookup uses an existence check and one metadata document. History
reads only one collection's filenames and hydrates only its requested page. Cold
views still scan filenames, with a 10,000-version bound per collection and a
10,000-head/16 MiB bound per channel. Three channel views and three in-flight
builds are the maximum. Publication or yank changes invalidate the views; shared
waiters recheck revisions and repeated concurrent changes refuse after three attempts.

The installations facade returns at most 25 verified summaries, within a 1 MiB
aggregate summary budget. No discovery assets are downloaded. Exact immutable
metadata is cached, while site revision and actions remain fresh. Mossa displays
one latest version per collection and opens history only on demand. Existing
all-release capabilities retain their previous semantics.
