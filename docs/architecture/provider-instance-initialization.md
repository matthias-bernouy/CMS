# Provider Instance Initialization

Ulvia Provider owns instance creation and the exact official system profile.
The Edge does not install contracts, connect a provider, import a collection,
create an administrator or open durable stores. It starts only after an instance
is ready and receives that instance's opaque access token.

## Responsibility Boundary

Ulvia Provider owns:

- its durable instance registry and encrypted instance credentials;
- the exact official manifest and contracts assigned to a new instance;
- idempotent provisioning, transition recovery and the initial administrator
  grant;
- resolution of an installations control token to the isolated instance context
  used by public contract calls.

One Edge serves one already-provisioned instance. It owns
public HTTP presentation, provider-neutral Gateway execution and application of
validated response effects. Content, accounts, session tokens, files, Gateway
state, installation state and durable release-switch intents remain behind contracts. Edge
knows neither the Provider operator secret nor another instance's identity or
credentials.

## Installation Flow

The CLI manages one shared-services Compose project and one Edge project per
named instance. The same projects support a loopback installation or explicit
public binding with ACME TLS; there is no separate production mode. Shared
services must already be running (`ulvia services start`; a source CLI needs
an explicit initial `--version`). `ulvia instance create <name>`
then performs the following sequence:

1. Verify that the shared Provider is healthy and read its private operator
   connection from the local services state.
2. Call `POST /ulvia/operator/instances` with the operator Bearer, a stable
   idempotency key, Edge URL and initial administrator credentials.
3. Let the Provider create or resume the instance, generate its opaque token and
   isolated storage key, then install the exact official profile.
4. Persist the returned Edge connection inside the private named-instance directory.
5. Start the deployment Edge image with its public URL, installations Provider URL and
   `CMS_INSTALLATIONS_PROVIDER_TOKEN` only.
6. Report readiness only after the Edge health endpoint is reachable through
   the shared proxy.

Repeating `ulvia start` starts the shared services and every previously created
Edge without calling the provisioning endpoint again. `ulvia services ...`
manages the shared services without changing Edge containers, while
`ulvia instance ... <name>` creates, starts, stops and deletes named Edges.
`ulvia upgrade edge --version <version>` upgrades the existing Edges
sequentially; there is no per-instance upgrade subcommand or atomic fleet switch.
Nginx routes names through the configured shared ports. Instances
default to `<name>.localhost`; public instances receive an explicit immutable
domain during provisioning.
Deleting a named Edge disables its Provider instance and retains the Provider
data; it is not tenant-data erasure.
The CLI itself owns no server process: it only drives Compose. Restart reopens
persisted stores and resumes recoverable transitions.
`ulvia reset --yes` deliberately clears every local instance and shared store;
ordinary startup never repairs incompatible encrypted state by deleting it.

Packaged CLI releases embed an initial stack version. A first startup from
workspace source instead requires `ulvia services start --version <published-version>`;
later starts reuse the persisted image digests. Restarting or replacing an image
does not automatically upgrade an instance's exact profile or installed
collections.

## Bootstrap And Repository Connections

The Provider advertises exact profile references without reading optional
collection resources. It loads only the selected profile from its bundled
admitted snapshot when provisioning or recovering an unfinished transition.
The default `ulvia@1.2.0` and explicit `repository@1.2.0` profiles initialize
system APIs and the administrator with zero collections and zero Pages. Their
collection initialization step makes no collection source or content-store calls.
A Repository can start before its own Edge or public catalogue exists; API
authentication and publication then work without a browser login Page.

Production images generate `bun run generate:official-bootstrap --core-only`
and omit authored collections and starter assets. There is no required ZIP.
The full generator includes the current Mossa and Repository `1.1.0` releases
for explicit publication, authoring and example tests. Historical profile references
remain advertised, but provisioning an old profile requires an explicit snapshot
with its exact original manifest, contracts and optional collection resources. Missing resources refuse the operation rather than
falling back to the network. They do not prevent ready instances from restarting.
Current profiles select the official Provider manifest and `ulvia/cms.installations`
contract at `1.1.0`. Profile versions are independent from artifact versions.

## Optional Site Setup

New instances persist an explicit `ulvia-site-initialization/v1` marker during
provisioning. A missing marker is unavailable: reads never infer initialization
from zero Pages or backfill old instances. The Edge redirects a missing home Page
to `/.cms/setup` only while the admitted `initialization.entry` capability reports
pending. Existing successful Pages and non-home routes add no Gateway calls;
a missing home Page adds one bounded entry query.

The native HTML/CSS/module screens belong to Edge and require no collection.
Login uses ordinary `ulvia/cms.access` session effects. Status, recipe discovery,
review and application use `ulvia/cms.installations` through the same Gateway as
other contract calls. Only a currently authorized local administrator can read
or change setup; the public entry query reveals only the pending boolean.

