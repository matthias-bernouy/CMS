\set ON_ERROR_STOP on
set statement_timeout = '15s';

\if :{?allow_consent_schema_reset}
\else
    \echo 'Set allow_consent_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_consent_schema_reset
\else
    \echo 'allow_consent_schema_reset must be true.'
    \quit 3
\endif
\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to the assembled Consent SQL bundle.'
    \quit 3
\endif

drop schema if exists consent cascade;
\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

set role service_role;

create temporary table consent_contract (
    key text primary key,
    value jsonb not null
) on commit preserve rows;

do $version_one$
declare
    v_page jsonb := jsonb_build_object(
        'id', 'page-cgu',
        'path', '/cgu',
        'title', 'Conditions générales',
        'description', 'Version une',
        'content', '<h1>CGU</h1><p>Version une.</p>'
    );
    v_documents jsonb;
    v_requirements jsonb;
begin
    v_documents := jsonb_build_array(jsonb_build_object(
        'key', 'terms',
        'enabled', true,
        'label', 'Conditions générales',
        'consentText', 'J’accepte les Conditions générales de Courtside.',
        'publishedSnapshotUrl',
            'https://cms.example.test/.cms/content/published-page-snapshot?id=page-cgu',
        'page', v_page,
        'contentHash', consent.published_page_hash(v_page)
    ));
    perform consent.sync_consent_context(
        'signup', true, 'https://cms.example.test', v_documents, 'contract'
    );
    v_requirements := consent.consent_requirements_projection('signup');
    if v_requirements->'documents'->0->>'consentPrefix' <> 'J’accepte les '
       or v_requirements->'documents'->0->>'consentSuffix' <> ' de Courtside.'
       or concat(
            v_requirements->'documents'->0->>'consentPrefix',
            v_requirements->'documents'->0->>'label',
            v_requirements->'documents'->0->>'consentSuffix'
       ) <> v_requirements->'documents'->0->>'consentText' then
        raise exception 'consent: projected copy no longer preserves the configured sentence';
    end if;
    insert into consent_contract values ('documents-v1', v_documents);
    insert into consent_contract values ('requirements-v1', v_requirements);
end;
$version_one$;

do $configured_order$
declare
    v_first_page jsonb := jsonb_build_object(
        'id', 'page-z', 'path', '/z', 'title', 'Z first',
        'description', '', 'content', '<p>Z first</p>'
    );
    v_second_page jsonb := jsonb_build_object(
        'id', 'page-a', 'path', '/a', 'title', 'A second',
        'description', '', 'content', '<p>A second</p>'
    );
    v_documents jsonb;
    v_keys text[];
begin
    v_documents := jsonb_build_array(
        jsonb_build_object(
            'key', 'z-first', 'label', 'Z first', 'consentText', 'Accept Z first',
            'publishedSnapshotUrl',
                'https://cms.example.test/.cms/content/published-page-snapshot?id=page-z',
            'page', v_first_page, 'contentHash', consent.published_page_hash(v_first_page)
        ),
        jsonb_build_object(
            'key', 'a-second', 'label', 'A second', 'consentText', 'Accept A second',
            'publishedSnapshotUrl',
                'https://cms.example.test/.cms/content/published-page-snapshot?id=page-a',
            'page', v_second_page, 'contentHash', consent.published_page_hash(v_second_page)
        )
    );
    perform consent.sync_consent_context(
        'ordered', true, 'https://cms.example.test', v_documents, 'contract'
    );
    select array_agg(value->>'documentKey' order by position)
    into v_keys
    from jsonb_array_elements(
        consent.consent_requirements_projection('ordered')->'documents'
    ) with ordinality entry(value, position);
    if v_keys <> array['z-first', 'a-second'] then
        raise exception 'consent: configured document order changed: %', v_keys;
    end if;
end;
$configured_order$;

do $invalid_copy$
declare
    v_documents jsonb;
