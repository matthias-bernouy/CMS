create or replace function commerce.submit_marketplace_service_withdrawal_request(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_service_scope text,
    p_reason text,
    p_confirmed boolean,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_buyer text := nullif(btrim(p_buyer_cms_user_id), '');
    v_scope text := btrim(coalesce(p_service_scope, ''));
    v_reason text := nullif(btrim(p_reason), '');
    v_key text := btrim(coalesce(p_idempotency_key, ''));
    v_confirmation_key constant text := 'marketplace_service_withdrawal_request.v1';
    v_request_hash text;
    v_existing commerce.marketplace_service_withdrawal_requests%rowtype;
    v_request commerce.marketplace_service_withdrawal_requests%rowtype;
    v_legal_snapshot jsonb;
    v_confirmed_at timestamptz := clock_timestamp();
begin
    if v_buyer is null then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_order_id is null or p_order_id <= 0 then
        raise exception 'validation: order id must be positive';
    end if;
    if v_scope !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: invalid service scope';
    end if;
    if v_reason is not null and length(v_reason) > 4000 then
        raise exception 'validation: reason is too long';
    end if;
    if p_confirmed is not true then
        raise exception 'validation: explicit confirmation is required';
    end if;
    if length(v_key) not between 1 and 200 then
        raise exception 'validation: idempotency key is required and must not exceed 200 characters';
    end if;

    v_request_hash := encode(extensions.digest(pg_catalog.convert_to(
        jsonb_build_object(
            'orderId', p_order_id,
            'buyerCmsUserId', v_buyer,
            'serviceScope', v_scope,
            'reason', v_reason,
            'confirmationKey', v_confirmation_key
        )::text,
        'UTF8'
    ), 'sha256'), 'hex');

    perform pg_advisory_xact_lock(hashtextextended(
        'service-withdrawal:key:' || v_buyer || ':' || v_key, 0
    ));
    select * into v_existing
    from commerce.marketplace_service_withdrawal_requests
    where buyer_cms_user_id = v_buyer
      and idempotency_key = v_key;
    if found then
        if v_existing.request_hash <> v_request_hash then
            raise exception 'conflict: idempotency key was already used for another service withdrawal request';
        end if;
        return commerce.marketplace_service_withdrawal_request_read_model(v_existing.id)
            || jsonb_build_object('idempotent_replay', true);
    end if;

    perform 1
    from commerce.orders
    where id = p_order_id
      and buyer_cms_user_id = v_buyer;
    if not found then
        raise exception 'not_found: order';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        'service-withdrawal:scope:' || p_order_id::text || ':' || v_scope, 0
    ));
    if exists (
        select 1
        from commerce.marketplace_service_withdrawal_requests
        where order_id = p_order_id
          and service_scope = v_scope
    ) then
        raise exception 'conflict: a service withdrawal request already exists for this order and scope';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'acceptance_id', proof.id,
        'payment_attempt_id', proof.payment_attempt_id,
        'document_key', proof.document_key,
        'document_version_id', proof.document_version_id,
        'content_hash', proof.content_hash,
        'accepted_at', proof.accepted_at,
        'correlation_id', proof.correlation_id
    ) order by proof.document_key), '[]'::jsonb)
    into v_legal_snapshot
    from (
        select distinct on (acceptance.document_key)
            acceptance.id,
            acceptance.payment_attempt_id,
            acceptance.document_key,
            acceptance.document_version_id,
            acceptance.content_hash,
            acceptance.accepted_at,
            acceptance.correlation_id
        from commerce.order_buyer_legal_acceptances acceptance
        where acceptance.order_id = p_order_id
          and acceptance.buyer_cms_user_id = v_buyer
        order by acceptance.document_key, acceptance.accepted_at desc, acceptance.id desc
    ) proof;

    insert into commerce.marketplace_service_withdrawal_requests (
        order_id,
        buyer_cms_user_id,
        service_scope,
        reason,
        confirmation_key,
        confirmed_at,
        legal_acceptances_snapshot,
        idempotency_key,
        request_hash,
        submitted_at,
        updated_at
    ) values (
        p_order_id,
        v_buyer,
        v_scope,
        v_reason,
        v_confirmation_key,
        v_confirmed_at,
        v_legal_snapshot,
        v_key,
        v_request_hash,
        v_confirmed_at,
        v_confirmed_at
    ) returning * into v_request;

    insert into commerce.marketplace_service_withdrawal_events (
        request_id, order_id, event_type, actor_kind, actor_id,
        previous_status, next_status, request_version, data
    ) values (
        v_request.id, v_request.order_id, 'submitted', 'buyer', v_buyer,
        null, 'submitted', v_request.version,
        jsonb_build_object(
            'serviceScope', v_scope,
            'confirmationKey', v_confirmation_key,
            'legalAcceptanceCount', jsonb_array_length(v_legal_snapshot)
        )
    );
    perform commerce.append_financial_event(
        v_request.order_id,
        'marketplace_service_withdrawal_request',
        v_request.id::text,
        'service_withdrawal_submitted',
        'buyer',
        v_buyer,
        null,
        jsonb_build_object(
            'serviceScope', v_scope,
            'legalAcceptanceCount', jsonb_array_length(v_legal_snapshot)
        ),
        'commerce.marketplace_service_withdrawal.submitted',
        'service-withdrawal:' || v_request.id || ':submitted'
    );

    return commerce.marketplace_service_withdrawal_request_read_model(v_request.id)
        || jsonb_build_object('idempotent_replay', false);
end;
$$;

comment on function commerce.submit_marketplace_service_withdrawal_request(
    bigint, text, text, text, boolean, text
) is
    'Records evidence of an explicit buyer request. It never cancels an order or creates a refund.';
