create or replace function consent.sync_consent_context(
    p_context_key text,
    p_enabled boolean,
    p_snapshot_origin text,
    p_documents jsonb,
    p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_document jsonb;
    v_page jsonb;
    v_key text;
    v_label text;
    v_consent_text text;
    v_document_enabled boolean;
    v_position integer;
    v_enabled_documents jsonb;
    v_requirements jsonb;
begin
    if p_context_key !~ '^[a-z][a-z0-9_.-]{0,79}$'
        or length(btrim(coalesce(p_actor_id, ''))) not between 1 and 512 then
        raise exception 'validation: invalid consent context configuration';
    end if;
    if p_snapshot_origin is not null
        and (length(p_snapshot_origin) > 2048 or p_snapshot_origin !~ '^https?://[^/]+$') then
        raise exception 'validation: invalid consent snapshot origin';
    end if;
    if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) > 8 then
        raise exception 'validation: consent documents must be an array of at most 8 entries';
    end if;
    if (select count(distinct value->>'key') from jsonb_array_elements(p_documents))
        <> jsonb_array_length(p_documents) then
        raise exception 'validation: consent document keys must be unique';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    insert into consent.contexts (
        context_key, enabled, approved_snapshot_origin, configured_by
    ) values (
        p_context_key, p_enabled, p_snapshot_origin, p_actor_id
    ) on conflict (context_key) do update set
        enabled = excluded.enabled,
        approved_snapshot_origin = excluded.approved_snapshot_origin,
        configured_by = excluded.configured_by,
        updated_at = now();

    update consent.documents
    set enabled = false, configured_by = p_actor_id, updated_at = now()
    where context_key = p_context_key;

    for v_document, v_position in
        select entry.value, entry.position::integer - 1
        from jsonb_array_elements(p_documents) with ordinality entry(value, position)
    loop
        if jsonb_typeof(v_document) <> 'object'
            or (v_document ? 'enabled' and jsonb_typeof(v_document->'enabled') <> 'boolean') then
            raise exception 'validation: invalid consent document';
        end if;
        v_key := btrim(coalesce(v_document->>'key', ''));
        v_label := btrim(coalesce(v_document->>'label', ''));
        v_consent_text := btrim(coalesce(v_document->>'consentText', ''));
        v_document_enabled := coalesce((v_document->>'enabled')::boolean, true);
        v_page := v_document->'page';
        if v_key !~ '^[a-z][a-z0-9_.-]{0,79}$'
            or length(v_label) not between 1 and 200
            or length(v_consent_text) not between 1 and 1000
            or jsonb_typeof(v_page) <> 'object'
            or length(btrim(coalesce(v_page->>'id', ''))) not between 1 and 512
            or length(coalesce(v_document->>'publishedSnapshotUrl', '')) not between 1 and 4096 then
            raise exception 'validation: invalid consent document';
        end if;
        if strpos(v_consent_text, v_label) = 0 then
            raise exception 'validation: consentText must contain label';
        end if;
        if p_snapshot_origin is null
            or v_document->>'publishedSnapshotUrl' not like p_snapshot_origin || '/%' then
            raise exception 'validation: consent snapshot URL does not use the approved origin';
        end if;
        insert into consent.documents (
            context_key, document_key, enabled, sort_order, label, consent_text,
            cms_page_id, published_snapshot_url, configured_by
        ) values (
            p_context_key, v_key, v_document_enabled, v_position, v_label,
            v_consent_text, v_page->>'id',
            v_document->>'publishedSnapshotUrl', p_actor_id
        ) on conflict (context_key, document_key) do update set
            enabled = excluded.enabled,
            sort_order = excluded.sort_order,
            label = excluded.label,
            consent_text = excluded.consent_text,
            cms_page_id = excluded.cms_page_id,
            published_snapshot_url = excluded.published_snapshot_url,
            configured_by = excluded.configured_by,
            updated_at = now();
    end loop;

    select coalesce(jsonb_agg(value order by position), '[]'::jsonb)
    into v_enabled_documents
    from jsonb_array_elements(p_documents) with ordinality entry(value, position)
    where coalesce((value->>'enabled')::boolean, true);
    if p_enabled and jsonb_array_length(v_enabled_documents) = 0 then
        raise exception 'validation: enabled consent requires at least one document';
    end if;
    v_requirements := consent.materialize_consent_documents(
        p_context_key, v_enabled_documents, p_actor_id
    );
    return jsonb_build_object(
        'contextKey', p_context_key,
        'enabled', p_enabled,
        'documentCount', jsonb_array_length(v_requirements->'documents')
    );
end;
$$;
