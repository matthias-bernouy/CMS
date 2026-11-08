# Provider Instance Initialization

The Provider installs the image-owned system APIs for every new instance. The
Edge is a separate stateless process; it receives an opaque instance token and
uses the public Provider report and admitted capabilities. It neither provisions
databases nor implements a second authentication system.

## Technical creation

`ulvia instance create <name>` calls `POST /ulvia/operator/instances` with a stable
idempotency key, the public and private Edge addresses, and initial administrator
credentials. The Provider allocates isolated storage and encrypted credentials,
imports its SDK-generated manifest and system contracts, connects its own account,
selects those contracts and grants the administrator. It installs no collection,
creates no Page and publishes nothing into a public Repository catalogue.

The CLI saves the returned connection privately and starts that instance’s Edge.
Services startup owns shared MongoDB, proxy and Provider processes; the CLI owns
no listener. Restart reuses stored credentials and installed pins. Deleting an
Edge disables its instance and retains Provider data; it is not tenant erasure.

There are no named application profiles, profile discovery endpoint, `--profile`
option or `upgrade-profile` command. A durable system installation plan records
exact manifest and contract pins rather than an application name/version.
Image replacement does not implicitly change installed contracts or collections.

## Choosing a Repository

After ordinary Access login, `/.cms/setup` offers three separate buttons:

- **A Repository address** opens an origin input.
- **The official Repository** selects `https://repo.ulvia.fr`.
- **A new Repository** installs Registry from admitted image resources and uses
  this instance’s public Edge origin.

The URL belongs to the instance, in `ProviderInstanceRecord.repository.url`.
New instances start with the official URL and `configured: false`; no `local` or
`remote` mode is persisted. `CMS_REPOSITORY_URL` and the shared CLI installation’s
Repository connection are removed. Older ready instance records can omit this
new optional setting: reading the default neither writes state nor restarts setup.

The `ulvia/cms.installations@1.3.0` setup capabilities are:

- `initialization.repository.get`: `GET /initialization/repository` reads settings
  and projects Registry creation status from its instance transition.
- `initialization.repository.configure`: `POST` at the same path performs one
  atomic revision-checked URL update, without installing anything.
- `initialization.repository.create`: `POST /initialization/repository/create`
  awaits a durable Registry instance transition and returns its completed settings.

The two commands are naturally idempotent. There is no SDK operation queue entry
or pending-choice journal for either. Only the existing instance transition owns
Registry's lease, checkpoints, failure and recovery. It commits the self-origin URL
with ready state after successful selection. A lost completion acknowledgement is
reconciled without replaying business steps. A changed URL cannot overwrite a
concurrent creation: the instance revision and lifecycle state fence those writes.

Only a current local administrator can configure the site. Subject aliases resolve
through the existing authority store; members, delegated Providers, machine actors
and foreign instances cannot use setup. Registry transition recovery rechecks the
administrator's current grant. No new login or private Edge API exists.

Registry availability follows its installed/selected contract, never a hostname.
An autonomous catalogue starts empty and requires explicit publication through
ordinary CMS accounts and PATs. System bootstrap metadata is not catalogue
publication. Choosing a remote source needs no network request; an empty site can
finish setup while that source is unavailable.

The public self-origin is retained in settings. For this exact origin only, the
runtime connects to the known private Edge URL, avoiding host/container loopback
confusion. Other origins are used as supplied. Selecting an HTTP origin explicitly
permits HTTP transport; redirect refusal and PAT origin/identity pinning still
apply. Changing the source affects future discovery/imports and authoring
connections. It never replaces installed release pins or forwards an existing
publication PAT to a different origin.

## Collection setup

The Repository step precedes the existing empty-site or collection choice.
Native HTML/CSS/modules belong to Edge and need no authored collection. Ordinary
`ulvia/cms.access` session effects authenticate every request; the remaining
screens use admitted Installations capabilities through the Gateway.

New instances have an explicit `ulvia-site-initialization/v1` pending marker.
Missing markers are unavailable: reads never infer setup from zero Pages or
backfill existing sites. A missing home Page adds one `initialization.entry`
query and redirects to setup only when pending. Successful Pages and other routes
retain their existing call counts. Empty completion leaves `/` at 404 until a
Page is published.

Recipe discovery reads explicitly published collections from the configured
Repository. The workspace ships no starter collection. Review resolves exact
pins, route conflicts, selected capabilities and browser-code risks without
business writes. Its digest binds the instance, administrator, execution state
and revisions. Application recomputes that evidence, imports verified resources
and checkpoints ordinary Content Pages under the site maintenance fence. Collection
installation or upgrade never implicitly replays a bootstrap recipe.

Preparation bounds remain 16 collections, 32 recipes, 256 Pages, include depth
eight, 32 MiB metadata and 32 MiB aggregate assets, with a 60-second deadline.
Resumed application uses verified local artifacts and preserves completed Pages.
The browser polls one setup status request per second while applying a recipe.

## Execution and recovery

Images generate `bun run generate:official-bootstrap` from the SDK inventory.
The resulting admitted contracts, documentation assets and Provider manifest are
local provisioning resources. Missing exact resources refuse provisioning without
a remote fallback. Ready/disabled instances reopen their approved persisted
manifest, observed implementations, admissions and selections independently of
that image snapshot.

Executable support requires an exact digest in the generated build matrix. The
explicit retained metadata list is linked to current SDK executors only after
checking every capability’s access, behavior, schemas, bindings and errors.
SemVer or a persisted claim alone cannot grant execution. Fixed retention metadata
is verified once per process; it contains no instance secrets or authority.

Provisioning journals manifest, Provider connection, contract selection, setup
marker and administrator steps under a renewable lease. Registry creation uses
the same durable transition mechanism and preserves every existing pin. Its Registry
release comes from the already approved manifest, independently of the image
bootstrap. Recovery resolves the exact plan from stored admissions; changing the
image never substitutes new contract or manifest pins. Its
administrator subject is rechecked against the instance’s current grant during
recovery. Bootstrap administrator credentials are removed once their durable step
is confirmed. Failed steps require explicit retry; queued/expired work is recovered.
Unfinished old transitions whose exact installation resources are unavailable must
finish with their original image. Ready sites are not reset or silently repaired.

Composition caches include the instance revision, so a completed source change
or Registry installation opens the updated composition on the next authenticated
request. Existing leases finish before resource disposal. Runtime authentication
already joins fresh instance metadata; this change adds no catalogue or remote
Repository lookup to each authenticated request.

## Operator API

All endpoints require `Authorization: Bearer <ULVIA_PROVIDER_OPERATOR_TOKEN>`:

- `GET /ulvia/operator/instances` lists lifecycle records.
- `POST /ulvia/operator/instances` creates/resumes with `Idempotency-Key`.
- `GET /ulvia/operator/instances/:instanceId` reads one lifecycle record.
- `POST /ulvia/operator/instances/:instanceId/disable` disables its connection.

Creation returns the opaque instance access token. Edge never receives the
operator secret, database credentials, KEKs or session signing secrets. Backup,
restore, tenant erasure and token rotation remain explicit lifecycle work.
