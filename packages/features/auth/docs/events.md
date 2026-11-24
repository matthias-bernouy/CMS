# Account business Events

Access 1.2 declares `account.created` and `account.email-verified`. They describe
committed account facts; their payloads grant no identity, session or permission.
They contain an opaque instance-scoped `accountRef`, not a login subject or email
address. Consumers cannot use this reference as an actor credential.

`account.created` fires for a newly created CMS membership, including local public
signup, administrator/bootstrap creation and external-provider membership. A login
that refreshes an existing member emits no creation Event. The payload contains
`accountRef`, `provider` and the original `createdAt`. There is no historical
creation backfill when a newer Access implementation is selected.

`account.email-verified` records the first real ownership proof for the current
membership/reference. `method` is `email-link` or `password-reset`; the payload also
contains `accountRef`, `accountCreatedAt` and `verifiedAt`. An administrator's
preverified flag or the delivery-disabled login policy is not an ownership proof
and emits no such Event. A later reset of an already confirmed membership does
not emit the same fact again. Existing security email, token, cooldown and session
rules remain owned by Access and do not depend on optional workflows.

`get-event-account` is an administrator-only HTTP query accepting `accountRef`.
It returns the minimal current profile: `createdAt` and an optional sensitive
`email`. It exposes no internal subject, role, grant, password or token. Unknown,
foreign-instance and deleted references are not found. The reference alone grants
no read permission. Ordinary `get-user` semantics remain unchanged.

The optional official `ulvia/account-created-email` Workflow notifies a configured
team recipient using the text variables `accountRef`, `provider`, `createdAt`.
`ulvia/account-welcome-email` reads the minimal profile after a real proof, checks
the membership creation time and sends a configured template to that email. Its
variables are `accountRef`, `recipientEmail`, `verifiedAt`, `method`. Both require
explicit administrator installation/configuration, publication and activation.

Creation and proof mutations record an immutable delivery intent before any
business Event is published. Publication runs asynchronously with bounded batches,
leases and stable occurrence IDs. The source handoff retries for 24 hours from
the fact's timestamp, then records `PUBLICATION_EXPIRED` in scoped operator logs.
Broker delivery has its independent existing retry/retention rules. An expired
source handoff does not undo account creation or email verification.

Deleting a membership cancels its unclaimed source facts and invalidates its
reference. In-progress publication or email can still complete. Recreating the
same external identity creates a different reference. Delivery has no global FIFO
guarantee: use business timestamps, not arrival order. Gateway causal ancestry is
retained so a workflow-generated account mutation cannot silently reset loop
protection. No actor identity is inferred from the account being created.
