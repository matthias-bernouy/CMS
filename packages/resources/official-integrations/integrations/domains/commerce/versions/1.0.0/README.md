# Commerce Integration

Commerce `1.0.0` is a coherent marketplace-capable commerce kernel. It replaces
the need to compose the standalone Products, Offers, and Orders integrations
when a project needs transactional rules across those domains.

## Scope

The integration owns:

- products with brands, hierarchical categories, private image media, variant axes, and generated combinations;
- merchant, user, and external sellers;
- seller verification;
- multiple seller offers for the same product or variant, each with private image media;
- fixed publication status plus configurable, bounded workflow states;
- administrator price ranges and seller price proposals;
- optional whole-unit offer prices enforced for administrator ranges, seller proposals, and publication;
- authenticated buyer carts with live price and availability issue projections;
- seller-grouped checkout that creates one single-seller order per seller;
- single-seller orders with server-side price and catalogue snapshots;
- protected C2C financial policy revisions and immutable per-order terms;
- provider payment, fulfillment, settlement, refund, and dispute projections;
- marketplace claims, cancellation review, financial exceptions, audit, and durable operation dispatch;
- typed commerce settings;
- Commerce-scoped metadata definitions for products, variants, sellers, offers, and orders;
- category-scoped Product fields that define required values and public filters.

Payment and delivery remain separate provider integrations, while Commerce is
the business and financial authority. A trusted delivery quote locks a
versioned fee, protection, and seller-risk snapshot before payment can start.
Provider integrations may only record idempotent projections through the
system commands; they cannot calculate fees, authorize a release or refund,
or mark an order complete themselves. Checkout group ids correlate an internal
checkout and never replace public order ids.

## Native notifications

Commerce owns notification intent because payment, cancellation, refund, and
fulfillment facts are part of its normalized domain state. The Supabase
connector writes versioned `notification_events` and per-recipient
`notification_deliveries` in the same transaction as the corresponding
`audit_events`. It does not reuse the finance outbox and does not write into an
Emailer or another provider database.

The notification configuration has three exclusive modes:

- `builtin` is the default and lets the CmsCore notification worker deliver
  through the installed Emailer source;
- `external` keeps capturing the Commerce queue for a replacement consumer;
- `disabled` stops new notification capture and prevents both consumers from
  claiming queued deliveries.

Commerce publishes stable default template descriptors through its source. Its
declarative `afterInstallation` hook registers them through Emailer's
`installTemplates` endpoint when the optional Emailer dependency is available.
The generic installation lifecycle also reconciles that hook when Emailer is
installed later. Create-if-absent behavior preserves administrator edits. The
scheduled notification task repeats the operation only as a recovery path
before sending claimed work by template key. Emailer may use another database
or provider because the boundary is HTTP/source-based rather than cross-schema
SQL.

Commerce also installs `schedule-dispatch-commerce-notifications`. The generic
CmsCore trigger scheduler claims it every 30 seconds and invokes the registered
`cms.notifications.dispatch` task. Runtime composition contains no
Commerce-specific interval or function id.

Payment, cancellation, and refund emails are required. Fulfillment emails are
enabled by default and can be changed from the authenticated
`commerce-notification-preferences` bloc. Email addresses are resolved from the
current CMS user at dispatch time and are not copied into the Commerce queue.

## Protected C2C settlement

Protection is the default for user-to-user sellers. Commerce stores all money
as integer EUR minor units and snapshots the active policy revision, delivery
quote, buyer total, seller proceeds, seller reserve liability, platform-retained
amount, estimated costs, minimum margin, and subsidy approval on the order.
Published policies and locked financial terms are immutable.

Fresh installations point to a draft fee policy and cannot lock protected
financial terms. Finance must publish a revision with a positive Stripe cost
estimate and valid margin, or record a bounded subsidy amount and reason. No
system-created unlimited subsidy makes a zero-fee configuration usable.
The Settings dashboard shows the complete active fee, protection, and
seller-risk revision. Its Finance-only publication action accepts integer minor
units and basis points, confirms the activation, and compares the current
settings version before atomically creating and selecting a new immutable
revision. It never edits a published row or accepts an existing policy id.

The prudent seller-risk default retains ten percent of seller proceeds as a
Commerce liability for 120 days. Those funds remain in the platform balance
behind a reconciled minimum balance on an automatic platform payout schedule;
they are not held by setting the platform to manual payouts. Stripe's 90-day
French limit applies to manual payouts, while minimum balances are the Stripe
mechanism for retaining reserves against anticipated refunds, disputes, and
fees on automatic schedules. The ordinary connected-account payout delay is
separate and remains within Stripe's 31-day override bound. Initial release,
reserve release or refund offset, and unrecovered seller debt are explicit
ledger events; seller reserve is never platform revenue. A platform
administrator can still force an out-of-band manual payout, so every payout is
observed and an unexpected manual or instant payout is a critical finance
exception and trust-boundary breach.

