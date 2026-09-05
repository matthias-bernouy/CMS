\set ON_ERROR_STOP on

begin;
set local role service_role;

select (commerce.upsert_custom_field(
    'offer', 'racketCondition', 'Racket condition', 'enum',
    '["used", "new"]'::jsonb, false, true, true, true, true
)->>'key') as custom_field_key \gset

select (commerce.upsert_product(
    null,
    '{"slug":"smoke-racket","title":"Smoke racket","status":"active","visibility":"public"}'::jsonb
)->>'id')::bigint as product_id \gset

select (commerce.register_my_seller(
    'smoke-payout-eligible-user', 'Smoke payout eligible seller'
)->>'id')::bigint as payout_eligible_seller_id \gset

do $$
declare
    first_result jsonb;
    replay_result jsonb;
    v_seller_id bigint;
begin
    select id into v_seller_id
    from commerce.sellers
    where cms_user_id = 'smoke-payout-eligible-user';
    first_result := commerce.verify_pending_seller_payout_eligibility(
        'smoke-payout-eligible-user',
        v_seller_id,
        1,
        'stripe',
        'acct_smoke_payout_eligible'
    );
    if first_result->>'transitioned' <> 'true'
        or first_result->'seller'->>'verification_status' <> 'verified'
        or first_result->'seller'->>'verified_by' <> 'system:payout-eligibility' then
        raise exception 'smoke: pending payout-eligible seller was not verified';
    end if;

    replay_result := commerce.verify_pending_seller_payout_eligibility(
        'smoke-payout-eligible-user',
        v_seller_id,
        1,
        'stripe',
        'acct_smoke_payout_eligible'
    );
    if replay_result->>'idempotentReplay' <> 'true'
        or replay_result->>'transitioned' <> 'false' then
        raise exception 'smoke: payout eligibility replay was not idempotent';
    end if;
    if (
        select count(*)
        from commerce.seller_verification_events event
        where event.seller_id = v_seller_id
          and actor_id = 'system:payout-eligibility'
    ) <> 1 then
        raise exception 'smoke: payout eligibility replay duplicated its audit event';
    end if;
end;
$$;

select (commerce.register_my_seller(
    'smoke-rejected-payout-user', 'Smoke rejected payout seller'
)->>'id')::bigint as rejected_payout_seller_id \gset

select commerce.review_seller(
    :rejected_payout_seller_id, 'rejected', 'smoke-admin', 'rejected before payout eligibility', 1
);

do $$
declare v_seller_id bigint;
begin
    select id into v_seller_id
    from commerce.sellers
    where cms_user_id = 'smoke-rejected-payout-user';
    begin
        perform commerce.verify_pending_seller_payout_eligibility(
            'smoke-rejected-payout-user',
            v_seller_id,
            2,
            'stripe',
            'acct_smoke_rejected'
        );
        raise exception 'smoke: payout eligibility overrode a rejected seller';
    exception when others then
        if sqlerrm = 'smoke: payout eligibility overrode a rejected seller'
            or sqlerrm <> 'forbidden: seller payout eligibility cannot override marketplace review' then
            raise;
        end if;
    end;
end;
$$;

select (commerce.register_my_seller(
    'smoke-seller-user', 'Smoke seller'
)->>'id')::bigint as seller_id \gset

select result->>'version' as seller_version
from (select commerce.review_seller(
    :seller_id, 'verified', 'smoke-admin', null, 1
) as result) reviewed \gset

select result->>'id' as offer_id, result->>'version' as offer_version
from (select commerce.create_my_offer(
    'smoke-seller-user',
    jsonb_build_object(
        'productId', :product_id,
        'slug', 'smoke-offer',
        'title', 'Smoke offer',
        'conditionCode', 'very_good',
        'quantityAvailable', 5,
        'metadata', jsonb_build_object('racketCondition', 'used')
    )
) as result) created \gset

select result->>'version' as offer_version
from (select commerce.submit_my_offer(
    :offer_id, 'smoke-seller-user', :offer_version
) as result) submitted \gset

select result->>'version' as offer_version
from (select commerce.review_offer(
    :offer_id, 'request_price', 'smoke-admin', :offer_version, 11000, 15000
) as result) reviewed \gset

