# Provider Instance Initialization

Ulvia Provider owns instance creation and the exact official system profile.
The Kernel does not install contracts, connect a provider, import a collection,
create an administrator or open durable stores. It starts only after an instance
is ready and receives that instance's opaque access token.

## Responsibility Boundary

Ulvia Provider owns:

- its durable instance registry and encrypted instance credentials;
- the exact official manifest, contracts and collection assigned to a new
  instance;
- idempotent provisioning, transition recovery and the initial administrator
  grant;
- resolution of an installations control token to the isolated instance context
  used by public contract calls.

One Kernel serves one already-provisioned instance. It owns Page rendering,
public HTTP presentation, provider-neutral Gateway execution and application of
validated response effects. Content, accounts, session tokens, files, Gateway
state, installation state and migration journals remain behind contracts. Kernel
knows neither the Provider operator secret nor another instance's identity or
credentials.

## Installation Flow

The CLI manages one shared-services Compose project and one Kernel project per
named instance. The same projects support a loopback installation or explicit
public binding with ACME TLS; there is no separate production mode. Shared
services must already be running (`ulvia start` on a
fresh installation, or `ulvia services start`). `ulvia instance create <name>`
then performs the following sequence:

1. Verify that the shared Provider is healthy and read its private operator
   connection from the local services state.
2. Call `POST /ulvia/operator/instances` with the operator Bearer, a stable
   idempotency key, Kernel URL and initial administrator credentials.
3. Let the Provider create or resume the instance, generate its opaque token and
   isolated storage key, then install the exact official profile.
4. Persist the returned Kernel connection inside the private named-instance directory.
5. Start the deployment Kernel image with its public URL, installations Provider URL and
   `CMS_INSTALLATIONS_PROVIDER_TOKEN` only.
6. Report readiness only after the Kernel health endpoint is reachable through
   the shared proxy.

Repeating `ulvia start` starts the shared services and every previously created
Kernel without calling the provisioning endpoint again. `ulvia services ...`
manages the shared services without changing Kernel containers, while
`ulvia instance ... <name>` creates, starts, stops, upgrades and deletes Kernels
independently. Nginx routes names through the configured shared ports. Instances
default to `<name>.localhost`; public instances receive an explicit immutable
domain during provisioning.
The CLI itself owns no server process: it only drives Compose. Restart reopens
persisted stores and resumes recoverable transitions.
`ulvia reset --yes` deliberately clears every local instance and shared store;
ordinary startup never repairs incompatible encrypted state by deleting it.

## Operator API

Every endpoint requires
`Authorization: Bearer <ULVIA_PROVIDER_OPERATOR_TOKEN>`:

- `GET /ulvia/operator/instances` lists instances;
- `POST /ulvia/operator/instances` creates or resumes an instance and requires
  `Idempotency-Key`;
- `GET /ulvia/operator/instances/:instanceId` returns lifecycle state;
- `POST /ulvia/operator/instances/:instanceId/disable` disables its connection;
- `POST /ulvia/operator/instances/:instanceId/profile` starts an exact declared
  profile upgrade.

Creation returns the instance record and the raw `instanceAccessToken`. The
registry stores only the incoming token hash and the encrypted secrets needed
inside the Provider. The raw access token has no claims; Provider resolves it
server-side and never asks Kernel for an instance ID header.

## Public Composition

Public installation uses the same CLI flow in two phases:

1. start the repository and Provider, then create the instance through the
   operator API;
2. start one Kernel with the returned access token, canonical domain and the
   Provider's private network URL.

Ulvia Provider needs access to its control-plane database and isolated instance
databases. Its MongoDB account is provisioned idempotently before the Provider
starts and those credentials are never passed to Kernel.

## Recovery And Limits

Profile transitions durably record their plan version, lease owner, completed
steps and failure. Provisioning records `manifest`, `provider`, `contracts`,
`collection` and `administrator`; upgrades omit the administrator step. The
Provider continuously recovers queued transitions and running transitions whose
lease expired. It retains the encrypted bootstrap administrator secret only
until the durable administrator step is confirmed, including crash recovery.

Failed transitions require an explicit retry, and the active profile changes
only after every step succeeds. A disabled instance rejects report and contract
traffic. Backup, restore, deletion, instance-token rotation and automatic
MongoDB-user provisioning remain explicit lifecycle work rather than hidden
Kernel startup behavior.
