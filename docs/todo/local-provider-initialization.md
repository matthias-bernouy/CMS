# Provider Instance Initialization

**Status (2026-10-12): implemented for the local CLI and Provider API.**

Ulvia Provider owns instance creation and the exact official system profile.
The Kernel no longer installs contracts, connects a provider, imports a
collection or creates an administrator. It starts only after an instance is
ready and receives that instance's opaque connection token.

## Responsibility Boundary

Ulvia Provider owns:

- its durable instance registry and encrypted instance credentials;
- the exact official manifest, contracts and collection assigned to a new
  instance;
- idempotent provisioning and the initial administrator grant;
- resolution of an instance token to the isolated instance context used by
  provider calls.

One Kernel serves one already-provisioned instance. It owns that instance's
Page rendering, authentication, administration UI, assets and gateway
transport. It knows neither the Provider operator secret nor another
instance's identity or credentials.

## Local Flow

The development CLI performs this sequence:

1. Start the private official repository.
2. Start Ulvia Provider with its durable control-plane database, files root,
   encryption key and operator secret.
3. Call `POST /ulvia/operator/instances` with the operator Bearer, a stable
   idempotency key, Kernel URL and initial administrator credentials.
4. Let the Provider create the instance record, generate its opaque token and
   isolated storage key, then install the exact official profile.
5. Persist the returned instance connection in the private local runtime
   directory.
6. Start the Kernel with only its instance database, files directory, Provider
   URL and `ULVIA_INSTANCE_TOKEN`.
7. Report readiness after the Kernel can authenticate and serve the installed
   official administration Pages.

Repeating the command reuses the same idempotent instance. A restart reopens
the persisted connection and durable stores without reinstalling a second
instance.

## Operator API

All endpoints require `Authorization: Bearer <ULVIA_PROVIDER_OPERATOR_TOKEN>`:

- `GET /ulvia/operator/instances` lists instances;
- `POST /ulvia/operator/instances` creates or resumes one instance and
  requires an `Idempotency-Key` header;
- `GET /ulvia/operator/instances/:instanceId` returns its lifecycle state;
- `POST /ulvia/operator/instances/:instanceId/disable` disables its connection.

Creation returns the instance record and the raw instance token. The registry
stores only the token hash used for incoming connection authentication and an
encrypted signing secret used for outgoing capability calls. The raw token is
not a contract token and carries no claims; the Provider resolves it to the
instance server-side.

## Production Composition

The production image contains separate repository, Provider and Kernel
processes. Deployment automation must provision in two phases:

1. start the repository and Provider, then create the instance through the
   operator API;
2. use the returned storage key to provision a MongoDB account limited to the
   instance database, then start the Kernel with that scoped `MONGO_URL`, the
   storage key and the returned instance token.

Ulvia Provider needs a control-plane MongoDB account capable of opening its
registry and the isolated instance databases. That credential is never passed
to the Kernel. The Provider does not currently create MongoDB users; external
deployment automation must create the scoped Kernel account.

## Recovery And Limits

Provisioning records each completed step (`manifest`, `provider`, `contracts`,
`collection`, `administrator`) so an idempotent retry can resume safely. A
disabled instance rejects both report and contract traffic.

Backup, restore, deletion, instance-token rotation and automatic MongoDB user
provisioning remain explicit lifecycle work. They are not hidden inside Kernel
startup.
