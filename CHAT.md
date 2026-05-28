# Brainstorm: tenant-provisioners -> CMS data providers

## Context

The current `official-tenant-provisioners/` directory comes from an older phase
where CMS core, hub/provisioning, deployment lifecycle, and external data access
were mixed together.

The current product direction is different:

- The CMS should connect to external data providers.
- The admin UI should discover, browse, secure, configure, and visualize those
  data surfaces.
- Deployment/provisioning of tenants is no longer the core concern of this repo.

So the main architectural shift is:

> Stop thinking "services the CMS provisions"; start thinking "data surfaces a
> provider exposes so the CMS can administer and consume them".

## Current Diagnosis

`official-tenant-provisioners/` contains useful ideas, but the package boundary
and vocabulary are wrong for the current CMS.

The directory currently mixes two separate concerns:

1. Provisioning / lifecycle / hub infrastructure:
   - `/admin/*` superadmin plane.
   - tenant provisioning, update, deprovisioning.
   - `TenantRegistry`.
   - `_issuer-kit`.
   - multi-issuer allowlists.
   - immutable provisioning/audit machinery.

2. Data-provider contract pieces:
   - JWT per request.
   - `iss`, `aud`, `sub`.
   - opaque pairwise user subject per provider.
   - OpenAPI discovery.
   - `problem+json`.
   - schema annotations like `x-widget`, `x-writable-by`, `x-visible-if`.
   - helpers for config visibility and writable fields.

The first group is legacy for the CMS core. The second group is close to the
desired data-provider contract and should be salvaged.

## What To Remove Or Retire

These concepts should not survive in the CMS data-provider model:

- `tenant-provisioner` naming.
- `_issuer-kit` as a hub/control-plane issuer.
- `_tenant-provisioner-contract` as a provisioning contract.
- `/admin/*` provider provisioning plane.
- `POST/PATCH/DELETE /admin/tenants`.
- `TenantRegistry` and tenant lifecycle state.
- deprovisioning hooks.
- multi-tenant provisioning semantics.
- heavy audit/log visibility machinery before concrete use cases exist.

Some code may still be reusable internally, but the concepts should not remain
as public architecture.

## What To Keep

Useful pieces to pivot into a CMS data-provider contract:

- JWT verification.
- CMS-signed provider calls.
- `aud = providerId`.
- `iss = CMS instance URL`.
- `sub = opaque pairwise user id for this provider`.
- short-lived tokens.
- JWKS-based key verification and rotation.
- OpenAPI ingestion.
- `problem+json` errors.
- schema/UI hints.
- helpers like:
  - `stripWriteOnly`
  - `x-writable-by`
  - `x-visible-if`
  - tenant/admin scope checks, renamed to CMS/provider scope language.

## Target Model

### Discovery

Each provider should expose a small discovery document, for example:

```txt
/.well-known/cms-data-provider
```

This document should expose:

- provider id
- display name
- contract version
- OpenAPI URL
- auth/JWKS expectations
- capabilities location or inline capabilities
- optional dashboard templates
- optional log support

### OpenAPI As The Technical Base

OpenAPI should be the base format for discovering available operations.

OpenAPI gives the CMS:

- endpoints
- methods
- query parameters
- request bodies
- response schemas
- security schemes

But OpenAPI alone does not explain the CMS admin experience. Add optional
CMS-specific extensions:

```yaml
paths:
  /orders:
    get:
      x-cms-entity: orders
      x-cms-view: list
      x-cms-label: Orders
      x-cms-capabilities:
        - orders:read
```

Potential extensions:

- `x-cms-entity`
- `x-cms-view`
- `x-cms-label`
- `x-cms-capabilities`
- `x-cms-widget`
- `x-cms-field`
- `x-cms-hidden`
- `x-cms-sensitive`
- `x-cms-dashboard`

The provider remains valid OpenAPI, but the CMS can build a richer admin UI
when these hints exist.

### Auth And Proxy

The browser should not call providers directly.

Flow:

1. Admin UI calls the CMS.
2. CMS verifies the user session.
3. CMS checks local role/capability mapping.
4. CMS proxy signs a short-lived JWT for the provider.
5. Provider verifies the CMS signature through CMS JWKS.
6. Provider handles the request.
7. CMS records proxy-level structured logs.

JWT shape:

```json
{
  "iss": "https://cms.example.com",
  "aud": "provider-id",
  "sub": "opaque-pairwise-user-id",
  "iat": 123,
  "exp": 123,
  "jti": "..."
}
```

Recommended simplification versus the old contract:

