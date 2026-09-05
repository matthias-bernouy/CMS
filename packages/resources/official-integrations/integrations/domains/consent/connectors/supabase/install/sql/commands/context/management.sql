create or replace function consent.consent_context_management_projection(p_context_key text)
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
        'contextKey', context.context_key,
        'enabled', context.enabled,
        'status', case when context.enabled then 'active' else 'inactive' end,
        'revision', context.xmin::text || ':' || context.ctid::text,
        'approvedSnapshotOrigin', context.approved_snapshot_origin,
        'updatedAt', context.updated_at,
        'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', document.document_key,
                'enabled', document.enabled,
                'position', document.sort_order,
                'label', document.label,
                'consentText', document.consent_text,
                'pageId', document.cms_page_id,
                'publishedSnapshotUrl', document.published_snapshot_url,
                'versionId', document.current_version_id,
                'contentHash', version.content_hash
            ) order by document.sort_order, document.document_key)
            from consent.documents document
            left join consent.document_versions version
              on version.context_key = document.context_key
             and version.document_key = document.document_key
             and version.version_id = document.current_version_id
            where document.context_key = context.context_key
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

create or replace function consent.list_consent_contexts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with items as (
        select jsonb_build_object(
            'id', context.context_key,
            'contextKey', context.context_key,
            'enabled', context.enabled,
            'status', case when context.enabled then 'active' else 'inactive' end,
            'revision', context.xmin::text || ':' || context.ctid::text,
            'documentCount', count(document.document_key) filter (where document.enabled),
            'updatedAt', context.updated_at
        ) as item, context.updated_at, context.context_key
        from consent.contexts context
        left join consent.documents document on document.context_key = context.context_key
        group by context.context_key, context.xmin, context.ctid
    )
    select jsonb_build_object(
        'items', coalesce(jsonb_agg(item order by updated_at desc, context_key), '[]'::jsonb),
        'total', count(*)
    )
    from items;
$$;

create or replace function consent.bootstrap_consent_context(
    p_context_key text,
    p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if p_context_key !~ '^[a-z][a-z0-9_.-]{0,79}$'
        or length(btrim(coalesce(p_actor_id, ''))) not between 1 and 512 then
        raise exception 'validation: invalid consent context bootstrap';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    insert into consent.contexts (context_key, enabled, configured_by)
    values (p_context_key, false, p_actor_id)
    on conflict (context_key) do nothing;
    return consent.consent_context_management_projection(p_context_key);
end;
$$;

create or replace function consent.publish_consent_context(
    p_context_key text,
    p_enabled boolean,
    p_snapshot_origin text,
    p_documents jsonb,
    p_actor_id text,
    p_expected_revision text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_revision text;
begin
    if length(btrim(coalesce(p_expected_revision, ''))) not between 1 and 32 then
        raise exception 'validation: expectedRevision is invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    select xmin::text || ':' || ctid::text into v_revision
    from consent.contexts
    where context_key = p_context_key
    for update;
    if found and v_revision <> p_expected_revision then
        raise exception 'conflict: CONSENT_CONTEXT_REVISION_CHANGED';
    end if;
    if not found and p_expected_revision <> 'new' then
        raise exception 'conflict: CONSENT_CONTEXT_REVISION_CHANGED';
    end if;
    perform consent.sync_consent_context(
        p_context_key, p_enabled, p_snapshot_origin, p_documents, p_actor_id
    );
    return consent.consent_context_management_projection(p_context_key);
end;
$$;

create or replace function consent.disable_consent_context(
    p_context_key text,
    p_actor_id text,
    p_expected_revision text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if length(btrim(coalesce(p_expected_revision, ''))) not between 1 and 32
        or p_expected_revision = 'new' then
        raise exception 'validation: expectedRevision is invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    update consent.contexts
    set enabled = false,
        configured_by = p_actor_id,
        updated_at = now()
    where context_key = p_context_key
      and xmin::text || ':' || ctid::text = p_expected_revision;
    if not found then
        if exists (select 1 from consent.contexts where context_key = p_context_key) then
            raise exception 'conflict: CONSENT_CONTEXT_REVISION_CHANGED';
        end if;
        raise exception 'not_found: consent context';
    end if;
    return consent.consent_context_management_projection(p_context_key);
end;
$$;
