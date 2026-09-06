create or replace function commerce.order_consent_acceptance_projection(p_payment_attempt_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'key', proof.document_key,
        'contextKey', proof.context_key,
        'operationKey', proof.operation_key,
        'acceptanceId', proof.consent_acceptance_id,
        'versionId', proof.document_version_id,
        'contentHash', proof.content_hash,
        'acceptedAt', proof.accepted_at,
        'correlationId', proof.correlation_id
    ) order by proof.context_key, proof.document_key), '[]'::jsonb)
    from commerce.order_consent_acceptances proof
    where proof.payment_attempt_id = p_payment_attempt_id;
$$;
