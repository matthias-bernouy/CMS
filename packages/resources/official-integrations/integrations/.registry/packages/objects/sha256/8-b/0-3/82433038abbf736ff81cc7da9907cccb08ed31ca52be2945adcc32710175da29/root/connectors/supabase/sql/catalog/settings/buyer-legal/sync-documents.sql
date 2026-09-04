drop function if exists commerce.sync_buyer_legal_documents(
    boolean,
    jsonb,
    text
);
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
begin
    if p_enabled is null then
        raise exception 'validation: enabled is required';
    end if;
    if p_actor_id is null
        or btrim(p_actor_id) = ''
        or length(p_actor_id) > 512 then
        raise exception 'forbidden: missing configuration actor';
    end if;
    if p_documents is null
        or jsonb_typeof(p_documents) <> 'array'
        or jsonb_array_length(p_documents) > 20
        or coalesce((
            select sum(octet_length(item->'page'->>'content'))
            from jsonb_array_elements(p_documents) item
        ), 0) > 8388608 then
        raise exception
            'validation: documents exceed count or aggregate content limits';
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
        raise exception
            'validation: legal document snapshot origin is invalid';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_documents) item
        group by item->>'key'
        having count(*) > 1
    ) then
        raise exception
            'validation: legal document keys must be unique';
    end if;
    perform pg_advisory_xact_lock(
        hashtextextended('commerce:buyer-legal-documents', 0)
    );
    for v_document in
        select value from jsonb_array_elements(p_documents)
    loop
        select
            validated.document_key,
            validated.label,
            validated.consent_text,
            validated.checkout_contexts,
            validated.document_enabled,
            validated.page_id,
            validated.page_path,
            validated.page_title,
            validated.page_description,
            validated.page_content,
            validated.content_hash,
            validated.snapshot_url,
            validated.materialization_hash
        into
            v_key,
            v_label,
            v_consent_text,
            v_contexts,
            v_document_enabled,
            v_page_id,
            v_page_path,
            v_page_title,
            v_page_description,
            v_content,
            v_content_hash,
            v_snapshot_url,
            v_materialization_hash
        from commerce.validate_buyer_legal_sync_document(
            v_document,
            p_snapshot_origin
        ) validated;
        if v_document_enabled then
            v_enabled_document_count := v_enabled_document_count + 1;
        end if;
        perform commerce.materialize_buyer_legal_sync_document(
            v_key,
            v_document_enabled,
            v_label,
            v_consent_text,
            v_contexts,
            v_page_id,
            v_page_path,
            v_page_title,
            v_page_description,
            v_content,
            v_content_hash,
            v_snapshot_url,
            v_materialization_hash,
            p_actor_id
        );
    end loop;
    if p_enabled and v_enabled_document_count = 0 then
        raise exception
            'validation: enabled legal acceptance requires at least one enabled document';
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
            when jsonb_array_length(p_documents) > 0
                then p_snapshot_origin
            else null
        end
    where id = 'default'
      and (
          buyer_legal_acceptance_enabled,
          buyer_legal_snapshot_origin
      ) is distinct from (
          p_enabled,
          case
              when jsonb_array_length(p_documents) > 0
                  then p_snapshot_origin
              else null
          end
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
