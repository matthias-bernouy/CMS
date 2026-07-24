create or replace function commerce.buyer_legal_checkout_context(
    p_order_id bigint
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when exists (
            select 1
            from commerce.price_agreements agreement
            where agreement.order_id = p_order_id
        ) then 'negotiated_offer'
        when checkout.source_cart_id is not null then 'cart'
        else 'direct_purchase'
    end
    from commerce.orders order_row
    join commerce.checkout_groups checkout on checkout.id = order_row.checkout_group_id
    where order_row.id = p_order_id;
$$;

create or replace function commerce.buyer_legal_required_versions(
    p_order_id bigint
)
returns table (
    document_key text,
    label text,
    consent_text text,
    page_path text,
    version_id uuid,
    content_hash text,
    version_date timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        document.document_key,
        version.label,
        version.consent_text,
        version.page_path,
        version.id,
        version.content_hash,
        version.materialized_at
    from commerce.buyer_legal_documents document
    join commerce.buyer_legal_document_versions version
      on version.id = document.current_version_id
    where document.enabled
      and (
          'buyer_checkout' = any(version.checkout_contexts)
          or
          'protected_payment' = any(version.checkout_contexts)
          or commerce.buyer_legal_checkout_context(p_order_id) = any(version.checkout_contexts)
      )
    order by document.document_key;
$$;

create or replace function commerce.get_buyer_legal_requirements(
    p_order_id bigint,
    p_buyer_cms_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_enabled boolean;
    v_snapshot_origin text;
    v_documents jsonb;
begin
    select * into v_order
    from commerce.orders
    where id = p_order_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then
        raise exception 'not_found: order';
    end if;
    if v_order.status in ('active', 'completed', 'expired', 'cancellation_pending', 'cancelled') then
        return jsonb_build_object('enabled', false, 'documents', '[]'::jsonb);
    end if;
    select buyer_legal_acceptance_enabled, buyer_legal_snapshot_origin
    into v_enabled, v_snapshot_origin
    from commerce.settings
    where id = 'default';
    if not found then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not v_enabled then
        return jsonb_build_object('enabled', false, 'documents', '[]'::jsonb);
    end if;
    if v_snapshot_origin is null then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
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

    select coalesce(jsonb_agg(jsonb_build_object(
        'key', required.document_key,
        'label', required.label,
        'consentText', required.consent_text,
        'pageUrl', required.page_path,
        'versionId', required.version_id,
        'versionDate', required.version_date
    ) order by required.document_key), '[]'::jsonb)
    into v_documents
    from commerce.buyer_legal_required_versions(v_order.id) required;

    if jsonb_array_length(v_documents) > 0 and exists (
        select 1
        from commerce.order_payment_attempts attempt
        where attempt.order_id = v_order.id
          and (
              attempt.provider_payment_id is not null
              or not exists (
                  select 1
                  from commerce.buyer_legal_required_versions(v_order.id) required
                  where not exists (
                      select 1
                      from commerce.order_buyer_legal_acceptances proof
                      where proof.payment_attempt_id = attempt.id
                        and proof.document_version_id = required.version_id
                  )
              )
          )
    ) then
        return jsonb_build_object('enabled', false, 'documents', '[]'::jsonb);
    end if;

    return jsonb_build_object(
        'enabled', jsonb_array_length(v_documents) > 0,
        'documents', v_documents
    );
end;
$$;

create or replace function commerce.get_buyer_legal_verification_context(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_payment_provider text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_enabled boolean;
    v_snapshot_origin text;
    v_documents jsonb;
    v_payment_created boolean;
begin
    select * into v_order
    from commerce.orders
    where id = p_order_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then
        raise exception 'not_found: order';
    end if;
    if v_order.status in ('active', 'completed', 'expired', 'cancellation_pending', 'cancelled') then
        return jsonb_build_object(
            'enabled', false,
            'paymentAlreadyCreated', v_order.status in ('active', 'completed'),
            'documents', '[]'::jsonb
        );
    end if;
    select buyer_legal_acceptance_enabled, buyer_legal_snapshot_origin
    into v_enabled, v_snapshot_origin
    from commerce.settings
    where id = 'default';
    if not found then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if not v_enabled then
        return jsonb_build_object(
            'enabled', false,
            'paymentAlreadyCreated', false,
            'documents', '[]'::jsonb
        );
    end if;
    if v_snapshot_origin is null then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if exists (
        select 1
        from commerce.buyer_legal_documents document
        where document.enabled
          and (
              document.current_version_id is null
              or document.published_snapshot_url is null
          )
    ) then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'key', document.document_key,
        'versionId', version.id,
        'pageId', version.cms_page_id,
        'publishedSnapshotUrl', document.published_snapshot_url
    ) order by document.document_key), '[]'::jsonb)
    into v_documents
    from commerce.buyer_legal_documents document
    join commerce.buyer_legal_document_versions version
      on version.id = document.current_version_id
    where document.enabled
      and (
          'buyer_checkout' = any(version.checkout_contexts)
          or 'protected_payment' = any(version.checkout_contexts)
          or commerce.buyer_legal_checkout_context(v_order.id) = any(version.checkout_contexts)
      );

    select exists (
        select 1
        from commerce.order_payment_attempts attempt
        where attempt.order_id = v_order.id
          and attempt.provider_payment_id is not null
          and (p_payment_provider is null or attempt.provider = p_payment_provider)
    ) into v_payment_created;
    return jsonb_build_object(
        'enabled', jsonb_array_length(v_documents) > 0,
        'paymentAlreadyCreated', v_payment_created,
        'approvedSnapshotOrigin', v_snapshot_origin,
        'documents', v_documents
    );
end;
$$;
