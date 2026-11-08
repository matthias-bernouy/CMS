# @bernouy/ulvia-provider-server

Private production executable for the official Ulvia Provider HTTP server.
It owns the Provider listener, instance registry, encrypted runtime credentials,
instance persistence, authentication, gateway state, files, system installation transitions
and recovery. The CMS Edge is a separate stateless process connected only
through the public Provider report and admitted contract capabilities.

For each instance, this runtime selects the account, local-credential,
session-token, administrator-grant, Emailer, content, collection, gateway and
Files adapters injected into `@bernouy/ulvia-provider`. Browser credentials are
resolved through the official `ulvia/cms.access` contract; outbound delivery
uses the `ulvia/cms.emailer.smtp` specialization of `ulvia/cms.emailer`, and no authentication store or session secret is
shared with the Edge.

New instances receive system contracts and an administrator with zero collections
and Pages. The image-owned SDK snapshot bootstraps those APIs offline; setup then
offers a custom Repository address, the official Repository, or a new Registry on
this instance. There are no named profiles or global Repository environment settings.

Run `bun run generate:official-bootstrap` before native startup. Images bundle the
admitted system contracts, documentation and manifest in `dist/bootstrap` and omit
starter collections. `ULVIA_BOOTSTRAP_DIR` may select an absolute prebuilt snapshot.
Ready sites reopen approved persisted execution without their original image kit.

Native Edge setup at `/.cms/setup` uses ordinary Access login and
`ulvia/cms.installations@1.3.0`. The Repository URL is persisted per instance;
Registry creation has one durable instance transition and rechecks current
administrator authority. It uses the already approved manifest, including after
an image update; URL-only changes are atomic synchronous commands. Changing sources preserves installed pins and Pages. Starting empty
works offline, and a new Registry publishes nothing automatically. See
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
while verifying the same large synthetic collection inline and in the worker. This
covers collection verification, not every authoring/compiler or documentation task.

## Paged collection catalogue

New instances select Installations and Provider manifest `1.3.0`.
Explicit Registry activation adds `ulvia/repository@1.1.0`. Existing sites retain
their approved pins; replacing an image does not adopt the new releases.

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
metadata is cached, while site revision and actions remain fresh. Latest discovery
returns one version per collection; history is queried explicitly. Existing
all-release capabilities retain their previous semantics.