begin
    select value into strict v_documents from consent_contract where key = 'documents-v1';
    begin
        perform consent.sync_consent_context(
            'signup', true, 'https://cms.example.test',
            jsonb_set(v_documents, '{0,consentText}', '"J’accepte ce document"'::jsonb),
            'contract'
        );
        raise exception 'consent: wording without its label was accepted';
    exception when others then
        if sqlerrm = 'consent: wording without its label was accepted'
           or sqlerrm <> 'validation: consentText must contain label' then raise; end if;
    end;
end;
$invalid_copy$;

do $first_acceptance$
declare
    v_requirements jsonb;
    v_version text;
    v_stage jsonb;
    v_commit jsonb;
    v_attempt uuid := '11111111-1111-4111-8111-111111111111';
begin
    select value into strict v_requirements from consent_contract where key = 'requirements-v1';
    v_version := v_requirements->'documents'->0->>'versionId';
    v_stage := consent.stage_consent_acceptance(
        'signup', v_attempt, repeat('a', 64), array[v_version]
    );
    if not (v_stage->>'staged')::boolean then
        raise exception 'consent: initial stage failed: %', v_stage;
    end if;
    if consent.stage_consent_acceptance(
        'signup', v_attempt, repeat('a', 64), array[v_version]
    ) <> v_stage then
        raise exception 'consent: exact stage retry is not idempotent';
    end if;
    v_commit := consent.commit_consent_acceptance(
        'signup', v_attempt, repeat('a', 64), array[v_version],
        'local:019fa294-cecb-7000-a735-ccd47ccb3739'
    );
    if not (v_commit->>'committed')::boolean
       or consent.commit_consent_acceptance(
            'signup', v_attempt, repeat('a', 64), array[v_version],
            'local:019fa294-cecb-7000-a735-ccd47ccb3739'
       )->>'acceptanceId' <> v_commit->>'acceptanceId' then
        raise exception 'consent: commit retry is not idempotent: %', v_commit;
    end if;
    if exists (
        select 1 from consent.acceptance_intents
        where context_key = 'signup' and attempt_id = v_attempt
    ) then
        raise exception 'consent: committed staging intent was not released';
    end if;
    insert into consent_contract values ('acceptance-v1', v_commit);
end;
$first_acceptance$;

do $stage_uses_materialized_projection$
declare
    v_version text;
    v_before tid;
    v_after tid;
    v_versions_before bigint;
    v_versions_after bigint;
begin
    select value->'documents'->0->>'versionId' into strict v_version
    from consent_contract where key = 'requirements-v1';
    select ctid into strict v_before
    from consent.documents where context_key = 'signup' and document_key = 'terms';
    select count(*) into v_versions_before
    from consent.document_versions where context_key = 'signup';
    perform consent.stage_consent_acceptance(
        'signup', '22222222-2222-4222-8222-222222222222', repeat('b', 64),
        array[v_version]
    );
    select ctid into strict v_after
    from consent.documents where context_key = 'signup' and document_key = 'terms';
    select count(*) into v_versions_after
    from consent.document_versions where context_key = 'signup';
    if v_after is distinct from v_before or v_versions_after <> v_versions_before then
        raise exception 'consent: staging changed the materialized projection';
    end if;
end;
$stage_uses_materialized_projection$;

do $live_rotation$
declare
    v_old text := (select value->'documents'->0->>'versionId'
        from consent_contract where key = 'requirements-v1');
    v_page jsonb := jsonb_build_object(
        'id', 'page-cgu',
        'path', '/cgu',
        'title', 'Conditions générales',
        'description', 'Version deux',
        'content', '<h1>CGU</h1><p>Version deux.</p>'
    );
    v_documents jsonb;
    v_stage jsonb;
    v_current jsonb;
    v_new text;