A successful provider payment activates the order but does not release seller
funds. Trusted carrier events distinguish label creation, seller declaration,
carrier acceptance, transit, pickup availability, recipient collection,
incidents, loss, expiry, and returns. Recipient collection starts the claim
window. Only Commerce can create a stable release authorization after that
window expires without an open claim, refund, dispute, or fulfillment blocker.

Claims, cancellations, and support refund requests produce policy-bounded
refund authorizations. Support supplies only a reason and total amount;
Commerce derives the fee refund and seller recovery from the locked policy.
High-value requests require finance review, and the configured dual-approval
threshold requires two distinct finance actors. Provider success is required before a refund, transfer,
reversal, or completed order is projected as final. Release and refund
authorizations have durable leases and stable business keys, so a worker crash
or ignored trigger failure is retried without creating a second provider
operation. Audit and outbox rows are written in the same transactions as the
business decisions.

`processDueOrderDeadlines` is the system-only, database-clock deadline sweep.
It expires an unpaid order only after Commerce has terminal failed or cancelled
provider truth. A signed provider-absence result is accepted only for the exact
durable Commerce cancellation request and only while no payment attempt exists;
it then restores inventory without inventing a payment row. Missing or
non-terminal payment truth enters `manual_review`
instead of restoring inventory. A buyer cancellation after label creation is
auto-approved only after scan grace while both seller handoff and trusted
carrier acceptance remain absent under row locks. Missing scans otherwise
create a fulfillment exception without auto-refunding. Seller-response and
return deadlines move the claim to support review; they never decide guilt or
money automatically.

Product is the only administrator-facing catalogue resource. Images, variant
axes, axis values, and the generated cartesian matrix are edited or displayed
inside the Product detail. Variants remain normalized internal rows because
offers and order snapshots need stable foreign keys, but they cannot be created
as arbitrary standalone records. Brands are normalized catalogue entities. Products
have one primary category, categories can inherit fields from their ancestors,
and category field configuration reuses Product metadata definitions instead of
creating a second value model.

Product images live in a private `commerce-media` bucket and are served through
the CMS Source proxy. Upload and replacement authorize the target before reading
the bounded multipart body or writing Storage, detect the actual raster format
and intrinsic dimensions, then recheck the attachment in PostgreSQL.

Every uploaded Storage object is an immutable retained original. Replacement
creates a new media identity and detaches the previous one; removal detaches the
selected identity. Detached rows and bytes are retained but every public,
seller, and administrator download context returns them as not found. Commerce
does not create responsive variants, cleanup jobs, or automatic retention
expiry.

Private seller and administrator responses are `private, no-store`, so detach
revocation is immediate on their next request. A public response may remain in
a browser or shared cache for its existing maximum one-hour freshness window;
after that window, the Source context revalidates and returns detached media as
not found.

CMS runtimes may derive a bounded WebP response on demand when an eligible image
Source URL contains a canonical `cms-width`. Those derivatives are disposable
CMS cache entries; Supabase remains the only source of truth for originals.

This contract updates the existing Commerce `1.0.0` resources in place.
Existing installations therefore require an explicit installation rerun after
deployment. SQL is applied before the Edge Function. During that short
transition, legacy attach signatures remain callable and remove/replace results
no longer expose a retained Storage path that old code could delete. Complete
the rerun promptly: the previous function does not implement pre-upload
authorization or detached-product reads and is not a routine rollback target.

The Commerce source and its eight dashboards use SVG icons from the versioned
`assets/` directory. Their metadata declares `{ "path": "assets/...svg" }`;
the integration repository embeds those SVGs during definition loading so an
installed dashboard does not depend on the catalogue remaining available.

## Status and workflow

`publicationStatus` is a fixed technical state: `draft`, `active`, `paused`, or
`archived`. `workflowState` is business configuration backed by
`commerce.offer_workflow_states`. Configurable states are classified into a
small fixed set of phases so custom labels never become executable code.

The bundled flow is:

```text
draft -> pending_review -> awaiting_seller_price
      -> changes_requested
awaiting_seller_price -> awaiting_final_approval -> approved
any review state -> rejected
```

