create or replace function consent.list_consent_acceptances(
    p_context_key text default null,
    p_cms_user_id text default null,
    p_before_committed_at timestamptz default null,
    p_before_id uuid default null,
    p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_items jsonb;
    v_total bigint;
    v_next jsonb;
begin
    if (p_before_committed_at is null) <> (p_before_id is null) then
        raise exception 'validation: both audit cursor fields are required';
    end if;
    select count(*) into v_total
    from consent.acceptances acceptance
    where (p_context_key is null or acceptance.context_key = p_context_key)
      and (p_cms_user_id is null or acceptance.cms_user_id = p_cms_user_id);

    with page as (
        select acceptance.*
        from consent.acceptances acceptance
        where (p_context_key is null or acceptance.context_key = p_context_key)
          and (p_cms_user_id is null or acceptance.cms_user_id = p_cms_user_id)
          and (
              p_before_committed_at is null
              or (acceptance.committed_at, acceptance.id)
                 < (p_before_committed_at, p_before_id)
          )
        order by acceptance.committed_at desc, acceptance.id desc
        limit v_limit + 1
    ), visible as (
        select * from page
        order by committed_at desc, id desc
        limit v_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', visible.id,
        'contextKey', visible.context_key,
        'cmsUserId', visible.cms_user_id,
        'acceptedAt', visible.accepted_at,
        'committedAt', visible.committed_at,
        'documentSummary', coalesce((
            select string_agg(version.label, ', ' order by document.document_key)
            from consent.acceptance_documents document
            join consent.document_versions version
              on version.context_key = document.context_key
             and version.document_key = document.document_key
             and version.version_id = document.version_id
            where document.acceptance_id = visible.id
        ), ''),
        'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'documentKey', document.document_key,
                'versionId', document.version_id,
                'contentHash', document.content_hash,
                'label', version.label,
                'pageTitle', version.page_title,
                'pagePath', version.page_path,
                'publishedSnapshotUrl', version.published_snapshot_url
            ) order by document.document_key)
            from consent.acceptance_documents document
            join consent.document_versions version
              on version.context_key = document.context_key
             and version.document_key = document.document_key
             and version.version_id = document.version_id
            where document.acceptance_id = visible.id
        ), '[]'::jsonb)
    ) order by visible.committed_at desc, visible.id desc), '[]'::jsonb)
    into v_items
    from visible;

    if (select count(*) from (
        select 1 from consent.acceptances acceptance
        where (p_context_key is null or acceptance.context_key = p_context_key)
          and (p_cms_user_id is null or acceptance.cms_user_id = p_cms_user_id)
          and (p_before_committed_at is null or (acceptance.committed_at, acceptance.id)
              < (p_before_committed_at, p_before_id))
        order by acceptance.committed_at desc, acceptance.id desc
        limit v_limit + 1
    ) more) > v_limit then
        select jsonb_build_object(
            'committedAt', item->>'committedAt',
            'id', item->>'id'
        ) into v_next
        from jsonb_array_elements(v_items) with ordinality entry(item, position)
        order by position desc limit 1;
    end if;
    return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$$;
