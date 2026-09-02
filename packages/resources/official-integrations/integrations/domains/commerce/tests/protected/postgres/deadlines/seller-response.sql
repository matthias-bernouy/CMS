-- Seller claim response deadline behavior.
\set ON_ERROR_STOP on

begin;
set local role service_role;

insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values (
    'user',
    'deadline-response-seller',
    'deadline-response-seller',
    'Deadline response seller'
) returning id as deadline_response_seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
)
select
    'deadline-response-buyer-' || fixture.key,
    'deadline-response-checkout-' || fixture.key,
    md5('deadline-response-checkout-' || fixture.key)
from (values ('late'), ('future')) fixture(key);

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, total_amount,
    idempotency_key, request_hash
)
select
    'DEADLINE-RESPONSE-' || upper(fixture.key),
    checkout.id,
    :deadline_response_seller_id,
    checkout.buyer_cms_user_id,
    'active',
    'eur',
    100,
    100,
    'deadline-response-checkout-' || fixture.key,
    md5('deadline-response-checkout-' || fixture.key)
from (values ('late'), ('future')) fixture(key)
join commerce.checkout_groups checkout
  on checkout.idempotency_key = 'deadline-response-checkout-' || fixture.key;

insert into commerce.marketplace_claims (
    order_id, buyer_cms_user_id, seller_id, reason, status,
    description, seller_response_by_at
)
select
    order_row.id,
    order_row.buyer_cms_user_id,
    order_row.seller_id,
    'damaged',
    'awaiting_seller_response',
    'Seller response deadline contract ' || fixture.key,
    clock_timestamp() + fixture.deadline_delta
from (
    values
        ('DEADLINE-RESPONSE-LATE', 'late', interval '-1 second'),
        ('DEADLINE-RESPONSE-FUTURE', 'future', interval '1 hour')
) fixture(order_number, key, deadline_delta)
join commerce.orders order_row on order_row.order_number = fixture.order_number;

do $seller_response_deadline$
declare
    v_late commerce.marketplace_claims%rowtype;
    v_future commerce.marketplace_claims%rowtype;
    v_result jsonb;
begin
    select claim.* into strict v_late
    from commerce.marketplace_claims claim
    join commerce.orders order_row on order_row.id = claim.order_id
    where order_row.order_number = 'DEADLINE-RESPONSE-LATE';

    begin
        perform commerce.respond_marketplace_claim(
            v_late.id,
            'deadline-response-seller',
            'This response is too late',
            v_late.version
        );
        raise exception 'test: late seller response passed';
    exception when others then
        if sqlerrm = 'test: late seller response passed'
            or sqlerrm <> 'conflict: seller response deadline elapsed'
        then
            raise;
        end if;
    end;

    if not exists (
        select 1
        from commerce.marketplace_claims claim
        where claim.id = v_late.id
          and claim.status = 'awaiting_seller_response'
          and claim.version = v_late.version
    ) or exists (
        select 1
        from commerce.marketplace_claim_events event
        where event.claim_id = v_late.id
    )
    then
        raise exception 'protected deadlines: late seller rejection mutated the claim';
    end if;

    select claim.* into strict v_future
    from commerce.marketplace_claims claim
    join commerce.orders order_row on order_row.id = claim.order_id
    where order_row.order_number = 'DEADLINE-RESPONSE-FUTURE';
    v_result := commerce.respond_marketplace_claim(
        v_future.id,
        'deadline-response-seller',
        'This response is on time',
        v_future.version
    );
    if v_result->>'status' <> 'under_review'
        or (v_result->>'version')::integer <> v_future.version + 1
        or (
            select count(*) <> 1
            from commerce.marketplace_claim_events event
            where event.claim_id = v_future.id
              and event.event_type = 'seller_responded'
        )
    then
        raise exception 'protected deadlines: on-time seller response was not accepted once';
    end if;
end;
$seller_response_deadline$;

rollback;
