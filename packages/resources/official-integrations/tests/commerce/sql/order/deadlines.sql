\set ON_ERROR_STOP on

begin;
set local role service_role;
insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values ('user', 'deadline-smoke-seller', 'deadline-smoke-seller', 'Deadline smoke seller')
returning id as deadline_seller_id \gset

insert into commerce.checkout_groups (
    id, buyer_cms_user_id, idempotency_key, request_hash
)
select fixture.checkout_id, 'deadline-smoke-buyer-' || fixture.key,
    'deadline-smoke-' || fixture.key, md5('deadline-smoke-' || fixture.key)
from (values
    ('fulfillment-due', '31000000-0000-4000-8000-000000000001'::uuid),
    ('fulfillment-future', '31000000-0000-4000-8000-000000000002'::uuid),
    ('seller-response-due', '31000000-0000-4000-8000-000000000003'::uuid),
    ('seller-response-future', '31000000-0000-4000-8000-000000000004'::uuid),
    ('return-ship-due', '31000000-0000-4000-8000-000000000005'::uuid),
    ('return-ship-future', '31000000-0000-4000-8000-000000000006'::uuid),
    ('seller-handoff-due', '31000000-0000-4000-8000-000000000007'::uuid),
    ('seller-handoff-declared', '31000000-0000-4000-8000-000000000008'::uuid)
) fixture(key, checkout_id);

insert into commerce.orders (
    public_id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, total_amount, idempotency_key, request_hash
)
select fixture.public_id, 'DEADLINE-' || upper(fixture.key), fixture.checkout_id,
    :deadline_seller_id, 'deadline-smoke-buyer-' || fixture.key,
    'active', 'eur', 100, 100, 'deadline-smoke-' || fixture.key,
    md5('deadline-smoke-' || fixture.key)
from (values
    ('fulfillment-due', '31000000-0000-4000-8000-000000000001'::uuid,
        '32000000-0000-4000-8000-000000000001'::uuid),
    ('fulfillment-future', '31000000-0000-4000-8000-000000000002'::uuid,
        '32000000-0000-4000-8000-000000000002'::uuid),
    ('seller-response-due', '31000000-0000-4000-8000-000000000003'::uuid,
        '32000000-0000-4000-8000-000000000003'::uuid),
    ('seller-response-future', '31000000-0000-4000-8000-000000000004'::uuid,
        '32000000-0000-4000-8000-000000000004'::uuid),
    ('return-ship-due', '31000000-0000-4000-8000-000000000005'::uuid,
        '32000000-0000-4000-8000-000000000005'::uuid),
    ('return-ship-future', '31000000-0000-4000-8000-000000000006'::uuid,
        '32000000-0000-4000-8000-000000000006'::uuid),
    ('seller-handoff-due', '31000000-0000-4000-8000-000000000007'::uuid,
        '32000000-0000-4000-8000-000000000007'::uuid),
    ('seller-handoff-declared', '31000000-0000-4000-8000-000000000008'::uuid,
        '32000000-0000-4000-8000-000000000008'::uuid)
) fixture(key, checkout_id, public_id);

insert into commerce.order_fulfillments (
    order_id, status, payment_confirmed_at, seller_handoff_deadline,
    scan_grace_deadline, seller_handoff_declared_at
)
select order_row.id,
    case when order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DECLARED'
        then 'seller_handoff_declared' else 'label_created' end,
    now() - interval '4 hours',
    case
        when order_row.order_number = 'DEADLINE-FULFILLMENT-DUE'
            then now() - interval '3 hours'
        when order_row.order_number in (
            'DEADLINE-SELLER-HANDOFF-DUE', 'DEADLINE-SELLER-HANDOFF-DECLARED'
        ) then now() - interval '1 hour'
        else now() + interval '1 hour'
    end,
    case when order_row.order_number = 'DEADLINE-FULFILLMENT-DUE'
        then now() - interval '2 hours' else now() + interval '2 hours' end,
    case when order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DECLARED'
        then now() - interval '90 minutes' end
