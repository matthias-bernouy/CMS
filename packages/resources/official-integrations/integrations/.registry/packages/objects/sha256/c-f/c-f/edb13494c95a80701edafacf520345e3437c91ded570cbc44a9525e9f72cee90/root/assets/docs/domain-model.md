# V1 domain model

All tables live in the private `sales_configurator` schema. Identifiers are
`bigint generated always as identity` unless a value must cross an untrusted
boundary. Timestamps use `timestamptz`; money uses integer minor units.

## Catalogue

### `catalog_items`

Common identity for modules, variants, and features:

- `id`
- `kind`: `module | variant | feature`
- `code`: stable unique machine code
- `name`
- `description`
- `status`: `draft | published | archived`
- `sort_order`
- `created_at`, `updated_at`

The common identity makes prerequisites ordinary foreign keys instead of
polymorphic unverified identifiers.

### Subtypes

`catalog_modules` contains `item_id` as its primary and foreign key.

`catalog_variants` contains:

- `item_id`
- `module_item_id`
- optional `provider_name`
- `pricing_mode`: `fixed | quote`
- `unit_amount_cents`, required only for `fixed`
- `currency`, fixed to `EUR` in V1

`catalog_features` contains `item_id`.

Subtype writes are only exposed through transactional catalogue functions.
Those functions ensure the subtype matches `catalog_items.kind`.

### `variant_features`

Commercial relationship between a variant and a feature:

- `variant_item_id`, `feature_item_id`
- `availability`: `included | optional`
- `pricing_mode`: `included | fixed | quote`
- `unit_amount_cents`
- `sort_order`

Rules:

- included features must use `pricing_mode = included` and no amount;
- optional fixed features require a non-negative amount;
- optional quote features have no amount;
- a feature has no global price: pricing always belongs to this relationship.

### `catalog_requirements`

Simple all-of edges:

- `subject_item_id`
- `required_item_id`
- `created_at`

Self-dependencies are rejected. A trigger using a recursive CTE rejects any
insert or update that would create a cycle.

Requirement satisfaction:

- a required module is satisfied by selecting one of its published variants;
- a required variant is satisfied by selecting that exact variant;
- a required feature is satisfied when it is included or explicitly selected.

The server reports missing requirements as structured errors. It never adds a
commercial line silently.

## Sales-partner access

### `partner_accounts`

- `id`
- unique `cms_user_id`
- `status`: `active | suspended`
- `display_name`
- optional `contact_email`
- `created_at`, `updated_at`

This is a business entitlement, not a replacement for CMS authentication. The
opaque CMS user id (for example `local:<uuid>`) always comes from the source
proxy's computed request context. It is used only to resolve the integration
account at the connector boundary. Valid identifiers are compared
case-sensitively and stored byte-for-byte; surrounding whitespace and control
characters are rejected instead of normalized.

### `partner_capabilities`

- `partner_account_id`
- `capability`
- `created_at`

The composite primary key prevents duplicate grants. V1 capabilities are:

- `clients.manage`
- `proposals.manage`
- `proposals.publish`
- `proposals.share`

Capabilities are integration-owned because CMS users currently have one
non-composable role and integrations cannot provision custom roles and grants
reliably. Suspending the partner account immediately denies every partner
operation without changing the CMS identity.

## Sales-partner data

### `clients`

- `id`
- `partner_account_id`
- `company_name`
- optional `company_registration_number`
- `contact_name`
- optional `contact_job_title`
- `contact_email`
- optional `contact_phone`
- optional `address_line1`, `address_line2`, `postal_code`, `city`, and `country`
- optional private `notes`
- `created_at`, `updated_at`

`(id, partner_account_id)` is unique so proposals can use a composite foreign
key that proves client ownership. Only company, primary contact, and email are
required in V1; the legal and postal profile remains optional so a lead can be
captured before every detail is known.

### `proposals`

- `id`
- `partner_account_id`
- `client_id`
- stable unique `reference`
- `status`: `draft | shared | viewed | accepted | rejected | expired | archived`
- optional public title and introduction
- optional private notes
- `created_at`, `updated_at`

The `(client_id, partner_account_id)` foreign key prevents a proposal from being
attached to another partner's client.

### `proposal_versions`

- `id`
- `proposal_id`
- `version_number`
- monotonically increasing draft `revision`
- `state`: `draft | published | superseded`
- `currency`
- server-computed `fixed_total_cents`
- server-computed `quote_item_count`
- frozen public title and introduction
- frozen client company, registration number, postal profile, and primary
  contact details
- frozen sales contact name and email
- `created_at`, optional `published_at`

There is at most one draft and one currently published version per proposal.
Every successful draft save increments `revision`. Publication compares both
the draft id and revision supplied by the caller, so a stale editor cannot
publish changes saved in another tab.
Publishing a new version marks the previous published version as superseded in
the same transaction. Admin and partner version DTOs expose these frozen
headers, so inspecting history never substitutes current client or partner
profile data.

### `proposal_items`

Hierarchical snapshot lines:

- `id`, `proposal_version_id`, optional `parent_item_id`
- optional `catalog_item_id` for traceability
- `kind`: `module | variant | feature | custom`
- `origin`: `selected | included | requirement | custom`
- snapshot `code`, `label`, and `description`
- `quantity`
- `pricing_mode`: `included | fixed | quote`
- optional `unit_amount_cents`
- `currency`
- `sort_order`

Partner-created custom lines are quote-only in V1. Fixed custom pricing remains
an administrative future capability.

Published versions and their items cannot be updated or deleted. A database
trigger protects this invariant even if a future caller bypasses the Edge
Function.

## Sharing and events

### `proposal_shares`

- `id`
- `proposal_version_id`
- unique SHA-256 `token_hash`
- optional `expires_at`
- optional `revoked_at`
- `created_at`
- optional `first_viewed_at`, `last_viewed_at`
- `view_count`

The raw 32-byte token is returned once and never persisted.

### `proposal_events`

Append-only audit rows:

- `id`, `proposal_id`, optional `proposal_version_id`, optional `share_id`
- `event_type`
- `actor_type`: `admin | partner | client | system`
- optional `actor_id`
- bounded `metadata` JSON object
- `occurred_at`

V1 event types are `created`, `draft_saved`, `published`, `share_created`,
`share_revoked`, `viewed`, and `status_changed`.

Each valid public read updates the share's first/last timestamps and count. A
`viewed` event is appended only for the first read, avoiding an unbounded event
row for every refresh while retaining aggregate open tracking.

## Transactional invariants

The following operations are single database transactions:

- save a draft and replace its calculated snapshot;
- publish a version and supersede the former published version;
- create/revoke a share and append its audit event;
- record a view, aggregate timestamps/count, and append its first-view event;
- change a proposal status and append its audit event.

Every partner-owned function receives the actor CMS user id separately from
user input, resolves an active partner account with the required capability,
and applies ownership before reading or mutating a resource.