do $$
declare offer commerce.offers%rowtype;
begin
    select * into offer from commerce.offers where slug = 'smoke-offer';
    begin
        perform commerce.submit_offer_price(offer.id, 'smoke-seller-user', 10000, offer.version);
        raise exception 'smoke: out-of-range price was accepted';
    exception when others then
        if sqlerrm = 'smoke: out-of-range price was accepted'
            or sqlerrm not like 'validation: price must be between 11000 and 15000%' then
            raise;
        end if;
    end;
end;
$$;

select result->'offer'->>'version' as offer_version
from (select commerce.submit_offer_price(
    :offer_id, 'smoke-seller-user', 12000, :offer_version
) as result) priced \gset

select result->>'version' as offer_version
from (select commerce.review_offer(
    :offer_id, 'approve', 'smoke-admin', :offer_version
) as result) approved \gset

do $$
declare
    v_list jsonb;
    v_detail jsonb;
begin
    v_list := commerce.list_public_offers_read_model(
        p_query => 'Smoke offer',
        p_limit => 10,
        p_offset => 0
    );
    if v_list->>'settings_available' <> 'true'
        or v_list->>'whole_unit_prices' <> 'false'
        or (v_list->>'total')::integer <> 1
        or v_list->'items'->0->>'slug' <> 'smoke-offer'
        or v_list->'items'->0->>'condition_label' <> 'Good'
        or v_list->'items'->0 ? 'seller_id'
        or v_list->'items'->0->'metadata'->>'racketCondition' <> 'used' then
        raise exception 'smoke: public offer list read model changed its contract';
    end if;

    v_detail := commerce.get_public_offer_read_model(p_slug => 'smoke-offer');
    if v_detail->>'candidate_exists' <> 'true'
        or v_detail->>'settings_available' <> 'true'
        or v_detail->'offer'->>'slug' <> 'smoke-offer'
        or v_detail->'offer'->>'condition_label' <> 'Good'
        or v_detail->'offer' ? 'seller_id'
        or v_detail->'offer'->'metadata'->>'racketCondition' <> 'used' then
        raise exception 'smoke: public offer detail read model changed its contract';
    end if;

    if exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname in ('list_public_offers_read_model', 'get_public_offer_read_model')
          and (has_function_privilege('anon', procedure.oid, 'execute')
            or has_function_privilege('authenticated', procedure.oid, 'execute')
            or not has_function_privilege('service_role', procedure.oid, 'execute'))
    ) then
        raise exception 'smoke: public offer read models have unsafe privileges';
    end if;
end;
$$;

do $$
begin
    begin
        perform commerce.create_order_from_offers(
            'smoke-seller-user',
            'smoke-self-purchase-key',
            jsonb_build_array(jsonb_build_object(
                'offerId', (select id from commerce.offers where slug = 'smoke-offer'),
                'quantity', 1
            ))
        );
        raise exception 'smoke: seller purchased their own offer';
    exception when others then
        if sqlerrm = 'smoke: seller purchased their own offer'
            or sqlerrm <> 'forbidden: buyers cannot purchase their own offer' then
            raise;
        end if;
    end;
end;
$$;

select result->>'id' as order_id, result->>'version' as order_version
from (select commerce.create_order_from_offers(
    'smoke-buyer-user',
    'smoke-checkout-key',
    jsonb_build_array(jsonb_build_object('offerId', :offer_id, 'quantity', 5)),
    '{"city":"Paris"}'::jsonb
) as result) ordered \gset

do $$
declare replay jsonb;
begin
    select commerce.create_order_from_offers(
        'smoke-buyer-user',
        'smoke-checkout-key',
        jsonb_build_array(jsonb_build_object('offerId', offer.id, 'quantity', 5)),
        '{"city":"Paris"}'::jsonb
    ) into replay from commerce.offers offer where offer.slug = 'smoke-offer';
    if replay->>'idempotent_replay' <> 'true' then
        raise exception 'smoke: order replay was not detected';
    end if;
    if (select quantity_available from commerce.offers where slug = 'smoke-offer') <> 0 then
        raise exception 'smoke: inventory was reserved more than once';
    end if;
end;
$$;

select result->>'version' as offer_version
from (select commerce.update_my_offer(
    :offer_id, 'smoke-seller-user',
    (select version from commerce.offers where id = :offer_id),
    '{"availability":"unavailable"}'::jsonb
) as result) inventory_updated \gset

select commerce.request_order_cancellation(
    :order_id, 'buyer', 'smoke-buyer-user', 'smoke cancellation before payment'
);