from commerce.orders order_row
where order_row.order_number in (
    'DEADLINE-FULFILLMENT-DUE', 'DEADLINE-FULFILLMENT-FUTURE',
    'DEADLINE-SELLER-HANDOFF-DUE', 'DEADLINE-SELLER-HANDOFF-DECLARED'
);

insert into commerce.order_settlements (
    order_id, status, authorized_seller_amount,
    seller_reserve_liability_remaining_amount, platform_gross_remainder_amount
)
select order_row.id, 'held', 100, 0, 0
from commerce.orders order_row
where order_row.order_number in (
    'DEADLINE-FULFILLMENT-DUE', 'DEADLINE-FULFILLMENT-FUTURE',
    'DEADLINE-SELLER-HANDOFF-DUE', 'DEADLINE-SELLER-HANDOFF-DECLARED'
);

insert into commerce.marketplace_claims (
    public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, resolution_outcome, seller_response_by_at, return_ship_by_at
)
select fixture.public_id, order_row.id, order_row.buyer_cms_user_id,
    order_row.seller_id, fixture.reason, fixture.status, fixture.description,
    fixture.outcome, now() + fixture.response_delta, now() + fixture.return_delta
from (values
    ('DEADLINE-SELLER-RESPONSE-DUE', '33000000-0000-4000-8000-000000000001'::uuid,
        'damaged', 'awaiting_seller_response', 'Due seller response', null,
        interval '-4 hours', null::interval),
    ('DEADLINE-SELLER-RESPONSE-FUTURE', '33000000-0000-4000-8000-000000000002'::uuid,
        'damaged', 'awaiting_seller_response', 'Future seller response', null,
        interval '2 hours', null::interval),
    ('DEADLINE-RETURN-SHIP-DUE', '33000000-0000-4000-8000-000000000003'::uuid,
        'return_requested', 'return_required', 'Due return shipment', 'return_required',
        interval '-3 hours', interval '-2 hours'),
    ('DEADLINE-RETURN-SHIP-FUTURE', '33000000-0000-4000-8000-000000000004'::uuid,
        'return_requested', 'return_required', 'Future return shipment', 'return_required',
        interval '-3 hours', interval '2 hours')
) fixture(
    order_number, public_id, reason, status, description, outcome,
    response_delta, return_delta
)
join commerce.orders order_row on order_row.order_number = fixture.order_number;

do $smoke$
declare
    first_run jsonb := commerce.process_due_order_deadlines('order-deadlines-smoke', 10);
    replay jsonb;
    event_kinds text[];