The administrator can request a price between two amounts. A seller proposal
is checked inside a PostgreSQL transaction. The browser cannot bypass the
range, seller ownership, seller verification, expected row version, or current
workflow state.

The optional `wholeUnitPrices` setting rejects offer amounts with fractional
EUR units across administrator entry, seller pricing, and negotiation. Enabling
it is blocked while a non-archived offer has a non-whole accepted price, active
price rule, or pending or accepted proposal. Historical orders and calculated
fees remain immutable minor-unit amounts and are not rounded by this policy.

Settings, Workflow, and Metadata are separate dashboards. Settings also owns
offer conditions because they remain a required first-class Commerce taxonomy.
Seller transitions with business side effects stay reserved to the built-in
commands; inert custom seller transitions are rejected.

## Seller account offers

`listMyOffers` lists only offers belonging to the authenticated CMS user. The
Edge Function resolves the seller from `x-cms-user-id`; callers never select a
seller id. The endpoint accepts the seller-facing `status` values `all`,
`draft`, `action_required`, `under_review`, `online`, `paused`, `rejected`, and
`archived`, plus `limit` and `offset`. It returns an exact total, the primary
offer media id, the configured workflow state information, and one consolidated
display status per item. Its seller-only `sellerDisplayPriceAmount` uses the
latest pending or accepted price proposal, falling back to the canonical
`acceptedPriceAmount`. This lets the seller see a price awaiting review without
representing that proposal as an accepted public price.

The `commerce-account-offers` Light DOM composition consumes this endpoint. It
assembles Basic Blocs for its filter, intrinsic card grid, loading and error
states, native images, actions, and pagination. Labels, visible fields, URLs,
page size, grid sizing, URL parameter names, locale, and colors are editable.
The composition does not inject CSS or a binding core.

## Seller sales

`mySales` and `mySale` resolve the seller from the authenticated CMS user and
never accept a seller id from the browser. Their projections intentionally omit
the buyer identity, shipping and billing addresses, idempotency data, private
event details, and every Order metadata definition that is not marked
`publicReadable`. Public-readable metadata is exposed both by key and as labeled
entries. A sale belonging to another seller is returned as not found.

`commerce-account-sales` provides the seller's paginated order list.
`commerce-sale-detail` renders immutable line snapshots, amounts, and the
Commerce order state. Its `fulfillment` slot is the boundary for a delivery
integration to add labels and tracking without making Commerce depend on a
specific carrier.

## Public offer browsing

`commerce-offer-list` is a transparent controller for the public `offers`
endpoint. It discovers authored `cms-param-sync` controls, keeps pagination and
the page URL coherent, and places the generated `cms-source` on its own host.
Its default content uses an intrinsic Basic Grid whose minimum and maximum card
widths, gap, packing, and card stretch are configurable on the controller. It
does not choose the filter UI, empty states, or surrounding page layout.

Category and brand are first-class filters. `offerFilterSchema` resolves the
selected category's inherited, public-readable Product fields and allowed
operators. An authored `commerce-offer-filter` maps any URL-synchronized Basic
control to one of those fields, so Commerce remains independent from a site's
tennis, padel, clothing, or other catalogue vocabulary. PostgreSQL validates
the schema and applies category, brand, price, condition, and metadata filters
before counting and paginating public offers.

In schema-driven mode, the same bloc renders brand, enum, and boolean facets
with the shared Basic Select. Filterable numeric fields use a two-handle range
whose bounds and precision come from active public catalogue metadata, with
compact minimum and maximum inputs for precise entry. Both inputs keep their
own URL parameter and map to the existing `gte` and `lte` operators; no
catalogue-specific field names are embedded in the presentation.

`commerce-offer-preview` is a request-free presentation bloc with editable
slots for media, badges, headings, descriptive content, price, and actions. It
can format a minor-unit amount and currency, while still allowing authored
price content to override the fallback. Source-fed native images use
`data-src` inside the media slot so the browser waits for binding interpolation
before requesting the Source proxy. When intrinsic dimensions are available,
the shared CMS browser primitive adds canonical `srcset` candidates, preserves
authored `sizes`, defaults lazy images to `auto, 100vw`, and reserves the
original aspect ratio. Historical rows without dimensions keep their original
Source URL.

Public offer lists batch related products, sellers, variants, and media. Their
declared output includes these projections, the primary image id, and public
Product and Offer metadata so editor bindings can target the same fields the
runtime returns.

## Cart and checkout boundary

