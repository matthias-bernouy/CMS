# Commerce Notifications

Status: buyer MVP implemented natively in Commerce `1.0.0`.

## Goal

Commerce provides editable transactional emails for buyer purchases,
fulfillment, cancellations, and refunds without coupling the feature to a
storefront, payment provider, delivery provider, or shared provider database.
Seller, offer, and negotiation notifications remain a later phase.

## Ownership

Commerce owns:

- normalized notification events;
- the durable notification queue;
- required, default-on, and opt-in rules;
- per-user preferences;
- versioned template context contracts;
- the default Commerce template descriptors.

Emailer owns:

- editable template copies;
- rendering and SMTP delivery;
- send logs and message idempotency.

The generic CmsCore notification task resolves the current CMS user email,
sends through Emailer's public source contract, and completes or retries the
Commerce lease. Commerce declares its recurring dispatch as an installed
scheduled trigger rather than relying on a Commerce-specific runtime worker.

## No Cross-Provider Database Access

Commerce never inserts into `emailer.templates`. Its source exposes
`listDefaultNotificationTemplates`, and Emailer exposes `installTemplates`.
The latter uses create-if-absent conflict handling, so repeated provisioning
does not overwrite administrator edits.

This boundary works when Commerce and Emailer use different Supabase projects,
different databases, or entirely different connector providers.

Commerce declares the copy operation in its integration definition under
`afterInstallation`. The generic integration lifecycle executes the declared
source calls after install or rerun. Because Emailer is optional, the hook waits
until that dependency exists and is reconciled when Emailer is installed later.
The notification task repeats provisioning only when it has claimed work, as a
recovery path; create-if-absent still preserves administrator edits.

## Native But Replaceable

`commerce.notification_configuration.mode` has three values:

- `builtin`: the default CmsCore worker sends through Emailer;
- `external`: a replacement system is the queue's sole consumer;
- `disabled`: Commerce captures no new notification events and no consumer can
  claim queued deliveries.

The queue intentionally remains single-consumer. Replacement is an exclusive
mode switch, not fan-out. A future event bus would need immutable events plus
per-consumer offsets or deliveries.

## Durable Queue

Commerce owns these private tables:

```text
notification_configuration
notification_rules
notification_user_preferences
notification_events
notification_deliveries
```

The capture trigger runs after inserts into `commerce.audit_events`. A
supported audit fact creates its versioned notification event and recipient
delivery inside the same PostgreSQL transaction.

Deliveries use leased claim/process/complete semantics, bounded exponential
retry, six attempts, and visible `dead_letter` state. Expired leases can be
reclaimed. Unknown template context versions fail visibly.

## Scheduled Dispatch

The Commerce integration installs
`schedule-dispatch-commerce-notifications`, targeting the registered
`cms.notifications.dispatch` task every 30 seconds. Schedule state and the
distributed lease live in the trigger repository, independently from the
Commerce notification queue lease.

Production, `p9r dev`, and `p9r preview` start the generic scheduled-trigger
runner by default. Local maintenance can pause that runner with
`--no-workers`; the trigger remains enabled and visible. The Triggers admin
shows its owner, next run, latest result, and a guarded Run now action.

## Versioned Contract

Event topics and template context fields are public contracts. Version 1
provides stable `recipient`, `order`, `delivery`, `action`, `event`, and
`source` groups. Renaming or removing a topic is breaking.

The installed buyer topics are:

- `commerce.order.paid`;
- `commerce.order.cancelled`;
- `commerce.order.refunded`;
- `commerce.order.fulfillment.carrier_accepted`;
- `commerce.order.fulfillment.in_transit`;
- `commerce.order.fulfillment.available_for_pickup`;
- `commerce.order.fulfillment.collected_by_recipient`;
- `commerce.order.fulfillment.incident`;
- `commerce.order.fulfillment.lost`;
- `commerce.order.fulfillment.returning_to_sender`;
- `commerce.order.fulfillment.returned_to_sender`.

## Preferences And Ordering

Payment, cancellation, and refund notifications are required and cannot be
disabled per user. Fulfillment notifications are enabled by default and are
editable through the authenticated `commerce-notification-preferences` bloc.

Retries can deliver facts out of order. Rules therefore use `always_send`,
or `drop_if_superseded`, and templates describe current state instead of
relying on an ordered sequence of deltas.

## Emailer Idempotency

Emailer reserves each idempotency key before SMTP:

```text
reserved -> sending -> sent
                  \-> failed or unknown
```

A stale reservation is reclaimable. A crash after SMTP acceptance but before
recording `sent` remains inherently ambiguous; version 1 chooses at-least-once
delivery with deterministic keys and state-based content.

## Phase 2

Add seller sales, shipping deadlines, offers, claims, settlement, verification,
and negotiation. CMS-user sellers can reuse CMS identity. Merchant and external
sellers first need an explicit notification contact.

## Non-Goals

- a generic multi-consumer Commerce event bus;
- an Emailer/Newsletter split;
- seller contacts without a reliable address;
- guest checkout notifications;
- SMS, push, in-app delivery, full localization, or a visual email builder.
