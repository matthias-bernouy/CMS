create or replace function consent.stage_consent_acceptance(
    p_context_key text,
    p_attempt_id uuid,
    p_subject_claim_hash text,
    p_accepted_version_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_requirements jsonb;
    v_required_ids text[];
    v_existing consent.acceptance_intents%rowtype;
    v_existing_ids text[];
    v_committed consent.acceptances%rowtype;
    v_committed_ids text[];
    v_inserted integer;
begin
    if p_attempt_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(
            'consent-attempt:' || p_context_key || ':' || p_attempt_id::text,
            0
        ));
    end if;
    if p_attempt_id is not null then
        select * into v_committed
        from consent.acceptances
        where context_key = p_context_key and attempt_id = p_attempt_id;
        if found then
            select coalesce(array_agg(version_id order by version_id), '{}'::text[])
            into v_committed_ids
            from consent.acceptance_documents
            where acceptance_id = v_committed.id;
            if cardinality(v_committed_ids) = 0
                or v_committed.subject_claim_hash is distinct from p_subject_claim_hash
                or coalesce(cardinality(p_accepted_version_ids), 0) <> cardinality(v_committed_ids)
                or (select count(distinct id) from unnest(p_accepted_version_ids) id)
                    <> cardinality(v_committed_ids)
                or exists (
                    select 1 from unnest(v_committed_ids) committed(id)
                    where not committed.id = any(p_accepted_version_ids)
                ) then
                raise exception 'conflict: consent attempt belongs to different evidence';
            end if;
            return jsonb_build_object(
                'staged', true,
                'attemptId', p_attempt_id::text,
                'requiredCount', cardinality(v_committed_ids)
            );
        end if;
    end if;

    if p_attempt_id is not null then
        select * into v_existing
        from consent.acceptance_intents
        where context_key = p_context_key and attempt_id = p_attempt_id
        for update;
        if found then
            select coalesce(array_agg(version_id order by version_id), '{}'::text[])
            into v_existing_ids
            from consent.acceptance_intent_documents
            where context_key = p_context_key and attempt_id = p_attempt_id;
            if cardinality(v_existing_ids) = 0
                or v_existing.subject_claim_hash is distinct from p_subject_claim_hash
                or v_existing.expires_at <= now()
                or coalesce(cardinality(p_accepted_version_ids), 0) <> cardinality(v_existing_ids)
                or (select count(distinct id) from unnest(p_accepted_version_ids) id)
                    <> cardinality(v_existing_ids)
                or exists (
                    select 1 from unnest(v_existing_ids) staged(id)
                    where not staged.id = any(p_accepted_version_ids)
                ) then
                raise exception 'conflict: consent attempt was already used with different evidence';
            end if;
            return jsonb_build_object(
                'staged', true,
                'attemptId', p_attempt_id::text,
                'requiredCount', cardinality(v_existing_ids)
            );
        end if;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('consent:' || p_context_key, 0));
    v_requirements := consent.consent_requirements_projection(p_context_key);
    if not coalesce((v_requirements->>'enabled')::boolean, false) then
        return jsonb_build_object(
            'staged', false,
            'attemptId', coalesce(p_attempt_id::text, ''),
            'requiredCount', 0
        );
    end if;
    perform consent.prune_expired_consent_intents(p_context_key, 100);
    if p_attempt_id is null or p_subject_claim_hash !~ '^[a-f0-9]{64}$' then
        raise exception 'validation: consent attempt and subject claim are required';
    end if;
    select coalesce(array_agg(value->>'versionId' order by value->>'versionId'), '{}'::text[])
    into v_required_ids
    from jsonb_array_elements(v_requirements->'documents');
    if cardinality(v_required_ids) = 0 then
        raise exception 'conflict: enabled consent has no materialized documents';
    end if;

    if coalesce(cardinality(p_accepted_version_ids), 0) <> cardinality(v_required_ids)
        or (select count(distinct id) from unnest(p_accepted_version_ids) id)
            <> cardinality(v_required_ids)
        or exists (
            select 1 from unnest(v_required_ids) required(id)
            where not required.id = any(p_accepted_version_ids)
        ) then
        return jsonb_build_object(
            'state', 'version_changed',
            'staged', false,
            'attemptId', p_attempt_id::text,
            'requiredCount', cardinality(v_required_ids)
        );
    end if;

    insert into consent.acceptance_intents (
        context_key, attempt_id, subject_claim_hash
    ) values (
        p_context_key, p_attempt_id, p_subject_claim_hash
    );
    insert into consent.acceptance_intent_documents (
        context_key, attempt_id, document_key, version_id, content_hash
    )
    select p_context_key, p_attempt_id, version.document_key,
        version.version_id, version.content_hash
    from consent.document_versions version
    where version.context_key = p_context_key
      and version.version_id = any(v_required_ids);
    get diagnostics v_inserted = row_count;
    if v_inserted <> cardinality(v_required_ids) then
        raise exception 'conflict: consent evidence could not be staged completely';
    end if;
    return jsonb_build_object(
        'staged', true,
        'attemptId', p_attempt_id::text,
        'requiredCount', cardinality(v_required_ids)
    );
end;
$$;
