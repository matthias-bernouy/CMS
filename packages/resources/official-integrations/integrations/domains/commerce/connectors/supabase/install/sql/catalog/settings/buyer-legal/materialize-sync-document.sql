create or replace function commerce.materialize_buyer_legal_sync_document(
    p_document_key text,
    p_enabled boolean,
    p_label text,
    p_consent_text text,
    p_contexts text[],
    p_page_id text,
    p_page_path text,
    p_page_title text,
    p_page_description text,
    p_page_content jsonb,
    p_content_hash text,
    p_snapshot_url text,
    p_materialization_hash text,
    p_actor_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_version_id uuid;
begin
    insert into commerce.buyer_legal_documents (
        document_key, enabled, published_snapshot_url, configured_by
    ) values (
        p_document_key, p_enabled, p_snapshot_url, p_actor_id
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
    select version.id into v_version_id
    from commerce.buyer_legal_documents document
    join commerce.buyer_legal_document_versions version
      on version.id = document.current_version_id
    where document.document_key = p_document_key
      and version.materialization_hash = p_materialization_hash;
    if v_version_id is null then
        insert into commerce.buyer_legal_document_versions (
            document_key, label, consent_text, checkout_contexts,
            cms_page_id, page_path, page_title, page_description,
            page_content, content_hash, materialization_hash,
            materialized_by
        ) values (
            p_document_key, p_label, p_consent_text, p_contexts,
            p_page_id, p_page_path, p_page_title, p_page_description,
            p_page_content, p_content_hash, p_materialization_hash,
            p_actor_id
        ) returning id into v_version_id;
    end if;
    update commerce.buyer_legal_documents
    set current_version_id = v_version_id
    where document_key = p_document_key
      and current_version_id is distinct from v_version_id;
end;
$$;
