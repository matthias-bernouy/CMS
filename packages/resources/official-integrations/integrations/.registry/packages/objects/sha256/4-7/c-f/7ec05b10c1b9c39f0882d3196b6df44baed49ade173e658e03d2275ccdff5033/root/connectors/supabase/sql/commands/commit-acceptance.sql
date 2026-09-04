create or replace function consent.commit_consent_acceptance(
    p_context_key text,
    p_attempt_id uuid,
    p_subject_claim_hash text,
    p_accepted_version_ids text[],
    p_cms_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_context_enabled boolean;
    v_intent consent.acceptance_intents%rowtype;
    v_intent_ids text[];
    v_acceptance consent.acceptances%rowtype;
    v_acceptance_ids text[];
    v_copied integer;
begin
    if length(btrim(coalesce(p_cms_user_id, ''))) not between 1 and 512 then
        raise exception 'validation: CMS subject id is required';
    end if;
    select enabled into v_context_enabled
    from consent.contexts
    where context_key = p_context_key;
    if not found then
        raise exception 'not_found: consent context';
    end if;
    if p_attempt_id is null then
        if not v_context_enabled then
            return jsonb_build_object(
                'committed', false,
                'acceptanceId', null,
                'cmsUserId', p_cms_user_id,
                'acceptedAt', null
            );
        end if;
        raise exception 'validation: consent attempt is required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        'consent-attempt:' || p_context_key || ':' || p_attempt_id::text,
        0
    ));
    if coalesce(p_subject_claim_hash, '') !~ '^[a-f0-9]{64}$' then
        raise exception 'validation: consent subject claim is required';
    end if;

    select * into v_acceptance
    from consent.acceptances
    where context_key = p_context_key and attempt_id = p_attempt_id;
    if found then
        select coalesce(array_agg(version_id order by version_id), '{}'::text[])
        into v_acceptance_ids
        from consent.acceptance_documents
        where acceptance_id = v_acceptance.id;
        if cardinality(v_acceptance_ids) = 0
            or v_acceptance.cms_user_id <> p_cms_user_id
            or v_acceptance.subject_claim_hash <> p_subject_claim_hash
            or coalesce(cardinality(p_accepted_version_ids), 0) <> cardinality(v_acceptance_ids)
            or (select count(distinct id) from unnest(p_accepted_version_ids) id)
                <> cardinality(v_acceptance_ids)
            or exists (
                select 1 from unnest(v_acceptance_ids) accepted(id)
                where not accepted.id = any(p_accepted_version_ids)
            ) then
            raise exception 'conflict: consent attempt belongs to another subject or evidence';
        end if;
        return jsonb_build_object(
            'committed', true,
            'acceptanceId', v_acceptance.id::text,
            'cmsUserId', v_acceptance.cms_user_id,
            'acceptedAt', v_acceptance.accepted_at
        );
    end if;

    select * into v_intent
    from consent.acceptance_intents
    where context_key = p_context_key and attempt_id = p_attempt_id
    for update;
    if not found then
        if not v_context_enabled then
            return jsonb_build_object(
                'committed', false,
                'acceptanceId', null,
                'cmsUserId', p_cms_user_id,
                'acceptedAt', null
            );
        end if;
        raise exception 'conflict: consent attempt was not staged';
    end if;
    if v_intent.expires_at <= now()
        or v_intent.subject_claim_hash is distinct from p_subject_claim_hash then
        raise exception 'conflict: consent attempt is invalid or expired';
    end if;
    select coalesce(array_agg(version_id order by version_id), '{}'::text[])
    into v_intent_ids
    from consent.acceptance_intent_documents
    where context_key = p_context_key and attempt_id = p_attempt_id;
    if cardinality(v_intent_ids) = 0
        or coalesce(cardinality(p_accepted_version_ids), 0) <> cardinality(v_intent_ids)
        or (select count(distinct id) from unnest(p_accepted_version_ids) id)
            <> cardinality(v_intent_ids)
        or exists (
            select 1 from unnest(v_intent_ids) required(id)
            where not required.id = any(p_accepted_version_ids)
        ) then
        raise exception 'conflict: consent evidence differs from the staged attempt';
    end if;

    insert into consent.acceptances (
        context_key, attempt_id, cms_user_id, subject_claim_hash, accepted_at
    ) values (
        p_context_key, p_attempt_id, p_cms_user_id,
        p_subject_claim_hash, v_intent.accepted_at
    ) returning * into v_acceptance;
    insert into consent.acceptance_documents (
        acceptance_id, context_key, document_key, version_id, content_hash
    )
    select v_acceptance.id, context_key, document_key, version_id, content_hash
    from consent.acceptance_intent_documents
    where context_key = p_context_key and attempt_id = p_attempt_id;
    get diagnostics v_copied = row_count;
    if v_copied <> cardinality(v_intent_ids) then
        raise exception 'conflict: consent evidence could not be committed completely';
    end if;
    delete from consent.acceptance_intents
    where context_key = p_context_key and attempt_id = p_attempt_id;
    return jsonb_build_object(
        'committed', true,
        'acceptanceId', v_acceptance.id::text,
        'cmsUserId', v_acceptance.cms_user_id,
        'acceptedAt', v_acceptance.accepted_at
    );
end;
$$;