begin
    select array_agg(item.value->>'kind' order by item.ordinality)
    into event_kinds
    from jsonb_array_elements(first_run->'events') with ordinality item(value, ordinality);
    if first_run->>'runKey' <> 'order-deadlines-smoke'
        or (first_run->>'processed')::integer <> 4
        or event_kinds <> array[
            'fulfillment_seller_handoff', 'fulfillment_scan_grace',
            'seller_response_deadline', 'return_ship_deadline'
        ] then
        raise exception 'order deadlines: event order changed: %', first_run;
    end if;

    if not exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        join commerce.financial_exceptions exception on exception.order_id = order_row.id
        where order_row.order_number = 'DEADLINE-FULFILLMENT-DUE'
          and fulfillment.status = 'manual_review'
          and fulfillment.blocking_reason = 'scan_grace_elapsed_without_carrier_acceptance'
          and settlement.status = 'manual_review'
          and settlement.manual_review_reason = 'fulfillment_reconciliation_required'
          and exception.deduplication_key = 'deadline:fulfillment:' || order_row.id
          and exception.reason = 'Scan grace elapsed without trusted carrier acceptance'
    ) or exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        where order_row.order_number = 'DEADLINE-FULFILLMENT-FUTURE'
          and (fulfillment.status <> 'label_created' or settlement.status <> 'held')
    ) then
        raise exception 'order deadlines: fulfillment state changed';
    end if;

    if not exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        join commerce.financial_exceptions exception on exception.order_id = order_row.id
        where order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DUE'
          and fulfillment.status = 'label_created'
          and fulfillment.blocking_reason =
              'seller_handoff_deadline_elapsed_without_declaration'
          and settlement.status = 'held'
          and exception.deduplication_key =
              'deadline:seller-handoff:' || order_row.id
          and exception.severity = 'medium'
    ) or exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        where order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DECLARED'
          and (
              fulfillment.status <> 'seller_handoff_declared'
              or fulfillment.blocking_reason is not null
              or settlement.status <> 'held'
          )
    ) then
        raise exception 'order deadlines: seller handoff and scan grace were not separated';
    end if;

    perform commerce.record_order_fulfillment_projection(
        (
            select order_row.public_id
            from commerce.orders order_row
            where order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DUE'
        ),
        'deadline-seller-handoff-carrier-recovery',
        'carrier_accepted',
        clock_timestamp(),
        'deadline-seller-handoff-shipment',
        null,
        clock_timestamp(),
        null
    );
    if not exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        join commerce.financial_exceptions exception on exception.order_id = order_row.id
        where order_row.order_number = 'DEADLINE-SELLER-HANDOFF-DUE'
          and fulfillment.status = 'carrier_accepted'
          and fulfillment.blocking_reason is null
          and settlement.status = 'held'
          and exception.deduplication_key =
              'deadline:seller-handoff:' || order_row.id
          and exception.status = 'resolved'
          and exception.resolved_by = 'trusted-carrier-acceptance'
    ) then
        raise exception 'order deadlines: trusted carrier recovery did not clear the seller block';
    end if;

    if (select count(*)
        from commerce.marketplace_claims claim
        join commerce.orders order_row on order_row.id = claim.order_id
        join commerce.marketplace_claim_events event on event.claim_id = claim.id
        where order_row.order_number in (
            'DEADLINE-SELLER-RESPONSE-DUE', 'DEADLINE-RETURN-SHIP-DUE'
        ) and claim.status = 'under_review'
          and event.actor_kind = 'system'
          and event.actor_id = 'deadline-worker:order-deadlines-smoke'
          and event.message = 'Deadline elapsed; manual review is required before any financial decision'
          and event.event_type = case order_row.order_number
              when 'DEADLINE-SELLER-RESPONSE-DUE' then 'seller_response_deadline'
              else 'return_ship_deadline' end
          and event.data->>'previousStatus' = case order_row.order_number
              when 'DEADLINE-SELLER-RESPONSE-DUE' then 'awaiting_seller_response'
              else 'return_required' end) <> 2
        or exists (
            select 1
            from commerce.marketplace_claims claim
            join commerce.orders order_row on order_row.id = claim.order_id
            where (order_row.order_number = 'DEADLINE-SELLER-RESPONSE-FUTURE'
                    and claim.status <> 'awaiting_seller_response')
               or (order_row.order_number = 'DEADLINE-RETURN-SHIP-FUTURE'
                    and claim.status <> 'return_required')
        ) then
        raise exception 'order deadlines: claim state or durable message changed';
    end if;

    replay := commerce.process_due_order_deadlines('order-deadlines-smoke', 10);
    if (replay->>'processed')::integer <> 0 or replay->'events' <> '[]'::jsonb
        or (select count(*) from commerce.marketplace_claim_events event
            join commerce.marketplace_claims claim on claim.id = event.claim_id
            join commerce.orders order_row on order_row.id = claim.order_id
            where order_row.order_number like 'DEADLINE-%') <> 2
        or (select count(*) from commerce.audit_events audit
            join commerce.orders order_row on order_row.id = audit.order_id
            where order_row.order_number like 'DEADLINE-%') <> 5
        or (select count(*) from commerce.outbox_events outbox
            join commerce.orders order_row on order_row.id = outbox.order_id
            where order_row.order_number like 'DEADLINE-%') <> 5 then
        raise exception 'order deadlines: replay was not idempotent: %', replay;
    end if;
end;
$smoke$;
rollback;
