create or replace function consent.operation_acceptance_projection(
    p_context_key text,
    p_operation_key text,
    p_cms_user_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_operation consent.operation_acceptances%rowtype;
    v_receipt jsonb;
begin
    select * into v_operation from consent.operation_acceptances
    where context_key = p_context_key and operation_key = p_operation_key;
    if not found then
        return null;
    end if;
    if v_operation.cms_user_id <> p_cms_user_id then
        raise exception 'conflict: consent operation belongs to another subject';
    end if;
    select jsonb_build_object(
        'schemaVersion', 1,
        'required', true,
        'contextKey', p_context_key,
        'operationKey', p_operation_key,
        'cmsUserId', acceptance.cms_user_id,
        'acceptanceId', acceptance.id::text,
        'acceptedAt', acceptance.accepted_at,
        'metadata', v_operation.metadata,
        'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'documentKey', document.document_key,
                'versionId', document.version_id,
                'contentHash', document.content_hash,
                'label', version.label,
                'consentText', version.consent_text,
                'pageUrl', version.page_path,
                'versionDate', version.materialized_at,
                'page', version.page_snapshot
            ) order by document.document_key)
            from consent.acceptance_documents document
            join consent.document_versions version
              on version.context_key = document.context_key
             and version.document_key = document.document_key
             and version.version_id = document.version_id
            where document.acceptance_id = acceptance.id
        ), '[]'::jsonb)
    ) into v_receipt
    from consent.acceptances acceptance
    where acceptance.id = v_operation.acceptance_id;
    return v_receipt;
end;
$$;
