
-- Older installations created seller deadlines when the delivery quote was
-- locked. Arm existing active orders from the first durable successful payment
-- and only extend their deadlines, so an upgrade can never remove seller time.
with first_payment_confirmation as (
    select distinct on (attempt.order_id)
        attempt.order_id,
        attempt.succeeded_at payment_confirmed_at,
        protection.seller_handoff_hours,
        protection.scan_grace_hours
    from commerce.order_payment_attempts attempt
    join commerce.orders order_row on order_row.id = attempt.order_id
    join commerce.order_financial_terms terms on terms.order_id = attempt.order_id
    join commerce.protection_policies protection on protection.id = terms.protection_policy_id
    where attempt.succeeded_at is not null
      and order_row.status = 'active'
    order by attempt.order_id, attempt.succeeded_at, attempt.id
)
update commerce.order_fulfillments fulfillment set
    payment_confirmed_at = confirmation.payment_confirmed_at,
    seller_handoff_deadline = greatest(
        fulfillment.seller_handoff_deadline,
        confirmation.payment_confirmed_at
            + make_interval(hours => confirmation.seller_handoff_hours)
    ),
    scan_grace_deadline = greatest(
        fulfillment.scan_grace_deadline,
        greatest(
            fulfillment.seller_handoff_deadline,
            confirmation.payment_confirmed_at
                + make_interval(hours => confirmation.seller_handoff_hours)
        ) + make_interval(hours => confirmation.scan_grace_hours)
    ),
    updated_at = now()
from first_payment_confirmation confirmation
where confirmation.order_id = fulfillment.order_id
  and fulfillment.payment_confirmed_at is null;

alter table commerce.order_fulfillments
    drop constraint if exists order_fulfillments_payment_confirmation_deadlines;
alter table commerce.order_fulfillments
    add constraint order_fulfillments_payment_confirmation_deadlines check (
        payment_confirmed_at is null or seller_handoff_deadline >= payment_confirmed_at
    );

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
