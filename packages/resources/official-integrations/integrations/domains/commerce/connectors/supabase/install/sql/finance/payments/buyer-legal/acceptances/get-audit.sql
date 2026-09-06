create or replace function commerce.get_buyer_legal_acceptance_audit(
    p_order_id bigint,
    p_buyer_cms_user_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_acceptances jsonb;
begin
    select * into v_order
    from commerce.orders
    where id = p_order_id
      and (
          p_buyer_cms_user_id is null
          or buyer_cms_user_id = p_buyer_cms_user_id
      );
    if not found then
        raise exception 'not_found: order';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'key', proof.document_key,
        'label', version.label,
        'consentText', version.consent_text,
        'pageUrl', version.page_path,
        'page', jsonb_build_object(
            'id', version.cms_page_id,
            'path', version.page_path,
            'title', version.page_title,
            'description', version.page_description,
            'content', version.page_content
        ),
        'versionId', proof.document_version_id,
        'versionDate', version.materialized_at,
        'contentHash', proof.content_hash,
        'acceptedAt', proof.accepted_at,
        'correlationId', proof.correlation_id
    ) order by proof.accepted_at, proof.id), '[]'::jsonb)
    into v_acceptances
    from commerce.order_buyer_legal_acceptances proof
    join commerce.buyer_legal_document_versions version
      on version.id = proof.document_version_id
    where proof.order_id = v_order.id;

    return jsonb_build_object(
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'checkoutGroupId', v_order.checkout_group_id,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'paymentAttemptIds', coalesce((
            select jsonb_agg(distinct proof.payment_attempt_id) from (
                select payment_attempt_id from commerce.order_buyer_legal_acceptances where order_id = v_order.id
                union select payment_attempt_id from commerce.order_consent_acceptances where order_id = v_order.id
            ) proof
        ), '[]'::jsonb),
        'acceptances', v_acceptances,
        'consentReferences', coalesce((
            select jsonb_agg(reference) from (
                select distinct jsonb_build_object(
                    'contextKey', proof.context_key,
                    'operationKey', proof.operation_key,
                    'acceptanceId', proof.consent_acceptance_id,
                    'correlationId', proof.correlation_id,
                    'paymentAttemptId', proof.payment_attempt_id
                ) as reference
                from commerce.order_consent_acceptances proof
                where proof.order_id = v_order.id
            ) receipt_references
        ), '[]'::jsonb)
    );
end;
$$;