A cart belongs to the authenticated CMS user identified by the computed
`x-cms-user-id` header. Clients never select or submit a buyer identity. The cart
stores the accepted unit amount and offer version seen when each item was added,
while reads also project the current amount, availability, stock, and issue
codes. Seller groups are derived projections, not client-maintained state.

Cart item writes lazily create the active cart and use optimistic versions once
it exists. Removal, clearing, and checkout require the current cart version.
Checkout also requires an idempotency key, locks and revalidates every offer,
then creates one single-seller order per seller under one checkout group. The
orders, inventory changes, cart transition, and checkout replay record commit
atomically. A stale price, unavailable offer, currency mismatch, or insufficient
stock blocks the complete checkout rather than producing partial orders.

Carts are buyer-facing source resources and intentionally have no Commerce dashboard in
`1.0.0`. Administrator order management operates on orders produced by cart checkout or
the direct single-seller order command.

## Metadata boundary
Metadata definitions live inside Commerce and attach only to supported
Commerce entities. Values remain JSON objects on their owning row, while all
writes validate field names, types, enum options, required fields, editability,
and payload size.

Product, offer, seller, and order definitions become typed source fields.
Product and offer dashboards edit them; seller and order dashboards expose
them read-only. Public projections only include public-readable definitions,
including Product metadata embedded in an Offer. Variant definitions remain
unprojected until Commerce provides a dedicated variant editing lifecycle.

Metadata is descriptive. Price limits, verification, permissions,
publication status, workflow transitions, and access rules are first-class
columns and commands. They must never be moved into metadata.

## Security model

The CMS source injects a generated bearer key. Self-service endpoints also
inject the CMS-computed user id in `x-cms-user-id`; seller and buyer ids from
request bodies are ignored. Financial administration also requires the
CMS-computed `x-cms-user-role`: support may investigate and request bounded
resolutions, while finance alone may approve refunds, review cancellations,
configure policies, or authorize an exceptional release. A generic admin role
is never treated as finance. The Supabase schema is revoked from `anon` and
`authenticated`, has RLS enabled and forced, and is accessed by the Edge
Function with the server-only service role.

Critical mutations use PostgreSQL RPCs so locks, validation, writes, snapshots,
inventory changes, version increments, audit events, and outbox events commit atomically.
Edge Function code never trusts client-provided prices or order snapshots.
Delivery amounts are accepted only through the explicit trusted quote command,
with order ownership, status, EUR currency, amount bounds, margin policy, and
optimistic version checks enforced inside PostgreSQL.
Inventory revisions keep cancellations from overwriting a later seller or administrator
availability decision. Checkout ignores client totals and seller groups, rebuilding them
from locked Commerce rows.

## Configuration boundary

Typed settings control seller verification, offer moderation, price policy,
currency, order behavior, and the active C2C fee, protection, and seller-risk
policy ids. Finance manages those ids only through the active-policy view and
the CAS-protected **Publish new protected C2C policy revision** action. Policy
changes always publish a new revision; they never mutate the terms of an
existing order. Conditions and bounded workflow labels are
configurable records. Core publication states and privileged transition names
remain reserved so configuration cannot silently grant access or execute code.

Catalogue writes are administrator-only in `1.0.0`. Seller self-service covers
their profile, offer drafts, price proposals, live inventory, pausing active
offers, and orders. A seller cannot rewrite an approved price or workflow state.
Additional seller catalogue permissions should be introduced as explicit
commands in a later version, not as an unused boolean setting.

Buyer self-service covers the current cart, item quantities, clearing, checkout,
and owned orders. Cart access does not grant catalogue, offer, seller, or
administrator permissions. Owned-order responses expose enabled Order metadata
only when its definition is marked `publicReadable`; administrator responses
retain the complete metadata object.

## Files
- `definition.json`: entry point for the source, overlays, dashboards,
  generated secret, connector, and bloc declarations assembled from
  `definitions/`.
- `blocs/commerce-offer-list/`: transparent public offer source controller.
- `blocs/commerce-offer-preview/`: editable public offer presentation.
- `blocs/commerce-account-offers/`: authenticated seller offer listing.
- `connectors/supabase/sql/schema.manifest.json`: ordered private schema and
  transactional command bundle.
- `connectors/supabase/functions/cms-commerce/`: modular CMS-facing API.
- `connectors/supabase/supabase.config.toml`: function deployment fragment.

Source modules, resource fragments, and tests target 150 lines and eight files
per local folder. The definition entry point and nested JSON directives declare
the canonical assembly order explicitly. SQL manifests likewise declare the
fragment order, while the connector deployer submits each root bundle as one
atomic installation of tables, functions, grants, and policies.