do $$
declare
    v_order_id bigint;
    v_request_id bigint;
    v_replay jsonb;
begin
    select id into strict v_order_id
    from commerce.orders
    where buyer_cms_user_id = 'smoke-buyer-user'
      and idempotency_key = 'smoke-checkout-key';
    select id into v_request_id
    from commerce.order_cancellation_requests
    where order_id = v_order_id;
    v_replay := commerce.request_order_cancellation(
        v_order_id, 'buyer', 'smoke-buyer-user', 'smoke cancellation before payment'
    );
    if (v_replay->>'id')::bigint is distinct from v_request_id then
        raise exception 'smoke: exact cancellation replay did not return the original request';
    end if;
    if (select count(*) from commerce.order_cancellation_requests where order_id = v_order_id) <> 1 then
        raise exception 'smoke: exact cancellation replay created a duplicate request';
    end if;
    if (select quantity_available from commerce.offers where slug = 'smoke-offer') <> 5 then
        raise exception 'smoke: cancelled inventory was not restored';
    end if;
    if (select availability from commerce.offers where slug = 'smoke-offer') <> 'unavailable' then
        raise exception 'smoke: cancellation overwrote a later availability decision';
    end if;
    perform commerce.update_my_offer(
        offer.id, 'smoke-seller-user', offer.version,
        '{"publicationStatus":"paused"}'::jsonb
    ) from commerce.offers offer where offer.slug = 'smoke-offer';
    if (select publication_status from commerce.offers where slug = 'smoke-offer') <> 'paused' then
        raise exception 'smoke: seller could not pause an active offer';
    end if;
    if has_schema_privilege('anon', 'commerce', 'usage')
        or has_schema_privilege('authenticated', 'commerce', 'usage') then
        raise exception 'smoke: private Commerce schema is exposed';
    end if;
end;
$$;

select (commerce.register_my_seller(
    'smoke-pending-seller-user', 'Smoke pending seller'
)->>'id')::bigint as pending_seller_id \gset

select result->>'id' as pending_offer_id, result->>'version' as pending_offer_version
from (select commerce.create_my_offer(
    'smoke-pending-seller-user',
    jsonb_build_object(
        'productId', :product_id,
        'slug', 'smoke-pending-offer',
        'title', 'Smoke pending offer',
        'conditionCode', 'very_good',
        'quantityAvailable', 1,
        'metadata', jsonb_build_object('racketCondition', 'used')
    )
) as result) created \gset

select result->>'version' as pending_offer_version
from (select commerce.submit_my_offer(
    :pending_offer_id, 'smoke-pending-seller-user', :pending_offer_version
) as result) submitted \gset

select result->>'version' as pending_offer_version
from (select commerce.review_offer(
    :pending_offer_id, 'request_price', 'smoke-admin', :pending_offer_version, 11000, 15000
) as result) reviewed \gset

select result->'offer'->>'version' as pending_offer_version
from (select commerce.submit_offer_price(
    :pending_offer_id, 'smoke-pending-seller-user', 12000, :pending_offer_version
) as result) priced \gset

select result->>'version' as pending_offer_version
from (select commerce.review_offer(
    :pending_offer_id, 'approve', 'smoke-admin', :pending_offer_version
) as result) approved \gset

do $$
declare
    public_results jsonb;
    pending_offer_id bigint;
begin
    select id into pending_offer_id from commerce.offers where slug = 'smoke-pending-offer';
    if (select publication_status from commerce.offers where id = pending_offer_id) <> 'active' then
        raise exception 'smoke: an unverified seller offer could not complete publication';
    end if;
    public_results := commerce.search_public_offers(
        p_query => 'Smoke pending offer'
    );
    if (public_results->>'total')::integer <> 0 then
        raise exception 'smoke: an unverified seller offer was publicly visible';
    end if;
    begin
        perform commerce.create_order_from_offers(
            'smoke-pending-buyer-user',
            'smoke-pending-checkout-key',
            jsonb_build_array(jsonb_build_object('offerId', pending_offer_id, 'quantity', 1))
        );
        raise exception 'smoke: an unverified seller offer was purchased';
    exception when others then
        if sqlerrm = 'smoke: an unverified seller offer was purchased'
            or sqlerrm not like 'conflict: seller for offer % is not allowed to sell' then
            raise;
        end if;
    end;
end;
$$;

rollback;
