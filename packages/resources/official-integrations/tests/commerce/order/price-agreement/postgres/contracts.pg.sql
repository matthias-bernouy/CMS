\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled Commerce + negotiation SQL bundle.'
    \quit 3
\endif

\if :{?allow_price_agreement_schema_reset}
\else
    \echo 'Set allow_price_agreement_schema_reset=true on a disposable database.'
    \quit 3
\endif

drop schema if exists commerce_negotiation cascade;
drop schema if exists commerce cascade;
drop schema if exists commerce_price_agreement_test cascade;
drop function if exists commerce_order_creation_test_wait(text, integer);

do $roles$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

create extension if not exists dblink;

create function commerce_order_creation_test_wait(
    p_application_name text,
    p_timeout_ms integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_deadline timestamptz := clock_timestamp()
        + (p_timeout_ms::text || ' milliseconds')::interval;
begin
    loop
        if exists (
            select 1
            from pg_locks lock_row
            join pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and not lock_row.granted
        ) then
            return;
        end if;
        if clock_timestamp() >= v_deadline then
            raise exception 'session % did not block', p_application_name;
        end if;
        perform pg_sleep(0.01);
    end loop;
end;
$$;

do $migration_contract$
declare
    v_constraint text;
    v_unindexed_constraint text;
begin
    foreach v_constraint in array array[
        'price_agreements_authority_version_positive',
        'price_agreements_subtotal_supported',
        'order_lines_offer_price_agreement_fk',
        'negotiation_settings_checkout_ttl',
        'negotiation_proposals_offer_media_positive',
        'negotiation_proposals_checkout_link',
        'negotiation_proposals_commerce_agreement_fk'
    ]
    loop
        if not exists (select 1 from pg_constraint where conname = v_constraint) then
            raise exception 'price agreement migration constraint is missing: %', v_constraint;
        end if;
    end loop;
    if (
        select count(*)
        from information_schema.columns
        where (table_schema, table_name, column_name) in (
            ('commerce', 'price_agreements', 'authority_version'),
            ('commerce', 'order_lines', 'price_agreement_id'),
            ('commerce_negotiation', 'settings', 'accepted_checkout_ttl_hours'),
            ('commerce_negotiation', 'proposals', 'commerce_agreement_id'),
            ('commerce_negotiation', 'proposals', 'checkout_expires_at')
        )
    ) <> 5 then
        raise exception 'price agreement migration columns are incomplete';
    end if;

    select constraint_name
    into v_unindexed_constraint
    from unnest(array[
        'order_lines_offer_price_agreement_fk',
        'price_agreements_offer_seller_fk',
        'price_agreements_seller_id_fkey',
        'seller_sale_capabilities_capability_key_fkey'
    ]) as expected(constraint_name)
    where not exists (
        select 1
        from pg_constraint constraint_row
        join pg_index index_row
          on index_row.indrelid = constraint_row.conrelid
        where constraint_row.conname = expected.constraint_name
          and constraint_row.contype = 'f'
          and index_row.indpred is null
          and index_row.indisvalid
          and index_row.indisready
          and (
              index_row.indkey::smallint[]
          )[0:cardinality(constraint_row.conkey) - 1]
              operator(pg_catalog.@>) constraint_row.conkey
    )
    limit 1;

    if v_unindexed_constraint is not null then
        raise exception 'price agreement foreign key lacks a covering index: %',
            v_unindexed_constraint;
    end if;
end;
$migration_contract$;

create schema commerce_price_agreement_test;

create function commerce_price_agreement_test.delete_agreement_as_owner(
    p_agreement_id bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
    delete from commerce.price_agreements where id = p_agreement_id;
$$;

grant usage on schema commerce_price_agreement_test to service_role;
grant execute on function commerce_price_agreement_test.delete_agreement_as_owner(bigint)
    to service_role;

begin;
set local role service_role;

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status,
    verified_at, verified_by
) values
    ('user', 'agreement-ready-seller', 'agreement-ready-seller',
        'Ready Seller', 'verified', now(), 'contract'),
    ('user', 'agreement-blocked-seller', 'agreement-blocked-seller',
        'Blocked Seller', 'verified', now(), 'contract');

insert into commerce.products (slug, title, status, visibility)
select slug || '-product', title || ' Product', 'active', 'public'
from (values
    ('agreement-main', 'Main'),
    ('agreement-invalid-metadata', 'Invalid metadata'),
    ('agreement-expiry', 'Expiry'),
    ('agreement-cancel', 'Cancel'),
    ('agreement-double-click', 'Double click'),
    ('agreement-race', 'Race'),
    ('agreement-registration-race', 'Registration race'),
    ('agreement-validation', 'Validation'),
    ('agreement-blocked', 'Blocked')
) fixture(slug, title);

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount, currency,
    availability, quantity_available, inventory_revision
)
select
    seller.id, product.id, fixture.slug, fixture.title,
    'very_good', 'active', 'approved', fixture.listing_amount,
    fixture.currency, fixture.availability, fixture.quantity_available, 1
