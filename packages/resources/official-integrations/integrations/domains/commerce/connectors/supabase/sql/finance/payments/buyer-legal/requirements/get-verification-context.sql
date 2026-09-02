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
    if p_payment_provider is not null
        and p_payment_provider !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: payment provider is invalid';
    end if;
    select * into v_order
    from commerce.orders
    where id = p_order_id
      and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then
        raise exception 'not_found: order';
    end if;
    if v_order.status in (
        'active', 'completed', 'expired', 'cancellation_pending', 'cancelled'
    ) then
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
          or commerce.buyer_legal_checkout_context(v_order.id)
             = any(version.checkout_contexts)
      );

    select exists (
        select 1
        from commerce.order_payment_attempts attempt
        where attempt.order_id = v_order.id
          and attempt.provider_payment_id is not null
          and (
              p_payment_provider is null
              or attempt.provider = p_payment_provider
          )
    ) into v_payment_created;
    return jsonb_build_object(
        'enabled', jsonb_array_length(v_documents) > 0,
        'paymentAlreadyCreated', v_payment_created,
        'approvedSnapshotOrigin', v_snapshot_origin,
        'documents', v_documents
    );
end;
$$;