- one CMS issuer for a CMS instance;
- no hub/control-plane issuer;
- no provider-side tenant registry;
- keep JWKS for rotation instead of pinning one static key forever.

### Permissions

Preferred design: capability catalog declared by the provider, assigned by the
CMS.

The provider declares operation capabilities:

```yaml
x-cms-capabilities:
  - customers:read
  - customers:write
```

The CMS stores:

- roles
- users
- role -> capability mappings
- optional provider-specific role presets

The proxy only forwards/signs calls that the current CMS user is allowed to
perform.

This gives:

- centralized admin UX;
- provider-declared semantics;
- no need for the provider to know CMS roles;
- less coupling than hardcoding every provider-specific rule inside the CMS.

Rejected or lower-priority alternatives:

- Provider owns all authorization through an `/authz` endpoint.
  - Useful only if many independent frontends consume the same provider.
- CMS owns all permissions without provider-declared capabilities.
  - Too coupled; CMS must understand the semantics of every endpoint itself.

### Dashboards

Dashboards should be CMS-owned and editable.

The provider may propose dashboard templates, but should not ship arbitrary
admin HTML.

Example template:

```json
{
  "id": "orders-overview",
  "title": "Orders",
  "widgets": [
    {
      "type": "metric",
      "query": "GET /orders/stats",
      "value": "$.total"
    },
    {
      "type": "table",
      "query": "GET /orders",
      "columns": ["id", "email", "status", "createdAt"]
    }
  ]
}
```

The CMS should allow editing:

- columns
- labels
- filters
- widgets
- visibility
- capability requirements

### Logs

Start with proxy-level logs inside the CMS. They are immediately available
because every provider call goes through the CMS.

Minimum proxy log fields:

- timestamp
- request id
- CMS user id
- provider id
- endpoint
- method
- HTTP status
- duration
- capability checked
- pairwise provider subject, if present

Provider-side logs should be optional at first. If added, keep the contract
minimal:

```json
{
  "ts": "2026-05-28T12:00:00.000Z",
  "level": "info",
  "event": "orders.synced",
  "providerId": "orders",
  "sub": "opaque-user-id",
  "ctx": {}
}
```

Avoid rebuilding the old heavy visibility/redaction/sinks machinery until a
real product use case requires it.

## Proposed Package Shape

Possible target structure:

```txt
packages/
  cms-data-provider-contract/
    src/
      discovery/
      openapi/
      capabilities/
      auth/
      logs/

  cms-data-provider-sdk/
    src/
      auth/
      jwks/
      problem/
      openapi/
      helpers/

  cms-control/
    src/
      data-providers/
        import/
        proxy/
        permissions/
        dashboards/
        logs/

examples/
  data-providers/
    addresses/
    notes/
```

Alternative if examples should stay workspace packages:

```txt
data-providers/
  addresses/
  notes-example/
```

`addresses` is a good stateless/read-only example.

`cms-control` should only remain a provider if it truly exposes CMS data as a
provider. If it only exists to provision CMS tenants, it should be removed from
this track or moved out of `CmsCore`.

## Open Questions

1. Should example providers live inside `CmsCore` as conformance fixtures, or in
   separate repos?
2. Should discovery use a CMS-specific well-known endpoint only, or also reuse
   OAuth metadata for JWKS discovery?
3. Do dashboards belong in OpenAPI extensions, a separate `dashboards.json`, or
   both?
4. Should provider-declared capabilities be flat strings only, or structured as
   `{ resource, action }`?
5. Do provider calls used by public Delivery pages and admin CMS screens share
   the same capability model, or do they need separate surfaces?

## Action Plan

### Phase 1: Freeze The Old Concept

- Stop adding features to `official-tenant-provisioners/`.
- Mark the directory as legacy in documentation.
- Document which pieces are candidates for extraction.
- Avoid coupling new CMS work to the tenant-provisioner vocabulary.

Success criteria:

- No new code depends on `tenant-provisioner` concepts for CMS data access.
- The repo has a written migration direction.

### Phase 2: Define The Minimal Data Provider Contract

Create a small contract package or draft spec that defines:

- discovery document;
- provider id;
- OpenAPI URL;
- JWT claims;
- JWKS verification expectations;
- capability declarations;
- basic error format.

Keep it intentionally smaller than the old tenant-provisioner contract.

Success criteria:

- A provider can declare itself.
- The CMS can import it.
- The CMS can know which endpoints exist.
- The CMS can know which capability each operation requires.

### Phase 3: Build A Reference Provider

Use a simple provider to validate the contract.

Good candidates:

