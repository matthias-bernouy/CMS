drop function if exists commerce.get_fresh_buyer_legal_requirements(
    bigint,
    text,
    jsonb
);

create or replace function commerce.get_fresh_buyer_legal_requirements(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_payment_provider text,
    p_verified_documents jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_context jsonb;
begin
    if p_payment_provider is null
        or p_payment_provider !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: payment provider is invalid';
    end if;
    if p_verified_documents is null
        or jsonb_typeof(p_verified_documents) <> 'array' then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    v_context := commerce.get_buyer_legal_verification_context(
        p_order_id,
        p_buyer_cms_user_id,
        p_payment_provider
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
            'commerce-requirements-gate'
        );
    end if;
    return commerce.get_buyer_legal_requirements(
        p_order_id,
        p_buyer_cms_user_id,
        p_payment_provider
    );
end;
$$;