from (values
    ('agreement-main', 'Main offer', 11000::bigint, 'eur', 'available', 1, 'agreement-ready-seller'),
    ('agreement-invalid-metadata', 'Invalid metadata offer', 16000::bigint, 'eur', 'available', 2, 'agreement-ready-seller'),
    ('agreement-expiry', 'Expiry offer', 17000::bigint, 'eur', 'available', 2, 'agreement-ready-seller'),
    ('agreement-cancel', 'Cancel offer', 18000::bigint, 'eur', 'available', 1, 'agreement-ready-seller'),
    ('agreement-double-click', 'Double click offer', 19000::bigint, 'eur', 'available', 1, 'agreement-ready-seller'),
    ('agreement-race', 'Race offer', 20000::bigint, 'eur', 'available', 1, 'agreement-ready-seller'),
    ('agreement-registration-race', 'Registration race offer', 20500::bigint, 'eur', 'available', 1, 'agreement-ready-seller'),
    ('agreement-validation', 'Validation offer', 21000::bigint, 'eur', 'available', 2, 'agreement-ready-seller'),
    ('agreement-blocked', 'Blocked offer', 22000::bigint, 'eur', 'available', 1, 'agreement-blocked-seller')
) fixture(slug, title, listing_amount, currency, availability, quantity_available, seller_slug)
join commerce.products product on product.slug = fixture.slug || '-product'
join commerce.sellers seller on seller.slug = fixture.seller_slug;

select commerce.activate_sale_capability_requirement(
    'protected_payment',
    'user',
    array['agreement-ready-seller'],
    'price-agreement-contract',
    now()
);

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options, required,
    self_editable, admin_editable, enabled
) values (
    'order', 'checkout_channel', 'Checkout channel', 'enum',
    '["web","mobile"]'::jsonb, false, true, true, true
);

do $capability_invariant$
declare
    v_blocked commerce.offers%rowtype;
    v_context jsonb;
    v_orders_before bigint;
begin
    select * into strict v_blocked from commerce.offers where slug = 'agreement-blocked';
    select count(*) into v_orders_before from commerce.orders;
    v_context := commerce.get_offer_negotiation_context(v_blocked.id);
    if v_context ->> 'state' <> 'not_found'
       or commerce.get_public_offer_read_model(v_blocked.id, null)->'offer'
            is distinct from 'null'::jsonb then
        raise exception 'non-ready seller offer leaked into negotiation/public read models';
    end if;
    begin
        perform commerce.submit_offer_price(
            v_blocked.id, 'agreement-blocked-seller', 22000, v_blocked.version
        );
        raise exception 'test: non-ready seller submitted a raw offer price';
    exception when others then
        if sqlerrm = 'test: non-ready seller submitted a raw offer price'
           or sqlerrm <> 'conflict: seller protected sale capability is not ready' then
            raise;
        end if;
    end;
    begin
        perform commerce.create_order_from_offers(
            'blocked-order-buyer',
            'blocked-order-key',
            jsonb_build_array(jsonb_build_object(
                'offerId', v_blocked.id,
                'quantity', 1
            ))
        );
        raise exception 'test: non-ready seller bypassed raw generic order creation';
    exception when others then
        if sqlerrm = 'test: non-ready seller bypassed raw generic order creation'
           or sqlerrm <> format(
               'conflict: seller for offer %s is not ready for protected sale',
               v_blocked.id
           ) then
            raise;
        end if;
    end;
    if (select count(*) from commerce.orders) <> v_orders_before
       or (select quantity_available from commerce.offers where id = v_blocked.id)
            <> v_blocked.quantity_available then
        raise exception 'blocked raw order mutated order or inventory state';
    end if;
    begin
        perform commerce_negotiation.create_proposal(
            v_blocked.id, v_blocked.slug, v_blocked.title,
            'agreement-blocked-seller', 'Blocked Seller', 'blocked-buyer',
            v_blocked.accepted_price_amount, 20000, v_blocked.currency, null, null
        );
        raise exception 'test: non-ready seller received a raw proposal';
    exception when others then
        if sqlerrm = 'test: non-ready seller received a raw proposal'
           or sqlerrm <> 'conflict: offer is not available for negotiation' then
            raise;
        end if;
    end;
end;
$capability_invariant$;

