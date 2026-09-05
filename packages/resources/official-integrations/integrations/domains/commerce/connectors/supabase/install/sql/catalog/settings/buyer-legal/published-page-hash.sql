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