The administrator chooses an empty site or an exact collection bootstrap.
Empty completion needs no Repository, collection or Page. Starter discovery uses
the configured Repository, four latest stable collections per page and at most
64 recipe cards. Mossa's `administration` recipe creates ordinary editable admin
Pages. Repository's `repository` recipe includes the exact Mossa recipe, omits its
login Page and supplies its own login and public catalogue Pages. Ordinary
collection installation or upgrade never executes a bootstrap.

Review resolves exact dependency pins and includes, checks selected capabilities,
route conflicts and browser-code risks, then simulates Pages against disposable
Content stores. It makes no durable business changes. The digest binds the
instance, administrator, execution fingerprint, revisions and complete plan.
Application recomputes that evidence before mutation. Limits include 16 collections,
32 recipes, 256 Pages, include depth eight, 32 MiB metadata and 32 MiB aggregate
assets, with a 60-second preparation deadline and bounded transport requests.

Application is an idempotent asynchronous operation. Its durable site intent holds
a maintenance fence while collections and Pages are written; receipts checkpoint
completed Pages. A resumed application uses already imported verified local
artifacts, including when the Repository is offline. It does not overwrite
completed Pages. The UI polls one status capability per second, reporting actual
Page counts and the latest operation outcome. A completed marker survives restart
and prevents the empty-site choice from reopening setup indefinitely.

The browser journey in
`tests/integration/instance/repository/initialization.docker.test.ts` covers native
login, Mossa review and application, mobile overflow, cross-instance review refusal,
offline empty completion and restart. Domain fault-injection tests cover persisted
checkpoints and local recovery. These are local validation flows, not evidence of
a deployment to a public site.

Ready instances reopen their approved persisted manifest, observed implementation
pins, exact contract admissions and selections. The runtime checks each digest
against its explicit implementation support matrix and compiles HTTP bindings
per authenticated instance. The historical installation profile is not execution
authority, and its collection resources are not needed in the image to reopen a
site. Missing or unsupported installed state fails without repairing data.

`CMS_REPOSITORY_URL` remains required by the Provider; the CLI supplies
`https://repo.ulvia.fr` by default and persists an explicitly selected origin.
Discovery, remote imports and publication use that connection after bootstrap.
A new Registry has its own account-owned public catalogue: installing its
bootstrap resources is not publication into that catalogue.

The local Docker regression `tests/integration/instance/repository/scratch.docker.test.ts`
checks API-only creation, initially empty Pages/catalogue/collection installations,
explicit publication and installation of a new collection, omitted image starter
directories and state after Provider restart. It uses isolated networks and never
contacts the public Repository.

## Operator API

Every endpoint requires
`Authorization: Bearer <ULVIA_PROVIDER_OPERATOR_TOKEN>`:

- `GET /ulvia/operator/instances` lists instances;
- `GET /ulvia/operator/profiles` lists supported exact references and the default;
- `POST /ulvia/operator/instances` creates or resumes an instance and requires
  `Idempotency-Key`;
- `GET /ulvia/operator/instances/:instanceId` returns lifecycle state;
- `POST /ulvia/operator/instances/:instanceId/disable` disables its connection;
- `POST /ulvia/operator/instances/:instanceId/profile` starts an exact declared
  profile upgrade.

Creation returns the instance record and the raw `instanceAccessToken`. The
registry stores only the incoming token hash and the encrypted secrets needed
inside the Provider. The raw access token has no claims; Provider resolves it
server-side and never asks Edge for an instance ID header.

## Public Composition

Public installation uses the same CLI flow in two phases:

1. start shared MongoDB, proxy and Provider services, then create the instance
   through the operator API using the image-owned admitted profile;
2. start one Edge with the returned access token, canonical domain and the
   Provider's private network URL.

Ulvia Provider needs access to its control-plane database and isolated instance
databases. Its MongoDB account is provisioned idempotently before the Provider
starts and those credentials are never passed to Edge.

## Recovery And Limits

Profile transitions durably record their plan version, lease owner, completed
steps and failure. Provisioning records `manifest`, `provider`, `contracts`,
`collection` and `administrator`; upgrades omit the administrator step. The
Provider continuously recovers queued transitions and running transitions whose
lease expired. It retains the encrypted bootstrap administrator secret only
until the durable administrator step is confirmed, including crash recovery.

Failed transitions require an explicit retry, and the active profile changes
only after every step succeeds. A disabled instance rejects report and contract
traffic. Backup, restore, complete tenant-data deletion and instance-token
rotation remain explicit lifecycle work rather than hidden Edge startup
behavior. Shared Provider MongoDB-user provisioning is handled by deployment
infrastructure; the Edge never receives those credentials.