do $accepted_terms$
declare
    v_offer commerce.offers%rowtype;
    v_created jsonb;
    v_accepted jsonb;
    v_proposal commerce_negotiation.proposals%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_notification_context jsonb;
    v_checkout jsonb;
    v_order commerce.orders%rowtype;
    v_line commerce.order_lines%rowtype;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-main';
    v_created := commerce_negotiation.create_proposal(
        v_offer.id, v_offer.slug, v_offer.title,
        'agreement-ready-seller', 'Ready Seller', 'agreement-main-buyer',
        v_offer.accepted_price_amount, 12000, v_offer.currency, '120?', null
    );
    v_accepted := commerce_negotiation.decide_proposal(
        (v_created->>'id')::bigint,
        'agreement-ready-seller',
        'accept',
        (v_created->>'version')::integer,
        null
    );
    select * into strict v_proposal
    from commerce_negotiation.proposals
    where id = (v_created->>'id')::bigint;
    select * into strict v_agreement
    from commerce.price_agreements
    where public_id = v_proposal.commerce_agreement_id;
    if v_proposal.status <> 'accepted'
       or v_proposal.version <> v_agreement.authority_version
       or v_agreement.authority_key <> 'commerce-negotiation'
       or v_agreement.authority_reference <> v_proposal.public_id::text
       or v_agreement.unit_amount <> 12000
       or v_agreement.quantity <> 1
       or v_agreement.status <> 'active'
       or v_offer.accepted_price_amount <> 11000
       or v_accepted->>'checkout_status' <> 'active'
       or (v_accepted->>'agreement_version')::integer <> v_proposal.version
       or commerce.get_public_offer_read_model(v_offer.id, null)->'offer'
            is distinct from 'null'::jsonb
       or not exists (
           select 1
           from commerce.notification_events event
           where event.event_type = 'commerce.price_agreement.accepted'
             and event.aggregate_version = v_proposal.version
             and event.payload->>'actionPath'
                 = '/checkout?agreementId=' || v_agreement.public_id::text
       ) then
        raise exception 'accepted negotiated terms contract changed: %, %',
            to_jsonb(v_proposal), to_jsonb(v_agreement);
    end if;

    select claimed.context into strict v_notification_context
    from commerce.claim_notifications('agreement-accepted-worker', 10) claimed
    where claimed.template_key = 'commerce.price_agreement.accepted';
    if v_notification_context ? 'order'
       or v_notification_context #>> '{agreement,id}' <> v_agreement.public_id::text
       or (v_notification_context #>> '{agreement,unitAmountMinor}')::bigint <> 12000
       or v_notification_context #>> '{agreement,subtotalAmountFormatted}' <> '120.00 EUR'
       or v_notification_context #>> '{offer,id}' <> v_offer.id::text
       or v_notification_context #>> '{action,path}'
            <> '/checkout?agreementId=' || v_agreement.public_id::text then
        raise exception 'accepted agreement notification context changed: %',
            v_notification_context;
    end if;

    v_checkout := commerce.create_order_from_price_agreement(
        'agreement-main-buyer',
        'agreement-main-checkout',
        v_agreement.public_id
    );
    select * into strict v_order
    from commerce.orders where id = (v_checkout->>'id')::bigint;
    select * into strict v_line
    from commerce.order_lines where order_id = v_order.id;
    if v_order.subtotal_amount <> 12000
       or v_order.total_amount <> 12000
       or v_line.unit_amount <> 12000
       or v_line.total_amount <> 12000
       or v_line.price_agreement_id <> v_agreement.id
       or (select accepted_price_amount from commerce.offers where id = v_offer.id) <> 11000
       or (select status from commerce.price_agreements where id = v_agreement.id) <> 'consumed'
       or (v_checkout->>'idempotent_replay')::boolean then
        raise exception '11000 listing / 12000 agreement checkout contract changed';
    end if;

    update commerce_negotiation.proposals
    set checkout_expires_at = now() - interval '1 minute'
    where id = v_proposal.id;
    perform commerce_negotiation.expire_pending_proposals();
    if (select status from commerce_negotiation.proposals where id = v_proposal.id) <> 'accepted'
       or (select status from commerce.price_agreements where id = v_agreement.id) <> 'consumed' then
        raise exception 'consumed agreement was expired by TTL reconciliation';
    end if;
end;
$accepted_terms$;

do $registration_boundaries$
declare
    v_offer commerce.offers%rowtype;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-validation';
    begin
        perform commerce.register_price_agreement(
            'contract', 'bad-currency', 1, v_offer.id,
            'agreement-ready-seller', 'validation-buyer',
            20000, 'usd', 1, now() + interval '1 hour'
        );
        raise exception 'test: mismatched currency agreement was registered';
    exception when others then
        if sqlerrm = 'test: mismatched currency agreement was registered'
           or sqlerrm <> 'conflict: price agreement currency does not match the offer' then
            raise;
        end if;
    end;
    begin
        perform commerce.register_price_agreement(
            'contract', 'wrong-seller', 1, v_offer.id,
            'agreement-blocked-seller', 'validation-buyer',
            20000, 'eur', 1, now() + interval '1 hour'
        );
        raise exception 'test: wrong seller agreement was registered';
    exception when others then
        if sqlerrm = 'test: wrong seller agreement was registered'
           or sqlerrm <> 'forbidden: price agreement seller does not own the offer' then
            raise;
        end if;
    end;
    begin
        perform commerce.register_price_agreement(
            'contract', 'subtotal-overflow', 1, v_offer.id,
            'agreement-ready-seller', 'validation-buyer',
            9007199254740991, 'eur', 2, now() + interval '1 hour'
        );
        raise exception 'test: overflowing agreement was registered';
    exception when others then
        if sqlerrm = 'test: overflowing agreement was registered'
           or sqlerrm <> 'validation: price agreement subtotal exceeds the supported maximum' then
            raise;
        end if;
    end;
end;
$registration_boundaries$;

do $capability_snapshot_freshness$
declare
    v_capability commerce.seller_sale_capabilities%rowtype;
begin
    perform commerce.record_seller_sale_capability(
        'agreement-ready-seller',
        'protected_payment',
        false,
        'newer-runtime-observation'
    );
    perform commerce.activate_sale_capability_requirement(
        'protected_payment',
        'user',
        array['agreement-ready-seller'],
        'stale-install-snapshot',
        now() - interval '1 hour'
    );
    select capability.* into strict v_capability
    from commerce.seller_sale_capabilities capability
    join commerce.sellers seller on seller.id = capability.seller_id
    where seller.cms_user_id = 'agreement-ready-seller'
      and capability.capability_key = 'protected_payment';
    if v_capability.ready
       or v_capability.evidence_reference <> 'newer-runtime-observation' then
        raise exception 'stale installation snapshot overwrote newer capability evidence';
    end if;
    perform commerce.record_seller_sale_capability(
        'agreement-ready-seller',
        'protected_payment',
        true,
        'contract-restored'
    );
end;
$capability_snapshot_freshness$;

do $immutable_terms$
declare
    v_offer commerce.offers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_statement text;
    v_unrelated_order_id bigint;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-validation';
    select * into strict v_agreement
    from jsonb_populate_record(
        null::commerce.price_agreements,
        commerce.register_price_agreement(
            'contract', 'immutable', 1, v_offer.id,
            'agreement-ready-seller', 'immutable-buyer',
            20000, 'eur', 1, now() + interval '1 hour'
        )
    );
    foreach v_statement in array array[
        format('update commerce.price_agreements set id = id + 100000 where id = %s', v_agreement.id),
        format('update commerce.price_agreements set public_id = gen_random_uuid() where id = %s', v_agreement.id),
        format('update commerce.price_agreements set authority_key = %L where id = %s', 'changed', v_agreement.id),
        format('update commerce.price_agreements set authority_reference = %L where id = %s', 'changed', v_agreement.id),
        format('update commerce.price_agreements set authority_version = 2 where id = %s', v_agreement.id),
        format('update commerce.price_agreements set offer_id = %s where id = %s',
            (select id from commerce.offers where slug = 'agreement-race'), v_agreement.id),
        format('update commerce.price_agreements set seller_id = %s where id = %s',
            (select id from commerce.sellers where slug = 'agreement-blocked-seller'), v_agreement.id),
        format('update commerce.price_agreements set buyer_cms_user_id = %L where id = %s',
            'changed-buyer', v_agreement.id),
        format('update commerce.price_agreements set unit_amount = 19900 where id = %s', v_agreement.id),
        format('update commerce.price_agreements set currency = %L where id = %s', 'usd', v_agreement.id),
        format('update commerce.price_agreements set quantity = 2 where id = %s', v_agreement.id),
        format('update commerce.price_agreements set expires_at = expires_at + interval %L where id = %s',
            '1 hour', v_agreement.id),
        format('update commerce.price_agreements set created_at = created_at - interval %L where id = %s',
            '1 hour', v_agreement.id)
    ]
    loop
        begin
            execute v_statement;
            raise exception 'test: immutable price agreement term changed';
        exception when others then
            if sqlerrm = 'test: immutable price agreement term changed'
               or sqlerrm <> 'conflict: price agreement terms are immutable' then
                raise;
            end if;
        end;
    end loop;
    if has_table_privilege('service_role', 'commerce.price_agreements', 'delete') then
        raise exception 'service role unexpectedly has direct price agreement delete privilege';
    end if;
    begin
        perform commerce_price_agreement_test.delete_agreement_as_owner(v_agreement.id);
        raise exception 'test: price agreement was deleted';
    exception when others then
        if sqlerrm = 'test: price agreement was deleted'
           or sqlerrm <> 'conflict: price agreements cannot be deleted' then
            raise;
        end if;
    end;
    begin
        insert into commerce.orders (
            order_number, seller_id, buyer_cms_user_id, currency,
            subtotal_amount, total_amount, idempotency_key, request_hash
        ) values (
            'UNRELATED-AGREEMENT-ORDER', v_offer.seller_id, 'unrelated-buyer',
            'eur', 20000, 20000, 'unrelated-agreement-order',
            '00000000000000000000000000000000'
        ) returning id into v_unrelated_order_id;
        begin
            update commerce.price_agreements
            set status = 'consumed',
                order_id = v_unrelated_order_id,
                consumed_at = now()
            where id = v_agreement.id;
            raise exception 'test: agreement consumed into an unrelated order';
        exception when others then
            if sqlerrm = 'test: agreement consumed into an unrelated order'
               or sqlerrm <> 'conflict: consumed price agreement order does not match its terms' then
                raise;
            end if;
        end;
        raise exception 'test cleanup: rollback unrelated order fixture';
    exception when others then
        if sqlerrm <> 'test cleanup: rollback unrelated order fixture' then
            raise;
        end if;
    end;
    perform commerce.cancel_price_agreement('contract', 'immutable');
    begin
        update commerce.price_agreements
        set status = 'active'
        where id = v_agreement.id;
        raise exception 'test: terminal agreement was reactivated';
    exception when others then
        if sqlerrm = 'test: terminal agreement was reactivated'
           or sqlerrm <> 'conflict: terminal price agreement lifecycle is immutable' then
            raise;
        end if;
    end;
end;
$immutable_terms$;

do $unprocessable_no_mutation$
declare
    v_offer commerce.offers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_orders_before bigint;
    v_lines_before bigint;
    v_events_before bigint;
    v_quantity_before integer;
    v_revision_before integer;
begin
    select * into strict v_offer
    from commerce.offers where slug = 'agreement-invalid-metadata';
    select * into strict v_agreement
    from jsonb_populate_record(
        null::commerce.price_agreements,
        commerce.register_price_agreement(
            'contract', 'invalid-metadata', 1, v_offer.id,
            'agreement-ready-seller', 'invalid-metadata-buyer',
            13000, 'eur', 1, now() + interval '1 hour'
        )
    );
    select count(*) into v_orders_before from commerce.orders;
    select count(*) into v_lines_before from commerce.order_lines;
    select count(*) into v_events_before from commerce.order_events;
    select quantity_available, inventory_revision
    into v_quantity_before, v_revision_before
    from commerce.offers where id = v_offer.id;

    begin
        perform commerce.create_order_from_price_agreement(
            'invalid-metadata-buyer',
            'invalid-metadata-key',
            v_agreement.public_id,
            '{}'::jsonb,
            '{}'::jsonb,
            '{"checkout_channel":"fax"}'::jsonb
        );
        raise exception 'test: invalid enum created a negotiated order';
    exception when others then
        if sqlerrm = 'test: invalid enum created a negotiated order'
           or sqlerrm <> 'validation: custom field checkout_channel has an unsupported value' then
            raise;
        end if;
    end;

    if (select count(*) from commerce.orders) <> v_orders_before
       or (select count(*) from commerce.order_lines) <> v_lines_before
       or (select count(*) from commerce.order_events) <> v_events_before
       or (select (quantity_available, inventory_revision)
           from commerce.offers where id = v_offer.id)
          is distinct from row(v_quantity_before, v_revision_before)
       or (select (status, order_id, consumed_at)
           from commerce.price_agreements where id = v_agreement.id)
          is distinct from row('active'::text, null::bigint, null::timestamptz) then
        raise exception '422 custom-field failure mutated order, line, inventory, or agreement state';
    end if;
end;
$unprocessable_no_mutation$;

do $checkout_contract$
declare
    v_offer commerce.offers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_result jsonb;
    v_replay jsonb;
    v_order commerce.orders%rowtype;
    v_line commerce.order_lines%rowtype;
begin
    select * into strict v_offer
    from commerce.offers where slug = 'agreement-invalid-metadata';
    select * into strict v_agreement
    from commerce.price_agreements where authority_reference = 'invalid-metadata';
    begin
        perform commerce.create_order_from_price_agreement(
            'wrong-buyer', 'wrong-buyer-key', v_agreement.public_id
        );
        raise exception 'test: wrong buyer consumed an agreement';
    exception when others then
        if sqlerrm = 'test: wrong buyer consumed an agreement'
           or sqlerrm <> 'forbidden: price agreement does not belong to this buyer' then
            raise;
        end if;
    end;
    v_result := commerce.create_order_from_price_agreement(
        'invalid-metadata-buyer',
        'valid-negotiated-key',
        v_agreement.public_id,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"checkout_channel":"web"}'::jsonb
    );
    select * into strict v_order
    from commerce.orders where id = (v_result->>'id')::bigint;
    select * into strict v_line
    from commerce.order_lines where order_id = v_order.id;
    v_replay := commerce.create_order_from_price_agreement(
        'invalid-metadata-buyer',
        'second-click-key',
        v_agreement.public_id,
        '{}'::jsonb,
        '{}'::jsonb,
        '{"checkout_channel":"web"}'::jsonb
    );
    if v_order.subtotal_amount <> 13000
       or v_order.total_amount <> 13000
       or v_line.unit_amount <> 13000
       or v_line.total_amount <> 13000
       or v_line.price_agreement_id <> v_agreement.id
       or v_offer.accepted_price_amount <> 16000
       or (v_result->>'idempotent_replay')::boolean
       or not (v_replay->>'idempotent_replay')::boolean
       or (v_replay->>'public_id')::uuid <> v_order.public_id
       or (select count(*) from commerce.orders
           where buyer_cms_user_id = 'invalid-metadata-buyer') <> 1
       or (select count(*) from commerce.order_lines
           where price_agreement_id = v_agreement.id) <> 1
       or (select (status, order_id)
           from commerce.price_agreements where id = v_agreement.id)
          is distinct from row('consumed'::text, v_order.id) then
        raise exception 'negotiated checkout amount/idempotence contract changed';
    end if;
