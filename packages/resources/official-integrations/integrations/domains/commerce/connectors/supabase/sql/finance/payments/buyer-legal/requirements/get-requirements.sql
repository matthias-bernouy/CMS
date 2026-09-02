drop function if exists commerce.get_buyer_legal_requirements(bigint, text);

create or replace function commerce.get_buyer_legal_requirements(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_payment_provider text
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
    if p_payment_provider is null
        or p_payment_provider !~ '^[a-z][a-z0-9_.-]{1,79}$' then
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
            'documents', '[]'::jsonb
        );
    end if;
    if v_snapshot_origin is null then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
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
          and attempt.provider = p_payment_provider
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
        return jsonb_build_object(
            'enabled', false,
            'documents', '[]'::jsonb
        );
    end if;

    return jsonb_build_object(
        'enabled', jsonb_array_length(v_documents) > 0,
        'documents', v_documents
    );
end;
$$;
