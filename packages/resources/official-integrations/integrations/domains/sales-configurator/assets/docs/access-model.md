# V1 access model

Authorization is enforced at two server boundaries:

1. CmsCore's source proxy checks the session role and the exact endpoint URN.
2. The connector checks the CMS integration secret, caller context, ownership,
   version state, and share capability.

UI visibility is never treated as authorization.

## CMS administrator

Catalogue and global proposal endpoints use `access: "admin"`. The source
injects both `x-cms-user-id` and `x-cms-user-role`; admin routes require the
exact `admin` role in addition to the shared integration secret.

Administrators can:

- create, publish, and archive catalogue data;
- manage contextual feature pricing and prerequisites;
- inspect every client, proposal, version, and event;
- perform explicitly supported status transitions.

## Sales partner

Partner endpoints use `access: "auth"` so the source proxy requires a valid CMS
session and can inject a trusted subject. Gateway authentication alone does not
make the caller a sales partner: every route resolves an active
`partner_accounts` row and the required integration capability.

The connector:

- derives the actor only from computed `x-cms-user-id`;
- resolves the partner account from that actor;
- checks `status = active` and the route capability;
- never accepts an owner or partner id in query/body input;
- passes the derived actor to ownership-aware SQL functions;
- scopes clients and proposals to that actor;
- returns `404` for a resource owned by another actor.

Partner route capabilities:

- authenticated catalogue reads require an active account;
- client mutations require `clients.manage`;
- draft reads/writes require `proposals.manage`;
- publication requires `proposals.publish`;
- share creation and revocation require `proposals.share`.

These capabilities are deliberately independent from the CMS role system.
CmsCore currently assigns one role to a user, custom roles are not composable,
and the integration definition can only auto-grant `public` and `auth`
endpoints to built-in roles. The integration therefore does not create or
require a `sales-partner` CMS role.

## Client

V1 does not require a client account. `getSharedProposal` is a public source
endpoint guarded by an opaque share token:

- 32 cryptographically random bytes;
- only a SHA-256 hash is persisted;
- bound to one published proposal version;
- optionally expiring;
- explicitly revocable;
- response uses `Cache-Control: private, no-store`.

Because the raw token is a bearer credential in the page URL, the page hosting
`sales-proposal-view` should send `Referrer-Policy: no-referrer`, avoid
third-party resources, and never place analytics identifiers derived from the
token in logs or events.

The endpoint returns a dedicated client projection containing only:

- proposal reference and public status;
- client-facing title/introduction;
- published snapshot module, variant, feature, and custom lines;
- fixed total, quote-item count, and publication date;
- non-sensitive sales contact fields snapshotted into the proposal.

It never returns:

- client or partner internal notes;
- catalogue draft identifiers or pricing rules;
- ownership identifiers;
- event metadata;
- token hashes;
- other versions.

Authenticated client ownership can be added later without changing proposal
versions or shares.

Natural link expiry makes the token immediately unavailable but does not
rewrite the proposal's business status in the background. V1 status changes
remain explicit audited transitions; a later scheduled maintenance job may
reconcile expired engagement states.

## Source header policy

Every connector endpoint receives the generated bearer secret. Actor-aware
contracts additionally inject:

```json
{
  "name": "x-cms-user-id",
  "source": { "from": "computed", "ref": "userID" }
}
```

Admin contracts also inject `x-cms-user-role`. Incoming browser authorization,
cookies, hosts, and identity headers are not forwarded by the source runtime.

## Supabase boundary

The schema is private to `public`, `anon`, and `authenticated`; their table and
function privileges are revoked. All tables have RLS enabled and forced.

The Edge Function uses a Supabase secret key and `service_role`, so RLS is
defense in depth rather than the ownership authority for function calls.
Ownership must be present in every SQL read/write predicate.

Privileged database functions:

- live in the private schema;
- set `search_path = ''`;
- use security invoker by default;
- never infer authorization from `user_metadata`;
- keep ownership validation and mutation in the same short transaction.

## Required negative tests

- public callers cannot call partner endpoints;
- an authenticated user without an active partner account is rejected;
- suspended partners and partners missing the route capability are rejected;
- caller headers cannot be spoofed;
- partner A cannot list, read, update, publish, share, or revoke B's data;
- a missing, expired, revoked, or unknown share token returns the same response;
- client projection does not contain any private field;
- published versions and items remain immutable;
- totals and prerequisite decisions supplied by the browser are ignored.