begin
    v_documents := jsonb_build_array(jsonb_build_object(
        'key', 'terms',
        'label', 'Conditions générales',
        'consentText', 'J’accepte les Conditions générales de Courtside.',
        'publishedSnapshotUrl',
            'https://cms.example.test/.cms/content/published-page-snapshot?id=page-cgu',
        'page', v_page,
        'contentHash', consent.published_page_hash(v_page)
    ));
    perform consent.refresh_consent_context('signup', v_documents, 'contract-refresh');
    v_current := consent.consent_requirements_projection('signup');
    v_new := v_current->'documents'->0->>'versionId';
    if v_new = v_old
       or (select count(*) from consent.document_versions where context_key = 'signup') <> 2
    then
        raise exception 'consent: explicit refresh did not rotate the materialized version: %', v_current;
    end if;
    v_stage := consent.stage_consent_acceptance(
        'signup', '22222222-2222-4222-8222-222222222222', repeat('b', 64),
        array[v_old]
    );
    if not (v_stage->>'staged')::boolean or (v_stage->>'requiredCount')::integer <> 1 then
        raise exception 'consent: exact pending retry did not survive rotation: %', v_stage;
    end if;
    v_stage := consent.stage_consent_acceptance(
        'signup', '11111111-1111-4111-8111-111111111111', repeat('a', 64),
        array[v_old]
    );
    if not (v_stage->>'staged')::boolean or (v_stage->>'requiredCount')::integer <> 1 then
        raise exception 'consent: exact committed retry did not survive rotation: %', v_stage;
    end if;
    v_stage := consent.stage_consent_acceptance(
        'signup', '33333333-3333-4333-8333-333333333333', repeat('c', 64),
        array[v_old]
    );
    if v_stage->>'state' <> 'version_changed'
       or exists (
           select 1 from consent.acceptance_intents
           where attempt_id = '33333333-3333-4333-8333-333333333333'
       ) then
        raise exception 'consent: stale first attempt was not rejected: %', v_stage;
    end if;
    perform consent.stage_consent_acceptance(
        'signup', '44444444-4444-4444-8444-444444444444', repeat('d', 64),
        array[v_new]
    );
end;
$live_rotation$;

do $provenance_and_safe_path$
declare
    v_before text := consent.consent_requirements_projection('signup')->'documents'->0->>'versionId';
    v_page jsonb := jsonb_build_object(
        'id', 'page-cgu',
        'path', '/cgu',
        'title', 'Conditions générales',
        'description', 'Version deux',
        'content', '<h1>CGU</h1><p>Version deux.</p>'
    );
    v_documents jsonb;
    v_after text;
begin
    v_documents := jsonb_build_array(jsonb_build_object(
        'key', 'terms',
        'label', 'Conditions générales',
        'consentText', 'J’accepte les Conditions générales de Courtside.',
        'publishedSnapshotUrl',
            'https://legal.example.test/.cms/content/published-page-snapshot?id=page-cgu',
        'page', v_page,
        'contentHash', consent.published_page_hash(v_page)
    ));
    perform consent.sync_consent_context(
        'signup', true, 'https://legal.example.test', v_documents, 'contract'
    );
    v_after := consent.consent_requirements_projection('signup')->'documents'->0->>'versionId';
    if v_after = v_before
       or not exists (
           select 1 from consent.document_versions
           where context_key = 'signup' and version_id = v_after
             and published_snapshot_url =
                'https://legal.example.test/.cms/content/published-page-snapshot?id=page-cgu'
       ) then
        raise exception 'consent: published snapshot provenance was not versioned';
    end if;

    begin
        perform consent.refresh_consent_context(
            'signup',
            jsonb_set(v_documents, '{0,page,path}', '"//evil.example/legal"'::jsonb),
            'contract'
        );
        raise exception 'consent: unsafe page path was accepted';
    exception when others then
        if sqlerrm = 'consent: unsafe page path was accepted'
           or sqlerrm <> 'conflict: CONSENT_DOCUMENT_NOT_AVAILABLE' then raise; end if;
    end;
