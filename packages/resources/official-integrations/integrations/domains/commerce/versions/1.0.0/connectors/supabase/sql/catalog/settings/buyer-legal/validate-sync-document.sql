create or replace function commerce.validate_buyer_legal_sync_document(
    p_document jsonb,
    p_snapshot_origin text
)
returns table (
    document_key text,
    label text,
    consent_text text,
    checkout_contexts text[],
    document_enabled boolean,
    page_id text,
    page_path text,
    page_title text,
    page_description text,
    page_content jsonb,
    content_hash text,
    snapshot_url text,
    materialization_hash text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_page jsonb;
begin
    if jsonb_typeof(p_document) <> 'object' then
        raise exception 'validation: every legal document must be an object';
    end if;
    document_key := btrim(coalesce(p_document->>'key', ''));
    label := btrim(coalesce(p_document->>'label', ''));
    consent_text := btrim(coalesce(p_document->>'consentText', ''));
    v_page := p_document->'page';
    if p_document ? 'enabled'
        and jsonb_typeof(p_document->'enabled') <> 'boolean' then
        raise exception
            'validation: legal document enabled must be a boolean';
    end if;
    document_enabled := coalesce(
        (p_document->>'enabled')::boolean,
        true
    );
    if document_key !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: legal document key is invalid';
    end if;
    if label = '' or length(label) > 200 then
        raise exception 'validation: legal document label is invalid';
    end if;
    if consent_text = '' or length(consent_text) > 1000 then
        raise exception 'validation: legal document consent text is invalid';
    end if;
    if jsonb_typeof(p_document->'contexts') <> 'array' then
        raise exception
            'validation: legal document contexts must be an array';
    end if;
    select array_agg(distinct context order by context)
    into checkout_contexts
    from jsonb_array_elements_text(p_document->'contexts') context;
    if coalesce(cardinality(checkout_contexts), 0) = 0
        or not checkout_contexts <@ array[
            'buyer_checkout',
            'protected_payment',
            'direct_purchase',
            'negotiated_offer',
            'cart'
        ]::text[] then
        raise exception 'validation: legal document contexts are invalid';
    end if;
    if jsonb_typeof(v_page) <> 'object' or not v_page ? 'content' then
        raise exception
            'validation: legal document page snapshot is required';
    end if;
    page_id := coalesce(v_page->>'id', '');
    page_path := coalesce(v_page->>'path', '');
    page_title := coalesce(v_page->>'title', '');
    page_description := coalesce(v_page->>'description', '');
    page_content := v_page->'content';
    content_hash := coalesce(v_page->>'contentHash', '');
    snapshot_url := coalesce(v_page->>'publishedSnapshotUrl', '');
    if btrim(page_id) = '' or length(page_id) > 512 then
        raise exception 'validation: legal document page id is invalid';
    end if;
    if page_path !~ '^/' or length(page_path) > 2048 then
        raise exception 'validation: legal document page path is invalid';
    end if;
    if btrim(page_title) = '' or length(page_title) > 500 then
        raise exception 'validation: legal document page title is invalid';
    end if;
    if jsonb_typeof(v_page->'description') <> 'string'
        or length(page_description) > 1000 then
        raise exception
            'validation: legal document page description is invalid';
    end if;
    if jsonb_typeof(page_content) <> 'string'
        or btrim(coalesce(page_content #>> '{}', '')) = ''
        or pg_column_size(page_content) > 2097152 then
        raise exception 'validation: legal document page content is invalid';
    end if;
    if content_hash !~ '^[a-f0-9]{64}$'
        or content_hash <> commerce.buyer_legal_published_page_hash(
            page_id,
            page_path,
            page_title,
            page_description,
            page_content #>> '{}'
        ) then
        raise exception
            'validation: legal document content hash does not match its page snapshot';
    end if;
    if length(snapshot_url) > 4096
        or snapshot_url !~ '^https?://'
        or snapshot_url not like p_snapshot_origin || '/%'
        or snapshot_url !~
            '/[.]cms/content/published-page-snapshot[?]' then
        raise exception
            'validation: legal document snapshot URL is invalid';
    end if;
    materialization_hash := encode(extensions.digest(
        jsonb_build_object(
            'contentHash', content_hash,
            'label', label,
            'consentText', consent_text,
            'contexts', to_jsonb(checkout_contexts)
        )::text,
        'sha256'
    ), 'hex');
    return next;
end;
$$;
