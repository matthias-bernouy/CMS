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
        raise exception
            'conflict: payment attempt does not belong to the buyer order';
    end if;
    if v_provider_payment_id is not null then
        return commerce.buyer_legal_acceptance_projection(
            p_payment_attempt_id
        );
    end if;

    perform pg_advisory_xact_lock_shared(hashtextextended(
        'commerce:buyer-legal-documents',
        0
    ));
    select buyer_legal_acceptance_enabled into v_enabled
    from commerce.settings
    where id = 'default';
    if not found then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not v_enabled then
        return commerce.buyer_legal_acceptance_projection(
            p_payment_attempt_id
        );
    end if;
    if not exists (
        select 1
        from commerce.buyer_legal_documents
        where enabled
    ) or exists (
        select 1
        from commerce.buyer_legal_documents
        where enabled and current_version_id is null
    ) then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;

    select coalesce(
        array_agg(
            required.version_id
            order by required.document_key
        ),
        '{}'::uuid[]
    )
    into v_required_ids
    from commerce.buyer_legal_required_versions(p_order_id) required;
    if cardinality(v_required_ids) = 0 then
        return commerce.buyer_legal_acceptance_projection(
            p_payment_attempt_id
        );
    end if;
    if coalesce(cardinality(p_accepted_version_ids), 0) = 0 then
        if not exists (
            select 1
            from unnest(v_required_ids) required(version_id)
            where not exists (
                select 1
                from commerce.order_buyer_legal_acceptances proof
                where proof.payment_attempt_id = p_payment_attempt_id
                  and proof.buyer_cms_user_id = p_buyer_cms_user_id
                  and proof.document_version_id = required.version_id
            )
        ) then
            return commerce.buyer_legal_acceptance_projection(
                p_payment_attempt_id,
                v_required_ids
            );
        end if;
        raise exception 'validation: BUYER_LEGAL_ACCEPTANCE_REQUIRED';
    end if;
    if cardinality(p_accepted_version_ids) <> (
        select count(distinct accepted.version_id)
        from unnest(p_accepted_version_ids) accepted(version_id)
    ) then
        raise exception
            'validation: accepted legal document versions must be unique';
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
        order_id, checkout_group_id, payment_attempt_id,
        buyer_cms_user_id, document_key, document_version_id,
        content_hash, correlation_id
    )
    select
        p_order_id,
        p_checkout_group_id,
        p_payment_attempt_id,
        p_buyer_cms_user_id,
        required.document_key,
        required.id,
        required.content_hash,
        p_correlation_id
    from commerce.buyer_legal_document_versions required
    where required.id = any(v_required_ids)
    on conflict (payment_attempt_id, document_version_id) do nothing;

    return commerce.buyer_legal_acceptance_projection(
        p_payment_attempt_id,
        v_required_ids
    );
end;
$$;
