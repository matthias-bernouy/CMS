create or replace function commerce.record_buyer_legal_acceptances(
    p_order_id bigint,
    p_checkout_group_id uuid,
    p_payment_attempt_id bigint,
    p_buyer_cms_user_id text,
    p_accepted_version_ids uuid[],
    p_correlation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_enabled boolean;
    v_provider_payment_id bigint;
    v_required_ids uuid[];
    v_existing_ids uuid[];
    v_acceptances jsonb;
begin
    if p_correlation_id is null then
        raise exception 'validation: payment correlation id is required';
    end if;
    if not exists (
        select 1
        from commerce.orders order_row
        where order_row.id = p_order_id
          and order_row.checkout_group_id = p_checkout_group_id
          and order_row.buyer_cms_user_id = p_buyer_cms_user_id
    ) then
        raise exception 'not_found: order';
    end if;
    select attempt.provider_payment_id into v_provider_payment_id
    from commerce.order_payment_attempts attempt
        where attempt.id = p_payment_attempt_id
          and attempt.order_id = p_order_id;
    if not found then
        raise exception 'conflict: payment attempt does not belong to the buyer order';
    end if;

    perform pg_advisory_xact_lock_shared(hashtextextended('commerce:buyer-legal-documents', 0));
    select
        coalesce(array_agg(proof.document_version_id order by proof.document_key), '{}'::uuid[]),
        coalesce(jsonb_agg(jsonb_build_object(
            'key', proof.document_key,
            'versionId', proof.document_version_id,
            'contentHash', proof.content_hash,
            'acceptedAt', proof.accepted_at,
            'correlationId', proof.correlation_id
        ) order by proof.document_key, proof.accepted_at), '[]'::jsonb)
    into v_existing_ids, v_acceptances
    from commerce.order_buyer_legal_acceptances proof
    where proof.order_id = p_order_id
      and proof.payment_attempt_id = p_payment_attempt_id
      and proof.buyer_cms_user_id = p_buyer_cms_user_id;
    if v_provider_payment_id is not null then
        return v_acceptances;
    end if;

    select buyer_legal_acceptance_enabled into v_enabled
    from commerce.settings
    where id = 'default';
    if not found then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not v_enabled then
        return v_acceptances;
    end if;
    if not exists (
        select 1 from commerce.buyer_legal_documents where enabled
    ) or exists (
        select 1
        from commerce.buyer_legal_documents
        where enabled and current_version_id is null
    ) then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;

    select coalesce(array_agg(required.version_id order by required.document_key), '{}'::uuid[])
    into v_required_ids
    from commerce.buyer_legal_required_versions(p_order_id) required;
    if cardinality(v_required_ids) = 0 then
        return v_acceptances;
    end if;
    if coalesce(cardinality(p_accepted_version_ids), 0) = 0 then
        if cardinality(v_existing_ids) = cardinality(v_required_ids)
            and not exists (
                select 1
                from unnest(v_required_ids) required(version_id)
                where not required.version_id = any(v_existing_ids)
            ) then
            return v_acceptances;
        end if;
        raise exception 'validation: BUYER_LEGAL_ACCEPTANCE_REQUIRED';
    end if;
    if cardinality(p_accepted_version_ids) <> (
        select count(distinct accepted.version_id)
        from unnest(p_accepted_version_ids) accepted(version_id)
    ) then
        raise exception 'validation: accepted legal document versions must be unique';
    end if;
    if exists (
        select 1
        from unnest(p_accepted_version_ids) accepted(version_id)
        where not accepted.version_id = any(v_required_ids)
    ) then
        raise exception 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED';
    end if;
    if exists (
        select 1
        from unnest(v_required_ids) required(version_id)
        where not required.version_id = any(p_accepted_version_ids)
    ) then
        raise exception 'validation: BUYER_LEGAL_ACCEPTANCE_REQUIRED';
    end if;

    insert into commerce.order_buyer_legal_acceptances (
        order_id, checkout_group_id, payment_attempt_id, buyer_cms_user_id,
        document_key, document_version_id, content_hash, correlation_id
    )
    select
        p_order_id,
        p_checkout_group_id,
        p_payment_attempt_id,
        p_buyer_cms_user_id,
        required.document_key,
        required.version_id,
        required.content_hash,
        p_correlation_id
    from commerce.buyer_legal_document_versions required
    where required.id = any(v_required_ids)
    on conflict (payment_attempt_id, document_version_id) do nothing;

    select coalesce(jsonb_agg(jsonb_build_object(
        'key', proof.document_key,
        'versionId', proof.document_version_id,
        'contentHash', proof.content_hash,
        'acceptedAt', proof.accepted_at,
        'correlationId', proof.correlation_id
    ) order by proof.document_key, proof.accepted_at), '[]'::jsonb)
    into v_acceptances
    from commerce.order_buyer_legal_acceptances proof
    where proof.payment_attempt_id = p_payment_attempt_id
      and proof.document_version_id = any(v_required_ids);
    return v_acceptances;
end;
$$;

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
    if p_verified_documents is null or jsonb_typeof(p_verified_documents) <> 'array' then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    select provider into v_payment_provider
    from commerce.order_payment_attempts
    where id = p_payment_attempt_id
      and order_id = p_order_id;
    if not found then
        raise exception 'conflict: payment attempt does not belong to the buyer order';
    end if;
    v_context := commerce.get_buyer_legal_verification_context(
        p_order_id,
        p_buyer_cms_user_id,
        v_payment_provider
    );
    if coalesce((v_context->>'enabled')::boolean, false)
        and not coalesce((v_context->>'paymentAlreadyCreated')::boolean, false)
        and jsonb_array_length(p_verified_documents) <>
            jsonb_array_length(v_context->'documents') then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not coalesce((v_context->>'paymentAlreadyCreated')::boolean, false)
        and jsonb_array_length(p_verified_documents) > 0 then
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