end;
$provenance_and_safe_path$;

do $ephemeral_staging$
declare
    v_pruned integer;
begin
    insert into consent.acceptance_intents (
        context_key, attempt_id, subject_claim_hash, accepted_at, expires_at
    ) values (
        'signup', '55555555-5555-4555-8555-555555555555', repeat('e', 64),
        now() - interval '30 minutes', now() - interval '15 minutes'
    );
    v_pruned := consent.prune_expired_consent_intents('signup', 100);
    if v_pruned <> 1 then
        raise exception 'consent: expired staging evidence prune count changed: %', v_pruned;
    end if;
    if exists (
           select 1 from consent.acceptance_intents
           where attempt_id = '55555555-5555-4555-8555-555555555555'
    ) then
        raise exception 'consent: expired staging evidence was not pruned';
    end if;
    begin
        update consent.acceptance_intents set subject_claim_hash = repeat('e', 64)
        where attempt_id = '44444444-4444-4444-8444-444444444444';
        raise exception 'consent: staged claim was updated';
    exception when others then
        if sqlerrm = 'consent: staged claim was updated'
           or sqlerrm <> 'conflict: consent evidence is immutable' then raise; end if;
    end;
end;
$ephemeral_staging$;

do $runtime_policy_management$
declare
    v_before_revision text;
    v_published_revision text;
    v_disabled_revision text;
    v_before_current_version text;
    v_page jsonb := jsonb_build_object(
        'id', 'page-cgu',
        'path', '/cgu',
        'title', 'Conditions générales',
        'description', 'Runtime publication',
        'content', '<h1>CGU</h1><p>Runtime publication.</p>'
    );
    v_documents jsonb;
    v_result jsonb;
begin
    select context.xmin::text || ':' || context.ctid::text, document.current_version_id
    into strict v_before_revision, v_before_current_version
    from consent.contexts context
    join consent.documents document on document.context_key = context.context_key
    where context.context_key = 'signup' and document.document_key = 'terms';

    v_result := consent.bootstrap_consent_context('signup', 'installation-reload');
    if v_result->>'revision' <> v_before_revision
       or not (v_result->>'enabled')::boolean
       or (select current_version_id from consent.documents
           where context_key = 'signup' and document_key = 'terms')
          is distinct from v_before_current_version then
        raise exception 'consent: bootstrap changed existing runtime policy (revision %, version %): %',
            v_before_revision, v_before_current_version, v_result;
    end if;

    v_documents := jsonb_build_array(jsonb_build_object(
        'key', 'terms',
        'enabled', true,
        'label', 'Conditions générales',
        'consentText', 'J’accepte les Conditions générales de Courtside.',
        'publishedSnapshotUrl',
            'https://legal.example.test/.cms/content/published-page-snapshot?id=page-cgu',
        'page', v_page,
        'contentHash', consent.published_page_hash(v_page)
    ));
    v_result := consent.publish_consent_context(
        'signup', true, 'https://legal.example.test', v_documents,
        'admin-42', v_before_revision
    );
    v_published_revision := v_result->>'revision';
    if v_published_revision = v_before_revision
       or v_result->>'approvedSnapshotOrigin' <> 'https://legal.example.test'
       or (select configured_by from consent.contexts where context_key = 'signup') <> 'admin-42'
    then
        raise exception 'consent: runtime publication was not atomic: %', v_result;
    end if;

    begin
        perform consent.publish_consent_context(
            'signup', true, 'https://legal.example.test', v_documents,
            'stale-admin', v_before_revision
        );
        raise exception 'consent: stale runtime publication was accepted';
    exception when others then
        if sqlerrm = 'consent: stale runtime publication was accepted'
           or sqlerrm <> 'conflict: CONSENT_CONTEXT_REVISION_CHANGED' then raise; end if;
    end;

    v_before_current_version := v_result->'documents'->0->>'versionId';
    v_result := consent.disable_consent_context(
        'signup', 'admin-42', v_published_revision
    );
    v_disabled_revision := v_result->>'revision';
    if (v_result->>'enabled')::boolean
       or v_disabled_revision = v_published_revision
       or v_result->'documents'->0->>'versionId' is distinct from v_before_current_version then
        raise exception 'consent: disabling did not preserve immutable document state: %', v_result;
    end if;

    v_result := consent.bootstrap_consent_context('signup', 'second-installation-reload');
    if v_result->>'revision' <> v_disabled_revision
       or (v_result->>'enabled')::boolean then
        raise exception 'consent: repeated bootstrap changed disabled runtime policy: %', v_result;
    end if;
    if consent.list_consent_contexts()->>'total' is null then
        raise exception 'consent: runtime policy list projection is invalid';
    end if;
