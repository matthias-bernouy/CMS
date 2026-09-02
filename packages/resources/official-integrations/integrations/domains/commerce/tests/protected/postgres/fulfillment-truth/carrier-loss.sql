select clock_timestamp() + interval '1 day' as loss_scan_deadline,
       clock_timestamp() as legacy_loss_at
\gset

select seed->>'orderId' legacy_order_id,
       seed->>'publicId' legacy_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'legacy-refund',
        :'loss_scan_deadline'
    ) seed
) seeded
\gset

insert into commerce.refund_requests (
    order_id, business_key, reason, status, requested_amount,
    merchandise_refund_amount, shipping_refund_amount,
    protection_fee_refund_amount, allocation_version,
    seller_recovery_amount, seller_reserve_offset_amount,
    requested_by_kind, requested_by
) values (
    :legacy_order_id, 'legacy-active-refund', 'legacy partial refund',
    'approved', 1000, 0, 0, 0, 0, 1000, 0, 'system', 'legacy-import'
);

select commerce.record_order_fulfillment_projection(
    :'legacy_public_id',
    'delivery:lost:legacy',
    'lost',
    :'legacy_loss_at',
    'shipment-legacy-refund'
);

select pg_temp.assert_carrier_truth(
    exists (
        select 1
        from commerce.order_fulfillments fulfillment
        join commerce.order_settlements settlement
          on settlement.order_id = fulfillment.order_id
        join commerce.financial_exceptions exception
          on exception.order_id = fulfillment.order_id
        where fulfillment.order_id = :legacy_order_id
          and fulfillment.status = 'lost'
          and fulfillment.blocking_reason = 'lost'
          and settlement.status = 'manual_review'
          and settlement.manual_review_reason =
              'carrier_lost_refund_reconciliation_required'
          and exception.deduplication_key =
              'fulfillment:lost-refund:' || fulfillment.order_id
          and exception.status = 'open'
    )
    and (
        select count(*)
        from commerce.refund_requests
        where order_id = :legacy_order_id
    ) = 1,
    'an active legacy refund rolled back or duplicated carrier loss truth'
);

select replay->>'idempotentReplay' as legacy_loss_replay
from (
    select commerce.record_order_fulfillment_projection(
        :'legacy_public_id',
        'delivery:lost:legacy',
        'lost',
        :'legacy_loss_at',
        'shipment-legacy-refund'
    ) replay
) replayed
\gset

select pg_temp.assert_carrier_truth(
    :'legacy_loss_replay'::boolean
    and (
        select count(*)
        from commerce.provider_projection_events
        where authority = 'delivery'
          and provider_event_id = 'delivery:lost:legacy'
    ) = 1,
    'carrier loss replay was not idempotent'
);

select seed->>'orderId' partial_order_id,
       seed->>'publicId' partial_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'partial-refund',
        :'loss_scan_deadline'
    ) seed
) seeded
\gset

select commerce.create_allocated_refund_request(
    :partial_order_id,
    null,
    'allocated-active-partial',
    'active allocated partial refund',
    1000,
    0,
    50,
    'system',
    'carrier-truth-contract',
    true
);

select commerce.record_order_fulfillment_projection(
    :'partial_public_id',
    'delivery:lost:partial',
    'lost',
    clock_timestamp(),
    'shipment-partial-refund'
);

select pg_temp.assert_carrier_truth(
    exists (
        select 1
        from commerce.order_fulfillments fulfillment
        join commerce.order_settlements settlement
          on settlement.order_id = fulfillment.order_id
        join commerce.financial_exceptions exception
          on exception.order_id = fulfillment.order_id
        where fulfillment.order_id = :partial_order_id
          and fulfillment.status = 'lost'
          and settlement.status = 'manual_review'
          and settlement.manual_review_reason =
              'carrier_lost_refund_reconciliation_required'
          and exception.deduplication_key =
              'fulfillment:lost-refund:' || fulfillment.order_id
    )
    and not exists (
        select 1
        from commerce.refund_requests
        where order_id = :partial_order_id
          and business_key like 'fulfillment:lost:%'
    ),
    'an active allocated partial refund rolled back carrier loss truth'
);

select clock_timestamp() as full_loss_at \gset
select seed->>'orderId' full_loss_order_id,
       seed->>'publicId' full_loss_public_id,
       seed->>'offerId' full_loss_offer_id
from (
    select pg_temp.seed_carrier_truth_case(
        'full-loss',
        :'loss_scan_deadline'
    ) seed
) seeded
\gset

reset role;
create or replace function pg_temp.raise_unknown_lost_refund_failure()
returns trigger
language plpgsql
as $$
begin
    if new.business_key like 'fulfillment:lost:%' then
        raise exception 'unexpected_refund_storage_failure';
    end if;
    return new;
end;
$$;
create trigger carrier_truth_unknown_refund_failure
before insert on commerce.refund_requests
for each row execute function pg_temp.raise_unknown_lost_refund_failure();
set local role service_role;

