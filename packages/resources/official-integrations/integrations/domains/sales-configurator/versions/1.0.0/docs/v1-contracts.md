# V1 contracts and UI artifacts

## Source endpoints

All endpoints target the `cms-sales-configurator` Supabase Edge Function.
Administrative and partner endpoints inject the CMS actor. Every endpoint
declares typed success and error outputs.

### Administrative catalogue

- `manageModules`, `manageModule`, `upsertModule`
- `manageVariants`, `manageVariant`, `upsertVariant`
- `manageFeatures`, `manageFeature`, `upsertFeature`
- `manageVariantFeatures`, `upsertVariantFeature`, `deleteVariantFeature`
- `manageRequirements`, `upsertRequirement`, `deleteRequirement`

Deletes are archive operations when referenced by a proposal snapshot.

### Administrative partners

- `managePartners`, `managePartner`, `upsertPartner`
- `setPartnerCapability`

The CMS administrator links a CMS user id, can suspend access immediately, and
assigns the small integration-owned capability set.

### Administrative proposals

- `manageProposals`
- `manageProposal`
- `transitionProposal`

These endpoints return the admin projection and event timeline.

### Sales partner

- `getPartnerCatalog`
- `listMyClients`, `getMyClient`, `saveMyClient`
- `listMyProposals`, `getMyProposal`
- `saveMyProposalDraft`
- `publishMyProposal`
- `createMyProposalShare`, `revokeMyProposalShare`

`saveMyProposalDraft` accepts contextual selections shaped as
`{ variantItemId, optionalFeatureItemIds[] }` and quote-only custom requests.
The response is the canonical server-calculated draft read model. Invalid
prerequisites return a structured `422` response with `missingRequirements`.

The source contract remains typed as object arrays. Native form serialization
may encode one entry as a JSON string and several entries as an array of JSON
strings. The Edge boundary normalizes that transport-only representation before
validation; blocs still submit through `cms-source-trigger` and never fetch
directly. Mutation identifiers are body fields, while read identifiers remain
query parameters.

### Public client

- `getSharedProposal`

The token is the sole public selector. A successful read atomically records the
view and returns the client projection.

## CMS dashboards

### Catalogue

`sales-configurator-catalog` uses tabs for:

- modules;
- variants;
- features;
- variant-feature pricing;
- prerequisites.

Each tab follows a table-to-detail flow. Associations and requirements remain
relational rows, not an opaque JSON editor.

### Proposals

`sales-configurator-proposals` provides:

- filters by owner, status, client, reference, and date;
- proposal detail with current version and totals;
- nested snapshot lines and quote-only requests;
- share state and event timeline;
- only the status actions allowed by the V1 transition table.

### Partners

`sales-configurator-partners` manages partner activation and capabilities. It
stores the immutable CMS user id used for authorization and optional
sales-facing contact information, but never credentials or CMS session data.

## Delivery blocs

V1 exposes four blocs, all using light DOM and the nearest page-level
`cms-binding-core`.

### `sales-proposal-list`

A transparent source controller for `listMyProposals`. Its authored default
content contains:

- loading skeleton;
- error state;
- explicit empty state;
- repeatable proposal cards;
- cursor pagination.

Filters use binding parameters, never `location.search` directly.

### `sales-proposal-starter`

The first-draft flow lists the current partner's clients, offers an inline
first-client form when none exists, loads the published catalogue, and submits
the initial proposal without accepting an owner or proposal id. Its success
link is configurable and leads to the builder.

### `sales-proposal-builder`

The editing controller performs no native network call. It:

- configures the draft and catalogue `cms-source` bindings;
- coordinates local selection controls and accessible disclosure;
- submits mutations through forms with `cms-source-trigger="submit"`;
- publishes `sales-proposals:changed` after successful mutations;
- renders server-returned prerequisite and total results;
- creates one-time bearer links and revokes existing links;
- restores the published selection when no newer draft exists;
- makes terminal proposals read-only.

Module, feature, and summary views remain authored basic-bloc recipes in V1
rather than becoming extra rigid custom elements.

### `sales-proposal-view`

A read-only transparent controller for `getSharedProposal`. Its default content
contains loading, invalid/unavailable, and loaded snapshot views. No admin or
catalogue endpoint is present in its DOM.

## Bloc editor contract

Each bloc editor exposes one constrained content slot accepting normal
components. Endpoint ids for builder/view mutations are locked. A generic
endpoint picker must not allow authors to substitute an arbitrary write
endpoint.

No bloc:

- creates its own `cms-binding-core`;
- calls `fetch`;
- reads technical editor URL parameters;
- treats iframe presence as an editor mode;
- calculates an authoritative price.

## Verification matrix

### Definition/import

- package discovery and hydration;
- Supabase connector manifest and generated secret;
- exact source endpoint modes and computed headers;
- all three dashboards validate against source contracts;
- all four blocs compile from their real resource bundles.

### Database

- subtype/kind consistency;
- contextual pricing constraints;
- prerequisite cycle rejection;
- one variant per module;
- server-side prerequisite expansion and totals;
- cross-partner ownership isolation;
- one draft/current published version;
- optimistic draft revision protection during publication;
- published snapshot immutability;
- atomic publish, share, revoke, view, and status events.

### Connector

- invalid integration secret and missing actor;
- exact admin role on admin routes;
- missing/suspended partner and missing integration capability;
- owner mismatch reported as not found;
- public token valid, unknown, expired, and revoked;
- strict admin, partner, and client DTO projections;
- no raw token persistence.

### Blocs/bindings

- Edit/forced loading/empty/error performs zero network calls;
- list empty and repeat states;
- first-client and first-draft creation;
- form request bodies and reload events;
- no native fetch or nested binding core;
- client view never renders private fields.
