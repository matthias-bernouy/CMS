create or replace function commerce.refresh_buyer_legal_document_snapshots(
    p_documents jsonb,
    p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_input jsonb;
    v_page jsonb;
    v_document commerce.buyer_legal_documents%rowtype;
    v_current commerce.buyer_legal_document_versions%rowtype;
    v_key text;
    v_expected_version_id uuid;
    v_page_id text;
    v_page_path text;
    v_page_title text;
    v_page_description text;
    v_page_content jsonb;
    v_content_hash text;
    v_materialization_hash text;
    v_version_id uuid;
    v_requires_mutation boolean;
    v_result jsonb := '[]'::jsonb;
begin
    if p_actor_id is null
        or btrim(p_actor_id) = ''
        or length(p_actor_id) > 512 then
        raise exception 'forbidden: missing snapshot verification actor';
    end if;
    if p_documents is null
        or jsonb_typeof(p_documents) <> 'array'
        or jsonb_array_length(p_documents) > 20
        or coalesce((
            select sum(octet_length(item->'page'->>'content'))
            from jsonb_array_elements(p_documents) item
        ), 0) > 8388608 then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_documents) item
        group by item->>'key'
        having count(*) > 1
    ) then
        raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
    end if;

    v_requires_mutation :=
        commerce.buyer_legal_snapshot_refresh_required(p_documents);
    if v_requires_mutation then
        perform pg_advisory_xact_lock(
            hashtextextended('commerce:buyer-legal-documents', 0)
        );
    end if;
    for v_input in
        select value from jsonb_array_elements(p_documents)
    loop
        v_key := v_input->>'key';
        v_expected_version_id := (v_input->>'expectedVersionId')::uuid;
        v_content_hash := v_input->>'contentHash';
        v_page := v_input->'page';
        if jsonb_typeof(v_page) <> 'object' then
            raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
        end if;

        if v_requires_mutation then
            select * into v_document
            from commerce.buyer_legal_documents document
            where document.document_key = v_key
            for update;
        else
            select * into v_document
            from commerce.buyer_legal_documents document
            where document.document_key = v_key;
        end if;
        if not found
            or not v_document.enabled
            or v_document.current_version_id is null
            or v_document.current_version_id <> v_expected_version_id then
            raise exception 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED';
        end if;
        select * into strict v_current
        from commerce.buyer_legal_document_versions version
        where version.id = v_document.current_version_id
          and version.document_key = v_document.document_key;

        v_page_id := coalesce(v_page->>'id', '');
        v_page_path := coalesce(v_page->>'path', '');
        v_page_title := coalesce(v_page->>'title', '');
        v_page_description := coalesce(v_page->>'description', '');
        v_page_content := v_page->'content';
        if v_page_id <> v_current.cms_page_id
            or length(v_page_id) > 512
            or v_page_path !~ '^/'
            or length(v_page_path) > 2048
            or btrim(v_page_title) = ''
            or length(v_page_title) > 500
            or jsonb_typeof(v_page->'description') <> 'string'
            or length(v_page_description) > 1000
            or jsonb_typeof(v_page_content) <> 'string'
            or btrim(coalesce(v_page_content #>> '{}', '')) = ''
            or pg_column_size(v_page_content) > 2097152 then
            raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
        end if;
        if v_content_hash <> commerce.buyer_legal_published_page_hash(
            v_page_id,
            v_page_path,
            v_page_title,
            v_page_description,
            v_page_content #>> '{}'
        ) then
            raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
        end if;

        v_version_id := v_current.id;
        if v_content_hash <> v_current.content_hash then
            if not v_requires_mutation then
                raise exception 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED';
            end if;
            v_materialization_hash := encode(extensions.digest(
                jsonb_build_object(
                    'contentHash', v_content_hash,
                    'label', v_current.label,
                    'consentText', v_current.consent_text,
                    'contexts', to_jsonb(v_current.checkout_contexts)
                )::text,
                'sha256'
            ), 'hex');
            insert into commerce.buyer_legal_document_versions (
                document_key, label, consent_text, checkout_contexts,
                cms_page_id, page_path, page_title, page_description,
                page_content, content_hash, materialization_hash,
                materialized_by
            ) values (
                v_current.document_key, v_current.label,
                v_current.consent_text, v_current.checkout_contexts,
                v_page_id, v_page_path, v_page_title, v_page_description,
                v_page_content, v_content_hash, v_materialization_hash,
                p_actor_id
            ) returning id into v_version_id;
            update commerce.buyer_legal_documents
            set current_version_id = v_version_id
            where document_key = v_current.document_key
              and current_version_id = v_current.id;
            if not found then
                raise exception 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED';
            end if;
        end if;
        v_result := v_result || jsonb_build_array(jsonb_build_object(
            'key', v_key,
            'versionId', v_version_id,
            'contentHash', v_content_hash
        ));
    end loop;
    return v_result;
end;
$$;
