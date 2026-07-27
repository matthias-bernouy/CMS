create or replace function commerce.record_verified_buyer_legal_acceptances(
    p_order_id bigint,
    p_checkout_group_id uuid,
    p_payment_attempt_id bigint,
    p_buyer_cms_user_id text,
    p_accepted_version_ids uuid[],
    p_correlation_id uuid,
    p_verified_documents jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_context jsonb;
    v_payment_provider text;
begin
    if p_verified_documents is null
        or jsonb_typeof(p_verified_documents) <> 'array' then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    select provider into v_payment_provider
    from commerce.order_payment_attempts
    where id = p_payment_attempt_id
      and order_id = p_order_id;
    if not found then
        raise exception
            'conflict: payment attempt does not belong to the buyer order';
    end if;
    v_context := commerce.get_buyer_legal_verification_context(
        p_order_id,
        p_buyer_cms_user_id,
        v_payment_provider
    );
    if coalesce((v_context->>'enabled')::boolean, false)
        and not coalesce(
            (v_context->>'paymentAlreadyCreated')::boolean,
            false
        )
        and jsonb_array_length(p_verified_documents) <>
            jsonb_array_length(v_context->'documents') then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not coalesce(
        (v_context->>'paymentAlreadyCreated')::boolean,
        false
    ) and jsonb_array_length(p_verified_documents) > 0 then
        perform commerce.refresh_buyer_legal_document_snapshots(
            p_verified_documents,
            'commerce-payment-gate'
        );
    end if;
    return commerce.record_buyer_legal_acceptances(
        p_order_id,
        p_checkout_group_id,
        p_payment_attempt_id,
        p_buyer_cms_user_id,
        p_accepted_version_ids,
        p_correlation_id
    );
end;
$$;
