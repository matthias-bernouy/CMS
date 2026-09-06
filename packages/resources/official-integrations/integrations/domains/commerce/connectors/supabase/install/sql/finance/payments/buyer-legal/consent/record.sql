create or replace function commerce.record_verified_order_consent(
    p_order_id bigint,
    p_payment_attempt_id bigint,
    p_buyer_cms_user_id text,
    p_correlation_id uuid,
    p_receipts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_attempt commerce.order_payment_attempts%rowtype;
    v_context jsonb;
    v_receipt jsonb;
    v_document jsonb;
    v_existing commerce.order_consent_acceptances%rowtype;
begin
    select * into v_attempt from commerce.order_payment_attempts
    where id = p_payment_attempt_id and order_id = p_order_id;
    if not found then
        raise exception 'conflict: consent payment attempt is missing';
    end if;
    v_context := commerce.get_buyer_consent_context(p_order_id, p_buyer_cms_user_id, v_attempt.provider);
    if not (v_context->>'requiresConsent')::boolean then
        return commerce.order_consent_acceptance_projection(p_payment_attempt_id);
    end if;
    if jsonb_typeof(p_receipts) is distinct from 'array'
        or jsonb_array_length(p_receipts) <> jsonb_array_length(v_context->'contexts')
        or exists (
            select 1 from jsonb_array_elements_text(v_context->'contexts') context(key)
            where (select count(*) from jsonb_array_elements(p_receipts) receipt
                   where receipt->>'contextKey' = context.key) <> 1
        ) then
        raise exception 'conflict: CONSENT_RECEIPTS_REQUIRED';
    end if;
    for v_receipt in select value from jsonb_array_elements(p_receipts) loop
        if v_receipt->>'schemaVersion' is distinct from '1'
            or v_receipt->>'operationKey' is distinct from v_context->>'operationKey'
            or v_receipt->>'cmsUserId' is distinct from p_buyer_cms_user_id
            or v_receipt#>>'{metadata,orderId}' is distinct from p_order_id::text
            or v_receipt#>>'{metadata,checkoutGroupId}' is distinct from v_context->>'checkoutGroupId'
            or v_receipt#>>'{metadata,paymentProvider}' is distinct from v_attempt.provider
            or jsonb_typeof(v_receipt->'required') is distinct from 'boolean'
            or jsonb_typeof(v_receipt->'documents') is distinct from 'array' then
            raise exception 'conflict: consent receipt does not match payment operation';
        end if;
        if not (v_receipt->>'required')::boolean then
            if jsonb_array_length(v_receipt->'documents') <> 0 then
                raise exception 'conflict: invalid disabled consent receipt';
            end if;
            continue;
        end if;
        if coalesce(v_receipt->>'acceptanceId', '') !~ '^[a-f0-9-]{36}$'
            or v_receipt->>'acceptedAt' is null
            or (v_receipt->>'acceptedAt')::timestamptz > now() + interval '1 minute'
            or jsonb_array_length(v_receipt->'documents') not between 1 and 8 then
            raise exception 'conflict: invalid consent receipt evidence';
        end if;
        for v_document in select value from jsonb_array_elements(v_receipt->'documents') loop
            insert into commerce.order_consent_acceptances (
                order_id, checkout_group_id, payment_attempt_id, buyer_cms_user_id,
                context_key, operation_key, consent_acceptance_id, document_key,
                document_version_id, content_hash, correlation_id, accepted_at
            ) values (
                p_order_id, (v_context->>'checkoutGroupId')::uuid, p_payment_attempt_id, p_buyer_cms_user_id,
                v_receipt->>'contextKey', v_receipt->>'operationKey', (v_receipt->>'acceptanceId')::uuid,
                v_document->>'documentKey', v_document->>'versionId', v_document->>'contentHash',
                p_correlation_id, (v_receipt->>'acceptedAt')::timestamptz
            ) on conflict (payment_attempt_id, context_key, document_version_id) do nothing;
            select * into strict v_existing from commerce.order_consent_acceptances
            where payment_attempt_id = p_payment_attempt_id
              and context_key = v_receipt->>'contextKey'
              and document_version_id = v_document->>'versionId';
            if v_existing.consent_acceptance_id <> (v_receipt->>'acceptanceId')::uuid
                or v_existing.content_hash <> v_document->>'contentHash'
                or v_existing.buyer_cms_user_id <> p_buyer_cms_user_id then
                raise exception 'conflict: payment consent evidence changed';
            end if;
        end loop;
    end loop;
    return commerce.order_consent_acceptance_projection(p_payment_attempt_id);
end;
$$;
