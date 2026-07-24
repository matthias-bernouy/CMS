create or replace function commerce.buyer_legal_snapshot_refresh_required(
    p_documents jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_input jsonb;
    v_key text;
    v_expected_version_id uuid;
    v_document commerce.buyer_legal_documents%rowtype;
    v_current_hash text;
    v_refresh_required boolean := false;
begin
    for v_input in
        select value from jsonb_array_elements(p_documents)
    loop
        if jsonb_typeof(v_input) <> 'object' then
            raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
        end if;
        v_key := coalesce(v_input->>'key', '');
        if v_key !~ '^[a-z][a-z0-9_.-]{1,79}$'
            or coalesce(v_input->>'expectedVersionId', '') !~
                '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
            or coalesce(v_input->>'contentHash', '') !~ '^[a-f0-9]{64}$' then
            raise exception 'conflict: LEGAL_DOCUMENT_NOT_AVAILABLE';
        end if;
        v_expected_version_id := (v_input->>'expectedVersionId')::uuid;
        select * into v_document
        from commerce.buyer_legal_documents document
        where document.document_key = v_key;
        if not found
            or not v_document.enabled
            or v_document.current_version_id <> v_expected_version_id then
            raise exception 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED';
        end if;
        select version.content_hash into strict v_current_hash
        from commerce.buyer_legal_document_versions version
        where version.id = v_document.current_version_id
          and version.document_key = v_document.document_key;
        v_refresh_required := v_refresh_required
            or v_current_hash <> v_input->>'contentHash';
    end loop;
    return v_refresh_required;
end;
$$;
