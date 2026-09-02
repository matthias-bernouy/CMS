select provider_reconciliation_test.cleanup();

do $fixture$
declare
    v_payment_id bigint;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('order');
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind,
        provider_object_id, causal_sequence, created_at, last_error
    ) values
        (v_payment_id, 'provider-reconciliation-pg-order-early',
            'payment', v_payment_id::text, 9, '2026-07-21 08:00:00+00', null),
        (v_payment_id, 'provider-reconciliation-pg-order-causal-high',
            'payment', v_payment_id::text, 2, '2026-07-21 09:00:00+00', 'old error'),
        (v_payment_id, 'provider-reconciliation-pg-order-causal-low-a',
            'payment', v_payment_id::text, 1, '2026-07-21 09:00:00+00', null),
        (v_payment_id, 'provider-reconciliation-pg-order-causal-low-b',
            'payment', v_payment_id::text, 1, '2026-07-21 09:00:00+00', null);
end;
$fixture$;

do $first_page$
declare
    v_keys text[] := array[]::text[];
    v_row stripe_connect.commerce_projection_outbox%rowtype;
begin
    for v_row in
        select * from stripe_connect.claim_commerce_projection_outbox('order-page-1', 2)
    loop
        v_keys := pg_catalog.array_append(v_keys, v_row.projection_key);
        if v_row.projection_status <> 'leased'
           or v_row.claim_owner <> 'order-page-1'
           or v_row.claim_token is null
           or v_row.claimed_at is null
           or v_row.attempt_count <> 1
           or v_row.last_error is not null then
            raise exception 'provider reconciliation: invalid first-page lease: %',
                pg_catalog.to_jsonb(v_row);
        end if;
    end loop;
    if v_keys <> array[
        'provider-reconciliation-pg-order-early',
        'provider-reconciliation-pg-order-causal-low-a'
    ] then
        raise exception 'provider reconciliation: first page order changed: %', v_keys;
    end if;
end;
$first_page$;

do $remaining_pages$
declare
    v_second text[];
    v_third text[];
begin
    select pg_catalog.array_agg(projection_key)
    into v_second
    from stripe_connect.claim_commerce_projection_outbox('order-page-2', 1);
    select pg_catalog.array_agg(projection_key)
    into v_third
    from stripe_connect.claim_commerce_projection_outbox('order-page-3', 200);
    if v_second <> array['provider-reconciliation-pg-order-causal-low-b']
       or v_third <> array['provider-reconciliation-pg-order-causal-high'] then
        raise exception 'provider reconciliation: remaining page order changed: %, %',
            v_second, v_third;
    end if;
    if (select pg_catalog.count(*)
        from stripe_connect.commerce_projection_outbox
        where projection_key like 'provider-reconciliation-pg-order-%'
          and (projection_status <> 'leased'
               or claim_token is null
               or claimed_at is null
               or attempt_count <> 1)) <> 0
       or (select pg_catalog.count(distinct claim_token)
           from stripe_connect.commerce_projection_outbox
           where projection_key like 'provider-reconciliation-pg-order-%') <> 4 then
        raise exception 'provider reconciliation: page lease state changed';
    end if;
end;
$remaining_pages$;

select provider_reconciliation_test.cleanup();
