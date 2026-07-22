

create table if not exists commerce.order_fulfillments (
    order_id bigint primary key references commerce.orders(id) on delete restrict,
    status text not null default 'awaiting_shipment',
    provider_reference text,
    seller_handoff_deadline timestamptz not null,
    scan_grace_deadline timestamptz not null,
    seller_handoff_declared_at timestamptz,
    carrier_accepted_at timestamptz,
    arrived_at_pickup_point_at timestamptz,
    available_for_pickup_at timestamptz,
    recipient_handoff_at timestamptz,
    recipient_handoff_first_observed_at timestamptz,
    claim_window_started_at timestamptz,
    claim_by_at timestamptz,
    release_eligible_at timestamptz,
    blocking_reason text,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint order_fulfillments_status check (status in (
        'awaiting_shipment', 'shipment_creating', 'label_created', 'seller_handoff_declared', 'carrier_accepted',
        'in_transit', 'arrived_at_pickup_point', 'available_for_pickup',
        'collected_by_recipient', 'incident', 'lost', 'pickup_expired',
        'returning_to_sender', 'returned_to_sender', 'cancelled', 'manual_review'
    )),
    constraint order_fulfillments_provider_reference check (
        provider_reference is null or length(btrim(provider_reference)) > 0
    ),
    constraint order_fulfillments_deadlines check (scan_grace_deadline >= seller_handoff_deadline),
    constraint order_fulfillments_claim_window check (
        (recipient_handoff_at is null and recipient_handoff_first_observed_at is null
            and claim_window_started_at is null and claim_by_at is null
            and release_eligible_at is null)
        or (recipient_handoff_at is not null and recipient_handoff_first_observed_at is not null
            and claim_window_started_at >= recipient_handoff_at
            and claim_window_started_at >= recipient_handoff_first_observed_at
            and claim_by_at >= claim_window_started_at
            and release_eligible_at = claim_by_at)
    ),
    constraint order_fulfillments_version check (version > 0)
);

alter table commerce.order_fulfillments
    add column if not exists recipient_handoff_first_observed_at timestamptz;
alter table commerce.order_fulfillments
    add column if not exists claim_window_started_at timestamptz;

alter table commerce.order_fulfillments
    drop constraint if exists order_fulfillments_status;
alter table commerce.order_fulfillments
    add constraint order_fulfillments_status check (status in (
        'awaiting_shipment', 'shipment_creating', 'label_created', 'seller_handoff_declared',
        'carrier_accepted', 'in_transit', 'arrived_at_pickup_point',
        'available_for_pickup', 'collected_by_recipient', 'incident', 'lost',
        'pickup_expired', 'returning_to_sender', 'returned_to_sender',
        'cancelled', 'manual_review'
    ));

alter table commerce.order_fulfillments
    drop constraint if exists order_fulfillments_claim_window;

-- Legacy rows cannot prove when Commerce first observed a provider handoff. Use
-- the latest durable local timestamp and extend, but never shorten, the window.
-- This is intentionally fail-closed for reruns over an older installation.
update commerce.order_fulfillments fulfillment set
    recipient_handoff_first_observed_at = coalesce(
        fulfillment.recipient_handoff_first_observed_at,
        fulfillment.updated_at,
        fulfillment.recipient_handoff_at
    ),
    claim_window_started_at = coalesce(
        fulfillment.claim_window_started_at,
        greatest(
            fulfillment.recipient_handoff_at,
            coalesce(fulfillment.recipient_handoff_first_observed_at,
                fulfillment.updated_at, fulfillment.recipient_handoff_at)
        )
    ),
    claim_by_at = greatest(
        fulfillment.claim_by_at,
        coalesce(
            fulfillment.claim_window_started_at,
            greatest(
                fulfillment.recipient_handoff_at,
                coalesce(fulfillment.recipient_handoff_first_observed_at,
                    fulfillment.updated_at, fulfillment.recipient_handoff_at)
            )
        ) + make_interval(hours => protection.claim_window_hours)
    ),
    release_eligible_at = greatest(
        fulfillment.claim_by_at,
        coalesce(
            fulfillment.claim_window_started_at,
            greatest(
                fulfillment.recipient_handoff_at,
                coalesce(fulfillment.recipient_handoff_first_observed_at,
                    fulfillment.updated_at, fulfillment.recipient_handoff_at)
            )
        ) + make_interval(hours => protection.claim_window_hours)
    )
from commerce.order_financial_terms terms
join commerce.protection_policies protection on protection.id = terms.protection_policy_id
where terms.order_id = fulfillment.order_id
  and fulfillment.recipient_handoff_at is not null
  and (
      fulfillment.recipient_handoff_first_observed_at is null
      or fulfillment.claim_window_started_at is null
      or fulfillment.claim_by_at is null
      or fulfillment.release_eligible_at is null
      or fulfillment.claim_window_started_at < greatest(
          fulfillment.recipient_handoff_at,
          fulfillment.recipient_handoff_first_observed_at
      )
      or fulfillment.claim_by_at < fulfillment.claim_window_started_at
          + make_interval(hours => protection.claim_window_hours)
      or fulfillment.release_eligible_at is distinct from greatest(
          fulfillment.claim_by_at,
          fulfillment.claim_window_started_at
              + make_interval(hours => protection.claim_window_hours)
      )
  );

alter table commerce.order_fulfillments
    add constraint order_fulfillments_claim_window check (
        (recipient_handoff_at is null and recipient_handoff_first_observed_at is null
            and claim_window_started_at is null and claim_by_at is null
            and release_eligible_at is null)
        or (recipient_handoff_at is not null and recipient_handoff_first_observed_at is not null
            and claim_window_started_at >= recipient_handoff_at
            and claim_window_started_at >= recipient_handoff_first_observed_at
            and claim_by_at >= claim_window_started_at
            and release_eligible_at = claim_by_at)
    );

create index if not exists order_fulfillments_status_deadline_idx
    on commerce.order_fulfillments(status, release_eligible_at)
    where status not in ('cancelled', 'returned_to_sender');
create index if not exists order_fulfillments_scan_grace_due_idx
    on commerce.order_fulfillments(scan_grace_deadline, order_id)
    where carrier_accepted_at is null
      and status in ('awaiting_shipment', 'label_created', 'seller_handoff_declared');