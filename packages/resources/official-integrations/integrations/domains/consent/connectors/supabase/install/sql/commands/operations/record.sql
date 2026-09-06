create or replace function consent.record_operation_acceptance(
    p_context_key text,
    p_operation_key text,
    p_cms_user_id text,
    p_accepted_version_ids text[],
    p_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_receipt jsonb;
    v_stage jsonb;
    v_commit jsonb;
    v_attempt_id uuid := extensions.gen_random_uuid();
    v_claim_hash text;
    v_existing_ids text[];
begin
    if length(btrim(coalesce(p_operation_key, ''))) not between 1 and 512
        or length(btrim(coalesce(p_cms_user_id, ''))) not between 1 and 512
        or jsonb_typeof(p_metadata) is distinct from 'object'
        or octet_length(p_metadata::text) > 8192 then
        raise exception 'validation: invalid consent operation';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        'consent-operation:' || p_context_key || ':' || p_operation_key, 0
    ));
    v_receipt := consent.operation_acceptance_projection(
        p_context_key, p_operation_key, p_cms_user_id
    );
    if v_receipt is not null then
        if v_receipt->'metadata' <> p_metadata then
            raise exception 'conflict: consent operation metadata changed';
        end if;
        select coalesce(array_agg(value->>'versionId'), '{}'::text[])
        into v_existing_ids from jsonb_array_elements(v_receipt->'documents');
        if cardinality(coalesce(p_accepted_version_ids, '{}'::text[])) > 0 and (
            cardinality(p_accepted_version_ids) <> cardinality(v_existing_ids)
            or not p_accepted_version_ids @> v_existing_ids
        ) then
            raise exception 'conflict: CONSENT_DOCUMENT_VERSION_CHANGED';
        end if;
        return v_receipt;
    end if;
    v_claim_hash := encode(extensions.digest(
        'cms-consent-operation-v1:' || p_cms_user_id, 'sha256'
    ), 'hex');
    v_stage := consent.stage_consent_acceptance(
        p_context_key, v_attempt_id, v_claim_hash,
        coalesce(p_accepted_version_ids, '{}'::text[])
    );
    if v_stage->>'state' = 'version_changed' then
        raise exception 'conflict: CONSENT_DOCUMENT_VERSION_CHANGED';
    end if;
    if not (v_stage->>'staged')::boolean then
        return jsonb_build_object(
            'schemaVersion', 1,
            'required', false,
            'contextKey', p_context_key,
            'operationKey', p_operation_key,
            'cmsUserId', p_cms_user_id,
            'acceptanceId', null,
            'acceptedAt', null,
            'metadata', p_metadata,
            'documents', '[]'::jsonb
        );
    end if;
    v_commit := consent.commit_consent_acceptance(
        p_context_key, v_attempt_id, v_claim_hash,
        p_accepted_version_ids, p_cms_user_id
    );
    insert into consent.operation_acceptances (
        context_key, operation_key, acceptance_id, cms_user_id, metadata
    ) values (
        p_context_key, p_operation_key,
        (v_commit->>'acceptanceId')::uuid, p_cms_user_id, p_metadata
    );
    return consent.operation_acceptance_projection(
        p_context_key, p_operation_key, p_cms_user_id
    );
end;
$$;
