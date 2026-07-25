create or replace function commerce.buyer_legal_required_versions(
    p_order_id bigint
)
returns table (
    document_key text,
    label text,
    consent_text text,
    page_path text,
    version_id uuid,
    content_hash text,
    version_date timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        document.document_key,
        version.label,
        version.consent_text,
        version.page_path,
        version.id,
        version.content_hash,
        version.materialized_at
    from commerce.buyer_legal_documents document
    join commerce.buyer_legal_document_versions version
      on version.id = document.current_version_id
    where document.enabled
      and (
          'buyer_checkout' = any(version.checkout_contexts)
          or 'protected_payment' = any(version.checkout_contexts)
          or commerce.buyer_legal_checkout_context(p_order_id)
             = any(version.checkout_contexts)
      )
    order by document.document_key;
$$;