end;
$runtime_policy_management$;

reset role;

do $privacy_and_immutability$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'consent'
          and (column_name ilike '%email%' or column_name ilike '%password%')
    ) or exists (
        select 1 from consent.acceptance_intents
        where row_to_json(acceptance_intents)::text like '%person@example.test%'
           or row_to_json(acceptance_intents)::text like '%secret-password%'
    ) then
        raise exception 'consent: raw credentials entered the evidence model';
    end if;
    begin
        update consent.document_versions set page_title = 'mutated';
        raise exception 'consent: immutable version was updated';
    exception when others then
        if sqlerrm = 'consent: immutable version was updated'
           or sqlerrm <> 'conflict: consent evidence is immutable' then raise; end if;
    end;
    begin
        delete from consent.acceptances;
        raise exception 'consent: immutable acceptance was deleted';
    exception when others then
        if sqlerrm = 'consent: immutable acceptance was deleted'
           or sqlerrm <> 'conflict: consent evidence is immutable' then raise; end if;
    end;
end;
$privacy_and_immutability$;

do $security$
declare
    v_table text;
    v_function oid;
begin
    if not pg_catalog.has_table_privilege(
        'service_role', 'consent.acceptance_intents', 'SELECT, INSERT, UPDATE, DELETE'
    ) or pg_catalog.has_table_privilege(
        'service_role', 'consent.acceptances', 'UPDATE, DELETE'
    ) or pg_catalog.has_table_privilege(
        'service_role', 'consent.acceptance_documents', 'UPDATE, DELETE'
    ) then
        raise exception 'consent: evidence table grants changed';
    end if;
    foreach v_table in array array[
        'contexts', 'documents', 'document_versions', 'acceptance_intents',
        'acceptance_intent_documents', 'acceptances', 'acceptance_documents'
    ] loop
        if not exists (
            select 1 from pg_catalog.pg_class relation
            join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'consent' and relation.relname = v_table
              and relation.relrowsecurity and relation.relforcerowsecurity
        ) then raise exception 'consent: RLS changed for %', v_table; end if;
    end loop;
    foreach v_function in array array[
        pg_catalog.to_regprocedure('consent.sync_consent_context(text,boolean,text,jsonb,text)'),
        pg_catalog.to_regprocedure('consent.stage_consent_acceptance(text,uuid,text,text[])'),
        pg_catalog.to_regprocedure('consent.commit_consent_acceptance(text,uuid,text,text[],text)')
    ] loop
        if v_function is null
           or pg_catalog.has_function_privilege('anon', v_function, 'execute')
           or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
           or not pg_catalog.has_function_privilege('service_role', v_function, 'execute')
           or exists (
               select 1 from pg_catalog.pg_proc procedure,
                    lateral pg_catalog.aclexplode(procedure.proacl) privilege
               where procedure.oid = v_function and privilege.grantee = 0
                 and privilege.privilege_type = 'EXECUTE'
           ) then raise exception 'consent: RPC grants changed for %', v_function; end if;
    end loop;
end;
$security$;
