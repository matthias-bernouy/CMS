create or replace function commerce.buyer_legal_acceptance_projection(
    p_payment_attempt_id bigint,
    p_version_ids uuid[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'key', proof.document_key,
        'versionId', proof.document_version_id,
        'contentHash', proof.content_hash,
        'acceptedAt', proof.accepted_at,
        'correlationId', proof.correlation_id
    ) order by proof.document_key, proof.accepted_at), '[]'::jsonb)
    from commerce.order_buyer_legal_acceptances proof
    where proof.payment_attempt_id = p_payment_attempt_id
      and (
          p_version_ids is null
          or proof.document_version_id = any(p_version_ids)
      );
$$;
