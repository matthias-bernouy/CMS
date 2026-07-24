create or replace function commerce.buyer_legal_published_page_hash(
    p_page_id text,
    p_page_path text,
    p_page_title text,
    p_page_description text,
    p_page_content text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
    select encode(extensions.digest(pg_catalog.convert_to(
        '{"id":' || pg_catalog.to_json(p_page_id)::text ||
        ',"path":' || pg_catalog.to_json(p_page_path)::text ||
        ',"title":' || pg_catalog.to_json(p_page_title)::text ||
        ',"description":' || pg_catalog.to_json(p_page_description)::text ||
        ',"content":' || pg_catalog.to_json(p_page_content)::text || '}',
        'UTF8'
    ), 'sha256'), 'hex');
$$;

drop function if exists commerce.sync_buyer_legal_documents(boolean, jsonb, text);

create or replace function commerce.sync_buyer_legal_documents(
    p_enabled boolean,
    p_documents jsonb,
    p_snapshot_origin text,
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
    v_contexts text[];
    v_document_enabled boolean;
    v_enabled_document_count integer := 0;
    v_page_id text;
    v_page_path text;
    v_page_title text;
    v_page_description text;
    v_content jsonb;
    v_content_hash text;
    v_snapshot_url text;
    v_materialization_hash text;
    v_version_id uuid;
begin
    if p_enabled is null then
        raise exception 'validation: enabled is required';
    end if;
    if p_actor_id is null or btrim(p_actor_id) = '' or length(p_actor_id) > 512 then
        raise exception 'forbidden: missing configuration actor';
    end if;
    if p_documents is null
        or jsonb_typeof(p_documents) <> 'array'
        or jsonb_array_length(p_documents) > 20 then
        raise exception 'validation: documents must be an array of at most 20 entries';
    end if;
    if jsonb_array_length(p_documents) > 0 and (
        p_snapshot_origin is null
        or length(p_snapshot_origin) > 2048
        or (
            p_snapshot_origin !~ '^https://[^/]+$'
            and p_snapshot_origin !~
                '^http://(localhost|[^/]+[.]localhost|127[.]0[.]0[.]1|[[]::1[]])(:[0-9]+)?$'
        )
    ) then
        raise exception 'validation: legal document snapshot origin is invalid';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_documents) item
        group by item->>'key'
        having count(*) > 1
    ) then
        raise exception 'validation: legal document keys must be unique';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('commerce:buyer-legal-documents', 0));
    for v_document in select value from jsonb_array_elements(p_documents)
    loop
        if jsonb_typeof(v_document) <> 'object' then
            raise exception 'validation: every legal document must be an object';
        end if;
        v_key := btrim(coalesce(v_document->>'key', ''));
        v_label := btrim(coalesce(v_document->>'label', ''));
        v_consent_text := btrim(coalesce(v_document->>'consentText', ''));
        v_page := v_document->'page';
        if v_document ? 'enabled'
            and jsonb_typeof(v_document->'enabled') <> 'boolean' then
            raise exception 'validation: legal document enabled must be a boolean';
        end if;
        v_document_enabled := coalesce((v_document->>'enabled')::boolean, true);
        if v_document_enabled then
            v_enabled_document_count := v_enabled_document_count + 1;
        end if;
        if v_key !~ '^[a-z][a-z0-9_.-]{1,79}$' then
            raise exception 'validation: legal document key is invalid';
        end if;
        if v_label = '' or length(v_label) > 200 then
            raise exception 'validation: legal document label is invalid';
        end if;
        if v_consent_text = '' or length(v_consent_text) > 1000 then
            raise exception 'validation: legal document consent text is invalid';
        end if;
        if jsonb_typeof(v_document->'contexts') <> 'array' then
            raise exception 'validation: legal document contexts must be an array';
        end if;
        select array_agg(distinct context order by context)
        into v_contexts
        from jsonb_array_elements_text(v_document->'contexts') context;
        if coalesce(cardinality(v_contexts), 0) = 0
            or not v_contexts <@ array[
                'buyer_checkout', 'protected_payment', 'direct_purchase', 'negotiated_offer', 'cart'
            ]::text[] then
            raise exception 'validation: legal document contexts are invalid';
        end if;
        if jsonb_typeof(v_page) <> 'object' or not v_page ? 'content' then
            raise exception 'validation: legal document page snapshot is required';
        end if;
        v_page_id := coalesce(v_page->>'id', '');
        v_page_path := coalesce(v_page->>'path', '');
        v_page_title := coalesce(v_page->>'title', '');
        v_page_description := coalesce(v_page->>'description', '');
        v_content := v_page->'content';
        v_content_hash := coalesce(v_page->>'contentHash', '');
        v_snapshot_url := coalesce(v_page->>'publishedSnapshotUrl', '');
        if btrim(v_page_id) = '' or length(v_page_id) > 512 then
            raise exception 'validation: legal document page id is invalid';
        end if;
        if v_page_path !~ '^/' or length(v_page_path) > 2048 then
            raise exception 'validation: legal document page path is invalid';
        end if;
        if btrim(v_page_title) = '' or length(v_page_title) > 500 then
            raise exception 'validation: legal document page title is invalid';
        end if;
        if jsonb_typeof(v_page->'description') <> 'string'
            or length(v_page_description) > 1000 then
            raise exception 'validation: legal document page description is invalid';
        end if;
        if jsonb_typeof(v_content) <> 'string'
            or btrim(coalesce(v_content #>> '{}', '')) = ''
            or pg_column_size(v_content) > 2097152 then
            raise exception 'validation: legal document page content is invalid';
        end if;
        if v_content_hash !~ '^[a-f0-9]{64}$' then
            raise exception 'validation: legal document content hash is invalid';
        end if;
        if v_content_hash <> commerce.buyer_legal_published_page_hash(
            v_page_id,
            v_page_path,
            v_page_title,
            v_page_description,
            v_content #>> '{}'
        ) then
            raise exception 'validation: legal document content hash does not match its page snapshot';
        end if;
        if length(v_snapshot_url) > 4096
            or v_snapshot_url !~ '^https?://'
            or v_snapshot_url not like p_snapshot_origin || '/%'
            or v_snapshot_url !~ '/[.]cms/content/published-page-snapshot[?]' then
            raise exception 'validation: legal document snapshot URL is invalid';
        end if;
        v_materialization_hash := encode(extensions.digest(jsonb_build_object(
            'contentHash', v_content_hash,
            'label', v_label,
            'consentText', v_consent_text,
            'contexts', to_jsonb(v_contexts)
        )::text, 'sha256'), 'hex');

        insert into commerce.buyer_legal_documents (
            document_key, enabled, published_snapshot_url, configured_by
        ) values (
            v_key, v_document_enabled, v_snapshot_url, p_actor_id
        ) on conflict (document_key) do update set
            enabled = excluded.enabled,
            published_snapshot_url = excluded.published_snapshot_url,
            configured_by = excluded.configured_by
        where (
            commerce.buyer_legal_documents.enabled,
            commerce.buyer_legal_documents.published_snapshot_url,
            commerce.buyer_legal_documents.configured_by
        ) is distinct from (
            excluded.enabled,
            excluded.published_snapshot_url,
            excluded.configured_by
        );
        v_version_id := null;
        select version.id into v_version_id
        from commerce.buyer_legal_documents document
        join commerce.buyer_legal_document_versions version
          on version.id = document.current_version_id
        where document.document_key = v_key
          and version.materialization_hash = v_materialization_hash;
        if v_version_id is null then
            insert into commerce.buyer_legal_document_versions (
                document_key, label, consent_text, checkout_contexts,
                cms_page_id, page_path, page_title, page_description,
                page_content, content_hash, materialization_hash, materialized_by
            ) values (
                v_key, v_label, v_consent_text, v_contexts,
                v_page_id, v_page_path, v_page_title, v_page_description,
                v_content, v_content_hash, v_materialization_hash, p_actor_id
            ) returning id into v_version_id;
        end if;
        update commerce.buyer_legal_documents
        set current_version_id = v_version_id
        where document_key = v_key
          and current_version_id is distinct from v_version_id;
    end loop;
    if p_enabled and v_enabled_document_count = 0 then
        raise exception 'validation: enabled legal acceptance requires at least one enabled document';
    end if;

    update commerce.buyer_legal_documents configured
    set enabled = false, configured_by = p_actor_id
    where configured.enabled
      and not exists (
          select 1
          from jsonb_array_elements(p_documents) item
          where item->>'key' = configured.document_key
      );
    update commerce.settings
    set
        buyer_legal_acceptance_enabled = p_enabled,
        buyer_legal_snapshot_origin = case
            when jsonb_array_length(p_documents) > 0 then p_snapshot_origin
            else null
        end
    where id = 'default'
      and (
          buyer_legal_acceptance_enabled,
          buyer_legal_snapshot_origin
      ) is distinct from (
          p_enabled,
          case when jsonb_array_length(p_documents) > 0 then p_snapshot_origin else null end
      );

    return jsonb_build_object(
        'enabled', p_enabled,
        'documents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', document.document_key,
                'versionId', version.id,
                'contentHash', version.content_hash,
                'versionDate', version.materialized_at
            ) order by document.document_key)
            from commerce.buyer_legal_documents document
            join commerce.buyer_legal_document_versions version
              on version.id = document.current_version_id
            where document.enabled
        ), '[]'::jsonb)
    );
end;
$$;