end;
$checkout_contract$;

do $offer_state_revalidation$
declare
    v_offer commerce.offers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-cancel';
    select * into strict v_agreement
    from jsonb_populate_record(
        null::commerce.price_agreements,
        commerce.register_price_agreement(
            'contract', 'preorder-revalidation', 1, v_offer.id,
            'agreement-ready-seller', 'preorder-buyer',
            14000, 'eur', 1, now() + interval '1 hour'
        )
    );
    update commerce.offers set availability = 'preorder' where id = v_offer.id;
    begin
        perform commerce.create_order_from_price_agreement(
            'preorder-buyer', 'preorder-key', v_agreement.public_id
        );
        raise exception 'test: preorder offer created a negotiated order';
    exception when others then
        if sqlerrm = 'test: preorder offer created a negotiated order'
           or sqlerrm <> 'conflict: price agreement offer is not sellable' then
            raise;
        end if;
    end;
    if (select status from commerce.price_agreements where id = v_agreement.id) <> 'active'
       or exists (
           select 1 from commerce.order_lines
           where price_agreement_id = v_agreement.id
       ) then
        raise exception 'failed preorder checkout mutated agreement/order state';
    end if;
    update commerce.offers set availability = 'available' where id = v_offer.id;
    perform commerce.cancel_price_agreement('contract', 'preorder-revalidation');
