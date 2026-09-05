create or replace function consent.published_page_hash(p_page jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
    select encode(extensions.digest(pg_catalog.convert_to(
        '{"id":' || pg_catalog.to_json(coalesce(p_page->>'id', ''))::text ||
        ',"path":' || pg_catalog.to_json(coalesce(p_page->>'path', ''))::text ||
        ',"title":' || pg_catalog.to_json(coalesce(p_page->>'title', ''))::text ||
        ',"description":' || pg_catalog.to_json(coalesce(p_page->>'description', ''))::text ||
        ',"content":' || pg_catalog.to_json(coalesce(p_page->>'content', ''))::text || '}',
        'UTF8'
    ), 'sha256'), 'hex');
$$;

create or replace function consent.document_version_id(
    p_context_key text,
    p_document_key text,
    p_label text,
    p_consent_text text,
    p_published_snapshot_url text,
    p_content_hash text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
    select encode(extensions.digest(pg_catalog.convert_to(
        jsonb_build_object(
            'schema', 'cms-consent-document-version-v1',
            'contextKey', p_context_key,
            'documentKey', p_document_key,
            'label', p_label,
            'consentText', p_consent_text,
            'publishedSnapshotUrl', p_published_snapshot_url,
            'contentHash', p_content_hash
        )::text,
        'UTF8'
    ), 'sha256'), 'hex');
$$;
