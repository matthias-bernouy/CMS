create or replace function consent.consent_requirements_projection(p_context_key text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_enabled boolean;
    v_documents jsonb;
begin
    select context.enabled into v_enabled
    from consent.contexts context
    where context.context_key = p_context_key;
    if not found then
        raise exception 'not_found: consent context';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'documentKey', document.document_key,
        'versionId', version.version_id,
        'label', version.label,
        'consentText', version.consent_text,
        'consentPrefix', left(
            version.consent_text,
            strpos(version.consent_text, version.label) - 1
        ),
        'consentSuffix', substring(
            version.consent_text
            from strpos(version.consent_text, version.label) + char_length(version.label)
        ),
        'page', jsonb_build_object(
            'id', version.cms_page_id,
            'path', version.page_path,
            'title', version.page_title
        ),
        'contentHash', version.content_hash,
        'versionDate', version.materialized_at
    ) order by document.sort_order, document.document_key), '[]'::jsonb)
    into v_documents
    from consent.documents document
    join consent.document_versions version
      on version.context_key = document.context_key
     and version.document_key = document.document_key
     and version.version_id = document.current_version_id
    where document.context_key = p_context_key
      and document.enabled
      and v_enabled;

    return jsonb_build_object(
        'enabled', v_enabled,
        'contextKey', p_context_key,
        'documents', v_documents
    );
end;
$$;

create or replace function consent.get_consent_refresh_context(p_context_key text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_result jsonb;
begin
    select jsonb_build_object(
        'enabled', context.enabled,
        'contextKey', context.context_key,
        'approvedSnapshotOrigin', context.approved_snapshot_origin,
        'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', document.document_key,
                'label', document.label,
                'consentText', document.consent_text,
                'pageId', document.cms_page_id,
                'publishedSnapshotUrl', document.published_snapshot_url
            ) order by document.sort_order, document.document_key)
            from consent.documents document
            where document.context_key = context.context_key
              and document.enabled
              and context.enabled
        ), '[]'::jsonb)
    ) into v_result
    from consent.contexts context
    where context.context_key = p_context_key;
    if v_result is null then
        raise exception 'not_found: consent context';
    end if;
    return v_result;
end;
$$;