create or replace function pg_temp.assert_unknown_lost_refund_failure(
    p_order_public_id uuid,
    p_occurred_at timestamptz
)
returns void
language plpgsql
as $unknown_error$
begin
    begin
        perform commerce.record_order_fulfillment_projection(
            p_order_public_id,
            'delivery:lost:full',
            'lost',
            p_occurred_at,
            'shipment-full-loss'
        );
        raise exception 'expected unknown refund storage failure';
    exception when others then
        if sqlerrm <> 'unexpected_refund_storage_failure' then
            raise;
        end if;
    end;
end;
$unknown_error$;

select pg_temp.assert_unknown_lost_refund_failure(
    :'full_loss_public_id',
    :'full_loss_at'
);

select pg_temp.assert_carrier_truth(
    exists (
        select 1
        from commerce.order_fulfillments
        where order_id = :full_loss_order_id
          and status = 'label_created'
    )
    and exists (
        select 1
        from commerce.order_settlements
        where order_id = :full_loss_order_id
          and status = 'held'
    )
    and not exists (
        select 1
        from commerce.provider_projection_events
        where authority = 'delivery'
          and provider_event_id = 'delivery:lost:full'
    ),
    'an unknown refund failure was swallowed instead of remaining transactional'
);

reset role;
drop trigger carrier_truth_unknown_refund_failure
on commerce.refund_requests;
set local role service_role;

select commerce.record_order_fulfillment_projection(
    :'full_loss_public_id',
    'delivery:lost:full',
    'lost',
    :'full_loss_at',
    'shipment-full-loss'
);

select commerce.record_order_fulfillment_projection(
    :'full_loss_public_id',
    'delivery:lost:full:second-provider-event',
    'lost',
    :'full_loss_at'::timestamptz + interval '1 second',
    'shipment-full-loss'
);

select id as full_loss_refund_id,
       business_key as full_loss_refund_business_key,
       requested_amount as full_loss_refund_amount
from commerce.refund_requests
where order_id = :full_loss_order_id
  and business_key = 'fulfillment:lost:delivery:lost:full'
\gset

select pg_temp.assert_carrier_truth(
    :full_loss_refund_amount = 11000
    and (
        select count(*)
        from commerce.refund_requests
        where order_id = :full_loss_order_id
          and business_key like 'fulfillment:lost:%'
    ) = 1
    and exists (
        select 1
        from commerce.refund_requests refund
        join commerce.order_settlements settlement
          on settlement.order_id = refund.order_id
        where id = :full_loss_refund_id
          and refund.status = 'approved'
          and refund.merchandise_refund_amount = 10000
          and refund.shipping_refund_amount = 500
          and refund.protection_fee_refund_amount = 500
          and settlement.status = 'refund_pending'
    ),
    'loss retry did not reuse the exact full refund and preserve its pending state'
);

select clock_timestamp() as full_loss_refund_at \gset
select commerce.record_order_settlement_projection(
    :'full_loss_public_id',
    'stripe:refund:full-loss',
    'refund',
    990001,
    'succeeded',
    :full_loss_refund_amount,
    'eur',
    :'full_loss_refund_at',
    null,
    :full_loss_refund_id,
    :'full_loss_refund_business_key',
    '{"status":"succeeded"}'::jsonb
);
select replay->>'idempotentReplay' as full_loss_refund_replay
from (
    select commerce.record_order_settlement_projection(
        :'full_loss_public_id',
        'stripe:refund:full-loss',
        'refund',
        990001,
        'succeeded',
        :full_loss_refund_amount,
        'eur',
        :'full_loss_refund_at',
        null,
        :full_loss_refund_id,
        :'full_loss_refund_business_key',
        '{"status":"succeeded"}'::jsonb
    ) replay
) replayed
\gset

select pg_temp.assert_carrier_truth(
    :'full_loss_refund_replay'::boolean
    and exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment
          on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement
          on settlement.order_id = order_row.id
        where order_row.id = :full_loss_order_id
          and order_row.status = 'cancelled'
          and fulfillment.status = 'lost'
          and fulfillment.blocking_reason = 'lost'
          and settlement.status = 'refunded'
          and settlement.total_refunded_amount = 11000
    )
    and exists (
        select 1
        from commerce.offers
        where id = :full_loss_offer_id
          and quantity_available = 0
          and availability = 'unavailable'
    )
    and exists (
        select 1
        from commerce.order_lines
        where order_id = :full_loss_order_id
          and inventory_reserved = 1
    )
    and exists (
        select 1
        from commerce.audit_events
        where order_id = :full_loss_order_id
          and event_type = 'carrier_loss_full_refund_terminalized'
          and data->>'inventoryRestored' = 'false'
    ),
    'full carrier-loss refund did not terminalize exactly once without restoring inventory'
);