end;
$offer_state_revalidation$;

do $cancelled_contract$
declare
    v_offer commerce.offers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-cancel';
    select * into strict v_agreement
    from jsonb_populate_record(
        null::commerce.price_agreements,
        commerce.register_price_agreement(
            'contract', 'cancelled', 1, v_offer.id,
            'agreement-ready-seller', 'cancelled-buyer',
            14000, 'eur', 1, now() + interval '1 hour'
        )
    );
    perform commerce.cancel_price_agreement('contract', 'cancelled');
    begin
        perform commerce.create_order_from_price_agreement(
            'cancelled-buyer', 'cancelled-key', v_agreement.public_id
        );
        raise exception 'test: cancelled agreement created an order';
    exception when others then
        if sqlerrm = 'test: cancelled agreement created an order'
           or sqlerrm <> 'conflict: price agreement is not active' then
            raise;
        end if;
    end;
end;
$cancelled_contract$;

do $ttl_reconciliation$
declare
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_proposal_public_id uuid := gen_random_uuid();
    v_proposal commerce_negotiation.proposals%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_replacement jsonb;
begin
    select * into strict v_offer from commerce.offers where slug = 'agreement-expiry';
    select * into strict v_seller
    from commerce.sellers where id = v_offer.seller_id;
    insert into commerce.price_agreements (
        authority_key, authority_reference, authority_version,
        offer_id, seller_id, buyer_cms_user_id,
        unit_amount, currency, quantity, status,
        expires_at, created_at, updated_at
    ) values (
        'commerce-negotiation', v_proposal_public_id::text, 2,
        v_offer.id, v_offer.seller_id, 'expiry-buyer',
        15000, 'eur', 1, 'active',
        now() - interval '1 hour',
        now() - interval '2 hours',
        now() - interval '2 hours'
    ) returning * into v_agreement;
    insert into commerce_negotiation.proposals (
        public_id, commerce_offer_id, commerce_offer_slug, commerce_offer_title,
        seller_cms_user_id, seller_display_name, buyer_cms_user_id,
        reference_amount, minimum_amount, maximum_amount, proposed_amount,
        currency, status, version, expires_at, accepted_at,
        commerce_agreement_id, checkout_expires_at,
        created_at, updated_at
    ) values (
        v_proposal_public_id, v_offer.id, v_offer.slug, v_offer.title,
        v_seller.cms_user_id, v_seller.display_name, 'expiry-buyer',
        v_offer.accepted_price_amount, 13600, 20400, 15000,
        'eur', 'accepted', 2, now() + interval '1 hour', now() - interval '2 hours',
        v_agreement.public_id, now() - interval '1 hour',
        now() - interval '2 hours', now() - interval '2 hours'
    ) returning * into v_proposal;
    perform commerce_negotiation.expire_pending_proposals();
    select * into strict v_proposal from commerce_negotiation.proposals
    where id = v_proposal.id;
    if v_proposal.status <> 'expired'
       or (select status from commerce.price_agreements where id = v_agreement.id) <> 'expired'
       or (commerce_negotiation.project_proposal(v_proposal)->>'checkout_status') <> 'expired'
       or commerce.get_offer_negotiation_context(v_offer.id)->>'state' <> 'ok'
       or commerce.get_public_offer_read_model(v_offer.id, null)->'offer'
            is not distinct from 'null'::jsonb then
        raise exception 'expired agreement did not release proposal/public offer';
    end if;
    v_replacement := commerce_negotiation.create_proposal(
        v_offer.id, v_offer.slug, v_offer.title,
        'agreement-ready-seller', 'Ready Seller', 'expiry-buyer',
        v_offer.accepted_price_amount, 15000, 'eur', null, null
    );
    if v_replacement->>'status' <> 'pending' then
        raise exception 'expired accepted proposal blocked a replacement proposal';
    end if;
