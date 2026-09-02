create or replace function consent.materialize_consent_documents(
    p_context_key text,
    p_documents jsonb,
    p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_context consent.contexts%rowtype;
    v_document jsonb;
    v_config consent.documents%rowtype;
    v_page jsonb;
    v_key text;
    v_hash text;
    v_version_id text;
    v_count integer;
begin
    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    select * into v_context
    from consent.contexts
    where context_key = p_context_key
    for update;
    if not found then
        raise exception 'not_found: consent context';
    end if;
    if not v_context.enabled then
        return consent.consent_requirements_projection(p_context_key);
    end if;
    if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) > 8 then
        raise exception 'validation: verified documents must be an array of at most 8 entries';
    end if;
    select count(*) into v_count
    from consent.documents
    where context_key = p_context_key and enabled;
    if v_count = 0 or v_count <> jsonb_array_length(p_documents) then
        raise exception 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE';
    end if;
    if (select count(distinct value->>'key') from jsonb_array_elements(p_documents)) <> v_count then
        raise exception 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE';
    end if;

    for v_document in select value from jsonb_array_elements(p_documents)
    loop
        v_key := coalesce(v_document->>'key', '');
        select * into v_config
        from consent.documents
        where context_key = p_context_key and document_key = v_key and enabled
        for update;
        if not found
            or v_document->>'label' is distinct from v_config.label
            or v_document->>'consentText' is distinct from v_config.consent_text
            or v_document->>'publishedSnapshotUrl' is distinct from v_config.published_snapshot_url then
            raise exception 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE';
        end if;
        v_page := v_document->'page';
        if jsonb_typeof(v_page) <> 'object'
            or v_page->>'id' is distinct from v_config.cms_page_id
            or left(coalesce(v_page->>'path', ''), 1) <> '/'
            or left(coalesce(v_page->>'path', ''), 2) = '//'
            or strpos(coalesce(v_page->>'path', ''), chr(92)) > 0
            or coalesce(v_page->>'path', '') ~ '[[:cntrl:]]'
            or length(coalesce(v_page->>'path', '')) > 2048
            or length(btrim(coalesce(v_page->>'title', ''))) not between 1 and 500
            or length(coalesce(v_page->>'description', '')) > 1000
            or length(btrim(coalesce(v_page->>'content', ''))) = 0
            or octet_length(coalesce(v_page->>'content', '')) > 2000000 then
            raise exception 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE';
        end if;
        v_hash := consent.published_page_hash(v_page);
        if v_hash is distinct from v_document->>'contentHash' then
            raise exception 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE';
        end if;
        v_version_id := consent.document_version_id(
            p_context_key, v_key, v_config.label, v_config.consent_text,
            v_config.published_snapshot_url, v_hash
        );
        insert into consent.document_versions (
            context_key, document_key, version_id, label, consent_text,
            cms_page_id, page_path, page_title, page_description,
            page_content, page_snapshot, published_snapshot_url,
            content_hash, materialized_by
        ) values (
            p_context_key, v_key, v_version_id, v_config.label, v_config.consent_text,
            v_config.cms_page_id, v_page->>'path', v_page->>'title',
            coalesce(v_page->>'description', ''), v_page->>'content', v_page,
            v_config.published_snapshot_url, v_hash, p_actor_id
        ) on conflict (context_key, document_key, version_id) do nothing;
        update consent.documents
        set current_version_id = v_version_id, updated_at = now()
        where context_key = p_context_key
          and document_key = v_key
          and current_version_id is distinct from v_version_id;
    end loop;
    return consent.consent_requirements_projection(p_context_key);
end;
$$;
