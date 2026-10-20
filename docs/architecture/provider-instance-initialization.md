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
- resolution of an instance token to the isolated instance context used by
  Provider and Kernel-protocol calls.

One Kernel serves one already-provisioned instance. It owns Page rendering,
public HTTP presentation and application of validated response effects. Content,
accounts, session tokens, files, gateway state, installation state and migration
journals remain behind the Provider. Kernel knows neither the Provider operator
secret nor another instance's identity or credentials.

## Local Flow

`ulvia dev new` associates the current project with a private environment and
starts this sequence:

1. Prepare and start the local immutable repository.
2. Start Ulvia Provider with its durable control-plane database, files root,
   encryption key and operator secret.
3. Call `POST /ulvia/operator/instances` with the operator Bearer, a stable
   idempotency key, Kernel URL and initial administrator credentials.
4. Let the Provider create or resume the instance, generate its opaque token and
   isolated storage key, then install the exact official profile.
5. Persist the returned Kernel connection inside the private environment.
6. Start Kernel with its public URL, Provider URL and
   `ULVIA_INSTANCE_TOKEN` only.
7. Report readiness after Kernel can authenticate and serve the installed
   official Pages.

Repeating `ulvia dev` reuses the same instance. Restart reopens persisted stores
and resumes recoverable transitions without provisioning a second instance.
`ulvia dev reset --yes` deliberately clears the selected local environment;
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

## Production Composition

Deployment automation provisions in two phases:

1. start the repository and Provider, then create the instance through the
   operator API;
2. start one Kernel with the returned access token and the Provider's private
   network URL.

Ulvia Provider needs access to its control-plane database and isolated instance
databases. Those credentials are never passed to Kernel. See the
[deployment guide](../../infra/images/cms/README.md).

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