- `addresses`: read-only/stateless external API wrapper.
- `notes`: local toy provider with list/detail/create/update/delete to validate
  CRUD, permissions, and dashboard widgets.

Success criteria:

- Provider exposes discovery.
- Provider exposes OpenAPI with `x-cms-*`.
- Provider verifies CMS-signed JWT.
- Provider returns `problem+json` on errors.

### Phase 4: Implement CMS Import

In `cms-control`, add an ingestion path:

- fetch discovery document;
- fetch OpenAPI;
- validate contract version;
- extract entities/views/capabilities;
- store provider registration;
- display provider resources in admin UI.

Success criteria:

- An admin can register a provider.
- The CMS can show discovered endpoints/entities.
- Capabilities are visible and assignable.

### Phase 5: Implement The Proxy

Add a CMS-side proxy:

- map CMS route to provider operation;
- check CMS session;
- check role -> capability;
- resolve pairwise `sub`;
- mint short-lived JWT;
- forward request server-to-server;
- log the call.

Success criteria:

- Browser never calls provider directly.
- Unauthorized calls stop in the CMS.
- Authorized calls reach provider with a valid CMS JWT.
- Proxy logs are queryable in the CMS.

### Phase 6: Add Editable Dashboards

Start with generated views from OpenAPI:

- list view;
- detail view;
- simple metric widgets;
- filters from query parameters.

Then support provider-proposed dashboard templates.

Success criteria:

- CMS can generate a basic admin surface from OpenAPI.
- Admin can customize labels, columns, filters, and widgets.
- Customizations are stored in CMS, not hardcoded in the provider.

### Phase 7: Decommission Or Extract Legacy Code

Once the new data-provider path works:

- move reusable JWT/JWKS/problem/schema helpers into the new packages;
- delete or archive provisioning-only code;
- remove tenant-provisioner docs from the active path;
- decide whether old providers become examples or are removed.

Success criteria:

- Active code no longer exposes tenant-provisioner concepts.
- New provider examples are based on the CMS data-provider contract.
- Tests cover import, proxy auth, capabilities, and at least one dashboard flow.

## Implemented Direction

The current implementation follows this split:

- `packages/cms-data-provider-contract`: shared discovery, OpenAPI extension,
  registration, auth-claim, dashboard, log, and problem types.
- `packages/cms-data-provider-sdk`: CMS-side import/proxy helpers, provider-side
  mount/auth helpers, in-memory provider registry, in-memory proxy-log registry,
  and in-memory CMS issuer/JWKS implementation.
- `packages/cms-data-provider-examples`: reference providers for addresses,
  notes, and metrics.
- `images/cms-dp-examples`: Docker image that serves all example providers for
  import testing.
- `packages/cms-control`: Settings-based provider import/management, Data
  workspace, CMS JWKS endpoint, provider proxy, and proxy access logs.

### Context Model

Provider operations now use explicit contexts:

```txt
public   -> no end-user subject required
end-user -> requires a pairwise opaque end-user subject
admin    -> CMS admin context; default when x-cms-context is absent
```

OpenAPI declares this with:

```yaml
x-cms-context: admin | end-user | public
```

The CMS proxy mints a short-lived JWT containing:

```json
{
  "iss": "cms issuer",
  "aud": "provider id",
  "sub": "optional pairwise subject",
  "ctx": "admin | end-user | public",
  "cap": ["optional:capability"]
}
```

The provider verifies the CMS JWT through the CMS JWKS endpoint and can reject a
call whose token context does not match the route context.

### Capability Rule

Capabilities are coarse CMS/admin permissions. They are useful for limiting
what CMS admins can see or trigger in the admin UI.

They are not the primary model for dynamic end-user resource authorization such
as `cart:read:100011` or `order:read:abc`. End-user resource ownership and
dynamic ACLs remain provider-owned, using the pairwise `sub` as the stable
identity handle.

### Admin Versus End-User Surfaces

Providers should expose distinct surfaces when the business meaning differs:

```txt
/admin/orders   -> admin context, global back-office view
/me/orders      -> end-user context, current user's own data
/public/catalog -> public context
```

The CMS Data tab only visualizes admin data surfaces for now. End-user and
public operations are imported and represented in the contract, but are meant
for delivery/runtime use rather than the admin data browser.

### Current Verification Commands

```bash
bun run typecheck
bun test packages/cms-data-provider-contract/tests packages/cms-data-provider-sdk/tests packages/cms-data-provider-examples/tests packages/cms-control/tests/control/data-providers.test.ts
cd packages/cms-control && bun run build
docker compose -f images/cms-dp-examples/compose.yml build cms-dp-examples
```