end;
$ttl_reconciliation$;

commit;

create table commerce_price_agreement_test.mutations (
    agreement_id bigint not null,
    order_id bigint not null
);

create function commerce_price_agreement_test.block_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.price_agreement_id is not null then
        insert into commerce_price_agreement_test.mutations
        values (new.price_agreement_id, new.order_id);
        perform pg_catalog.pg_advisory_xact_lock(746201);
    end if;
    return new;
end;
$$;

create function commerce_price_agreement_test.checkout_attempt(
    p_buyer text,
    p_key text,
    p_agreement uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    return jsonb_build_object(
        'state', 'ok',
        'result', commerce.create_order_from_price_agreement(
            p_buyer, p_key, p_agreement
        )
    );
exception when others then
    return jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;

create function commerce_price_agreement_test.generic_checkout_attempt(
    p_buyer text,
    p_key text,
    p_offer_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    return jsonb_build_object(
        'state', 'ok',
        'result', commerce.create_order_from_offers(
            p_buyer,
            p_key,
            jsonb_build_array(jsonb_build_object(
                'offerId', p_offer_id,
                'quantity', 1
            ))
        )
    );
exception when others then
    return jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;

create function commerce_price_agreement_test.cancel_attempt(
    p_authority_key text,
    p_authority_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    return jsonb_build_object(
        'state', 'ok',
        'result', commerce.cancel_price_agreement(
            p_authority_key, p_authority_reference
        )
    );
exception when others then
    return jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;

create function commerce_price_agreement_test.registration_attempt(
    p_offer_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    return jsonb_build_object(
        'state', 'ok',
        'result', commerce.register_price_agreement(
            'contract',
            'registration-checkout-race',
            1,
            p_offer_id,
            'agreement-ready-seller',
            'registration-race-buyer',
            18000,
            'eur',
            1,
            now() + interval '1 hour'
        )
    );
exception when others then
    return jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;

grant usage on schema commerce_price_agreement_test to service_role;
grant insert, select on commerce_price_agreement_test.mutations to service_role;
grant execute on function commerce_price_agreement_test.checkout_attempt(text, text, uuid)
    to service_role;
grant execute on function commerce_price_agreement_test.generic_checkout_attempt(text, text, bigint)
    to service_role;
grant execute on function commerce_price_agreement_test.cancel_attempt(text, text)
    to service_role;
grant execute on function commerce_price_agreement_test.registration_attempt(bigint)
    to service_role;

select dblink_connect(
    'generic_registration_race',
    'dbname=' || current_database()
        || ' application_name=generic_registration_race options=-cstatement_timeout=10000'
);
select dblink_connect(
    'agreement_registration_race',
    'dbname=' || current_database()
        || ' application_name=agreement_registration_race options=-cstatement_timeout=10000'
);
select dblink_exec('generic_registration_race', 'set role service_role');
select dblink_exec('agreement_registration_race', 'set role service_role');
begin;
set local role service_role;
select id
from commerce.offers
where slug = 'agreement-registration-race'
for update;
select dblink_send_query(
    'generic_registration_race',
    $$select commerce_price_agreement_test.generic_checkout_attempt(
        'generic-registration-race-buyer',
        'generic-registration-race-key',
        (select id from commerce.offers where slug = 'agreement-registration-race')
    )$$
);
select commerce_order_creation_test_wait('generic_registration_race', 5000);
select dblink_send_query(
    'agreement_registration_race',
    $$select commerce_price_agreement_test.registration_attempt(
        (select id from commerce.offers where slug = 'agreement-registration-race')
    )$$
);
select commerce_order_creation_test_wait('agreement_registration_race', 5000);
commit;

create temporary table registration_race_results (
    kind text not null,
    result jsonb not null
);
insert into registration_race_results
select 'generic', result
from dblink_get_result('generic_registration_race') response(result jsonb);
insert into registration_race_results
select 'registration', result
from dblink_get_result('agreement_registration_race') response(result jsonb);
select dblink_disconnect('generic_registration_race');
select dblink_disconnect('agreement_registration_race');

do $generic_checkout_vs_registration$
declare
    v_offer commerce.offers%rowtype;
    v_order_count integer;
    v_agreement_count integer;
begin
    select * into strict v_offer
    from commerce.offers where slug = 'agreement-registration-race';
    select count(*) into v_order_count
    from commerce.orders
    where buyer_cms_user_id = 'generic-registration-race-buyer';
    select count(*) into v_agreement_count
    from commerce.price_agreements
    where authority_reference = 'registration-checkout-race'
      and status = 'active';
    if (select count(*) from registration_race_results
        where result->>'state' = 'ok') <> 1
       or (select count(*) from registration_race_results
           where result->>'state' = 'error') <> 1
       or row(v_order_count, v_agreement_count)
            not in (row(1, 0), row(0, 1))
       or v_offer.accepted_price_amount <> 20500
       or (v_order_count = 1 and v_offer.quantity_available <> 0)
       or (v_agreement_count = 1 and v_offer.quantity_available <> 1) then
        raise exception 'generic checkout/registration race violated exclusivity: %',
            (select jsonb_agg(jsonb_build_object('kind', kind, 'result', result))
             from registration_race_results);
    end if;
end;
$generic_checkout_vs_registration$;

begin;
set local role service_role;
select commerce.register_price_agreement(
    'contract',
    'generic-negotiated-race',
    1,
    (select id from commerce.offers where slug = 'agreement-race'),
    'agreement-ready-seller',
    'negotiated-race-buyer',
    17500,
    'eur',
    1,
    now() + interval '1 hour'
);
commit;

select dblink_connect(
    'generic_checkout_race',
    'dbname=' || current_database()
        || ' application_name=generic_checkout_race options=-cstatement_timeout=10000'
);
select dblink_connect(
    'negotiated_checkout_race',
    'dbname=' || current_database()
        || ' application_name=negotiated_checkout_race options=-cstatement_timeout=10000'
);
select dblink_exec('generic_checkout_race', 'set role service_role');
select dblink_exec('negotiated_checkout_race', 'set role service_role');
begin;
set local role service_role;
select id from commerce.offers where slug = 'agreement-race' for update;
select dblink_send_query(
    'generic_checkout_race',
    $$select commerce_price_agreement_test.generic_checkout_attempt(
        'generic-race-buyer',
        'generic-race-key',
        (select id from commerce.offers where slug = 'agreement-race')
    )$$
);
select commerce_order_creation_test_wait('generic_checkout_race', 5000);
select dblink_send_query(
    'negotiated_checkout_race',
    $$select commerce_price_agreement_test.checkout_attempt(
        'negotiated-race-buyer',
        'negotiated-race-key',
        (select public_id from commerce.price_agreements
         where authority_reference = 'generic-negotiated-race')
    )$$
);
select commerce_order_creation_test_wait('negotiated_checkout_race', 5000);
commit;

create temporary table checkout_race_results (
    kind text not null,
    result jsonb not null
);
insert into checkout_race_results
select 'generic', result
from dblink_get_result('generic_checkout_race') response(result jsonb);
insert into checkout_race_results
select 'negotiated', result
from dblink_get_result('negotiated_checkout_race') response(result jsonb);
select dblink_disconnect('generic_checkout_race');
select dblink_disconnect('negotiated_checkout_race');

do $generic_vs_negotiated_checkout$
declare
    v_agreement commerce.price_agreements%rowtype;
    v_offer commerce.offers%rowtype;
begin
    select * into strict v_agreement
    from commerce.price_agreements
    where authority_reference = 'generic-negotiated-race';
    select * into strict v_offer
    from commerce.offers where slug = 'agreement-race';
    if (select result->>'state' from checkout_race_results where kind = 'negotiated') <> 'ok'
       or (select result->>'state' from checkout_race_results where kind = 'generic') <> 'error'
       or v_agreement.status <> 'consumed'
       or v_agreement.order_id is null
       or (select count(*) from commerce.orders
           where buyer_cms_user_id in ('generic-race-buyer', 'negotiated-race-buyer')) <> 1
       or (select count(*) from commerce.order_lines
           where price_agreement_id = v_agreement.id
             and order_id = v_agreement.order_id) <> 1
       or v_offer.quantity_available <> 0
       or v_offer.accepted_price_amount <> 20000 then
        raise exception 'generic/negotiated checkout race was not exactly once: %',
            (select jsonb_agg(jsonb_build_object('kind', kind, 'result', result))
             from checkout_race_results);
    end if;
end;
$generic_vs_negotiated_checkout$;

begin;
set local role service_role;
select commerce.register_price_agreement(
    'contract',
    'checkout-cancel-race',
    1,
    (select id from commerce.offers where slug = 'agreement-cancel'),
    'agreement-ready-seller',
    'checkout-cancel-buyer',
    14500,
    'eur',
    1,
    now() + interval '1 hour'
);
commit;

select dblink_connect(
    'agreement_checkout_race',
    'dbname=' || current_database()
        || ' application_name=agreement_checkout_race options=-cstatement_timeout=10000'
);
select dblink_connect(
    'agreement_cancel_race',
    'dbname=' || current_database()
        || ' application_name=agreement_cancel_race options=-cstatement_timeout=10000'
);
select dblink_exec('agreement_checkout_race', 'set role service_role');
select dblink_exec('agreement_cancel_race', 'set role service_role');
begin;
set local role service_role;
select id
from commerce.price_agreements
where authority_reference = 'checkout-cancel-race'
for update;
select dblink_send_query(
    'agreement_checkout_race',
    $$select commerce_price_agreement_test.checkout_attempt(
        'checkout-cancel-buyer',
        'checkout-cancel-key',
        (select public_id from commerce.price_agreements
         where authority_reference = 'checkout-cancel-race')
    )$$
);
select commerce_order_creation_test_wait('agreement_checkout_race', 5000);
select dblink_send_query(
    'agreement_cancel_race',
    $$select commerce_price_agreement_test.cancel_attempt(
        'contract', 'checkout-cancel-race'
    )$$
);
select commerce_order_creation_test_wait('agreement_cancel_race', 5000);
commit;

create temporary table checkout_cancel_results (
    kind text not null,
    result jsonb not null
);
insert into checkout_cancel_results
select 'checkout', result
from dblink_get_result('agreement_checkout_race') response(result jsonb);
insert into checkout_cancel_results
select 'cancel', result
from dblink_get_result('agreement_cancel_race') response(result jsonb);
select dblink_disconnect('agreement_checkout_race');
select dblink_disconnect('agreement_cancel_race');

do $checkout_vs_cancel$
declare
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into strict v_agreement
    from commerce.price_agreements
    where authority_reference = 'checkout-cancel-race';
    if (select count(*) from checkout_cancel_results where result->>'state' = 'ok') <> 1
       or (select count(*) from checkout_cancel_results where result->>'state' = 'error') <> 1
       or v_agreement.status not in ('consumed', 'canceled')
       or (
           v_agreement.status = 'consumed'
           and (
               v_agreement.order_id is null
               or (select count(*) from commerce.order_lines
                   where price_agreement_id = v_agreement.id
                     and order_id = v_agreement.order_id) <> 1
           )
       )
       or (
           v_agreement.status = 'canceled'
           and (
               v_agreement.order_id is not null
               or exists (
                   select 1 from commerce.order_lines
                   where price_agreement_id = v_agreement.id
               )
           )
       ) then
        raise exception 'checkout/cancel race did not have one terminal winner: %',
            (select jsonb_agg(jsonb_build_object('kind', kind, 'result', result))
             from checkout_cancel_results);
    end if;
end;
$checkout_vs_cancel$;

create trigger price_agreement_concurrency_barrier
after insert on commerce.order_lines
for each row execute function commerce_price_agreement_test.block_order_line();

begin;
set local role service_role;
select commerce.register_price_agreement(
    'contract',
    'double-click',
    1,
    (select id from commerce.offers where slug = 'agreement-double-click'),
    'agreement-ready-seller',
    'double-click-buyer',
    15500,
    'eur',
    1,
    now() + interval '1 hour'
);
commit;

select pg_advisory_lock(746201);
select dblink_connect(
    'agreement_click_a',
    'dbname=' || current_database()
        || ' application_name=agreement_click_a options=-cstatement_timeout=10000'
);
select dblink_connect(
    'agreement_click_b',
    'dbname=' || current_database()
        || ' application_name=agreement_click_b options=-cstatement_timeout=10000'
);
select dblink_exec('agreement_click_a', 'set role service_role');
select dblink_exec('agreement_click_b', 'set role service_role');
select dblink_send_query(
    'agreement_click_a',
    $$select commerce_price_agreement_test.checkout_attempt(
        'double-click-buyer',
        'double-click-key',
        (select public_id from commerce.price_agreements where authority_reference = 'double-click')
    )$$
);
select commerce_order_creation_test_wait('agreement_click_a', 5000);
select dblink_send_query(
    'agreement_click_b',
    $$select commerce_price_agreement_test.checkout_attempt(
        'double-click-buyer',
        'double-click-key',
        (select public_id from commerce.price_agreements where authority_reference = 'double-click')
    )$$
);
select commerce_order_creation_test_wait('agreement_click_b', 5000);
select pg_advisory_unlock(746201);

create temporary table agreement_click_results (result jsonb not null);
insert into agreement_click_results
select result from dblink_get_result('agreement_click_a') response(result jsonb);
insert into agreement_click_results
select result from dblink_get_result('agreement_click_b') response(result jsonb);
select dblink_disconnect('agreement_click_a');
select dblink_disconnect('agreement_click_b');

do $double_click$
begin
    if (select count(*) from agreement_click_results
        where result->>'state' = 'ok'
          and result->'result'->>'idempotent_replay' = 'false') <> 1
       or (select count(*) from agreement_click_results
           where result->>'state' = 'ok'
             and result->'result'->>'idempotent_replay' = 'true') <> 1
       or (select count(*) from commerce_price_agreement_test.mutations) <> 1
       or (select count(*) from commerce.orders
           where buyer_cms_user_id = 'double-click-buyer') <> 1 then
        raise exception 'concurrent double click was not exactly-once: %',
            (select jsonb_agg(result) from agreement_click_results);
    end if;
end;
$double_click$;

drop trigger price_agreement_concurrency_barrier on commerce.order_lines;
drop schema commerce_price_agreement_test cascade;

drop function commerce_order_creation_test_wait(text, integer);

drop schema commerce_negotiation cascade;
drop schema commerce cascade;
