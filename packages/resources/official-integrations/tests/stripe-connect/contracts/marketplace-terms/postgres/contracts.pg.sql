\set ON_ERROR_STOP on
-- Executed only against the explicitly confirmed disposable contract database.
set statement_timeout = '15s';

\if :{?run_marketplace_terms_install_contract}
\else
    \echo 'Set run_marketplace_terms_install_contract=true on a disposable database.'
    \quit 3
\endif
\if :run_marketplace_terms_install_contract
\else
    \echo 'run_marketplace_terms_install_contract must be true.'
    \quit 3
\endif
\if :{?allow_marketplace_terms_schema_reset}
\else
    \echo 'Set allow_marketplace_terms_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_marketplace_terms_schema_reset
\else
    \echo 'allow_marketplace_terms_schema_reset must be true.'
    \quit 3
\endif
\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled temporary SQL bundle.'
    \quit 3
\endif

drop schema if exists stripe_connect cascade;
\ir :cms_integration_schema_bundle

do $fresh_install$
begin
    if pg_catalog.to_regclass('stripe_connect.marketplace_terms_versions') is null
       or pg_catalog.to_regclass('stripe_connect.marketplace_terms_configuration') is null
       or pg_catalog.to_regprocedure(
           'stripe_connect.sync_marketplace_terms_configuration(jsonb,text,text,text)'
       ) is null
       or pg_catalog.to_regprocedure(
           'stripe_connect.record_current_marketplace_terms_acceptance(text,text,text)'
       ) is null then
        raise exception 'marketplace terms: fresh install omitted the evidence model';
    end if;
end;
$fresh_install$;

\ir :cms_integration_schema_bundle

do $reapply$
begin
    if pg_catalog.to_regprocedure(
           'stripe_connect.record_current_marketplace_terms_acceptance(text)'
       ) is not null
       or pg_catalog.to_regprocedure(
           'stripe_connect.record_current_marketplace_terms_acceptance(text,text,text)'
       ) is null then
        raise exception 'marketplace terms: schema reapply changed the CAS RPC';
    end if;
end;
$reapply$;

insert into stripe_connect.accounts (cms_user_id)
values ('marketplace-terms-pg-seller');

create temporary table marketplace_terms_proof (
    key text primary key,
    value jsonb not null
) on commit preserve rows;

insert into marketplace_terms_proof (key, value)
values (
    'first',
    stripe_connect.sync_marketplace_terms_configuration(
        jsonb_build_object(
            'documentKey', 'seller-conditions',
            'label', 'Conditions vendeur',
            'consentText', 'Je reconnais avoir lu et accepté les conditions vendeur.',
            'page', jsonb_build_object(
                'id', 'page-seller-terms',
                'path', '/conditions-vendeur',
                'title', 'Conditions vendeur',
                'description', 'Première version publiée',
                'content', '<h1>Conditions vendeur</h1><p>Première version.</p>'
            ),
            'publishedSnapshotUrl',
                'https://cms.example.test/.cms/content/published-page-snapshot?id=page-seller-terms',
            'contentHash', repeat('1', 64),
            'revisionHash', repeat('a', 64)
        ),
        null,
        null,
        'marketplace-terms-contract'
    )
);

do $first_revision$
declare
    v_configuration jsonb;
    v_acceptance jsonb;
begin
    select value into strict v_configuration
    from marketplace_terms_proof
    where key = 'first';
    if v_configuration->>'mode' <> 'published_page'
       or v_configuration->>'version' <> 'cms-page:' || repeat('a', 64)
       or v_configuration->>'hash' <> repeat('1', 64)
       or v_configuration->'page'->>'content'
            <> '<h1>Conditions vendeur</h1><p>Première version.</p>' then
        raise exception 'marketplace terms: published evidence projection changed: %',
            v_configuration;
    end if;

    begin
        perform stripe_connect.record_current_marketplace_terms_acceptance(
            'marketplace-terms-pg-seller',
            null,
            null
        );
        raise exception 'marketplace terms: page acceptance without displayed identity succeeded';
    exception when others then
        if sqlerrm = 'marketplace terms: page acceptance without displayed identity succeeded'
           or sqlerrm <> 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED' then
            raise;
        end if;
    end;

    v_acceptance := stripe_connect.record_current_marketplace_terms_acceptance(
        'marketplace-terms-pg-seller',
        v_configuration->>'version',
        v_configuration->>'hash'
    );
    if v_acceptance->>'terms_version_id' is null
       or not exists (
           select 1
           from stripe_connect.marketplace_terms_acceptances acceptance
           join stripe_connect.marketplace_terms_versions version
             on version.id = acceptance.terms_version_id
            and version.terms_version = acceptance.terms_version
            and version.content_hash = acceptance.terms_hash
           where acceptance.cms_user_id = 'marketplace-terms-pg-seller'
             and version.page_content = '<h1>Conditions vendeur</h1><p>Première version.</p>'
       ) then
        raise exception 'marketplace terms: acceptance is not bound to immutable evidence: %',
            v_acceptance;
    end if;
end;
$first_revision$;

insert into marketplace_terms_proof (key, value)
values (
    'second',
    stripe_connect.sync_marketplace_terms_configuration(
        jsonb_build_object(
            'documentKey', 'seller-conditions',
            'label', 'Conditions vendeur',
            'consentText', 'Je reconnais avoir lu et accepté les conditions vendeur.',
            'page', jsonb_build_object(
                'id', 'page-seller-terms',
                'path', '/conditions-vendeur',
                'title', 'Conditions vendeur',
                'description', 'Deuxième version publiée',
                'content', '<h1>Conditions vendeur</h1><p>Deuxième version.</p>'
            ),
            'publishedSnapshotUrl',
                'https://cms.example.test/.cms/content/published-page-snapshot?id=page-seller-terms',
            'contentHash', repeat('2', 64),
            'revisionHash', repeat('b', 64)
        ),
        null,
        null,
        'marketplace-terms-contract'
    )
);

do $revision_cas$
declare
    v_first jsonb;
    v_second jsonb;
    v_acceptance jsonb;
begin
    select value into strict v_first from marketplace_terms_proof where key = 'first';
    select value into strict v_second from marketplace_terms_proof where key = 'second';

    begin
        perform stripe_connect.record_current_marketplace_terms_acceptance(
            'marketplace-terms-pg-seller',
            v_first->>'version',
            v_first->>'hash'
        );
        raise exception 'marketplace terms: stale displayed revision succeeded';
    exception when others then
        if sqlerrm = 'marketplace terms: stale displayed revision succeeded'
           or sqlerrm <> 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED' then
            raise;
        end if;
    end;

    v_acceptance := stripe_connect.record_current_marketplace_terms_acceptance(
        'marketplace-terms-pg-seller',
        v_second->>'version',
        v_second->>'hash'
    );
    if v_acceptance->>'terms_version' <> v_second->>'version'
       or v_acceptance->>'terms_hash' <> v_second->>'hash'
       or (
           select marketplace_terms_version
           from stripe_connect.accounts
           where cms_user_id = 'marketplace-terms-pg-seller'
       ) <> v_second->>'version' then
        raise exception 'marketplace terms: current revision acceptance changed: %',
            v_acceptance;
    end if;
end;
$revision_cas$;

do $immutability$
begin
    begin
        update stripe_connect.marketplace_terms_versions
        set page_content = 'mutated';
        raise exception 'marketplace terms: immutable version was updated';
    exception when others then
        if sqlerrm = 'marketplace terms: immutable version was updated'
           or sqlerrm <> 'conflict: marketplace terms acceptance records are immutable' then
            raise;
        end if;
    end;

    begin
        delete from stripe_connect.marketplace_terms_acceptances
        where cms_user_id = 'marketplace-terms-pg-seller';
        raise exception 'marketplace terms: immutable acceptance was deleted';
    exception when others then
        if sqlerrm = 'marketplace terms: immutable acceptance was deleted'
           or sqlerrm <> 'conflict: marketplace terms acceptance records are immutable' then
            raise;
        end if;
    end;
end;
$immutability$;

do $legacy_compatibility$
declare
    v_configuration jsonb;
    v_acceptance jsonb;
begin
    v_configuration := stripe_connect.sync_marketplace_terms_configuration(
        null,
        '2026-07-25',
        repeat('f', 64),
        'marketplace-terms-contract'
    );
    v_acceptance := stripe_connect.record_current_marketplace_terms_acceptance(
        'marketplace-terms-pg-seller',
        null,
        null
    );
    if v_configuration->>'mode' <> 'legacy'
       or v_acceptance->>'terms_version' <> '2026-07-25'
       or v_acceptance->>'terms_hash' <> repeat('f', 64)
       or jsonb_typeof(v_acceptance->'terms_version_id') <> 'null' then
        raise exception 'marketplace terms: legacy rollout compatibility changed: %, %',
            v_configuration,
            v_acceptance;
    end if;
end;
$legacy_compatibility$;

do $security$
declare
    v_table_name text;
    v_function oid;
begin
    foreach v_table_name in array array[
        'marketplace_terms_versions',
        'marketplace_terms_configuration',
        'marketplace_terms_acceptances'
    ] loop
        if not exists (
            select 1
            from pg_catalog.pg_class relation
            join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'stripe_connect'
              and relation.relname = v_table_name
              and relation.relrowsecurity
              and relation.relforcerowsecurity
        ) then
            raise exception 'marketplace terms: RLS changed for %', v_table_name;
        end if;
    end loop;

    foreach v_function in array array[
        pg_catalog.to_regprocedure(
            'stripe_connect.sync_marketplace_terms_configuration(jsonb,text,text,text)'
        ),
        pg_catalog.to_regprocedure(
            'stripe_connect.get_current_marketplace_terms_configuration()'
        ),
        pg_catalog.to_regprocedure(
            'stripe_connect.record_current_marketplace_terms_acceptance(text,text,text)'
        )
    ] loop
        if v_function is null
           or pg_catalog.has_function_privilege('anon', v_function, 'execute')
           or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
           or not pg_catalog.has_function_privilege('service_role', v_function, 'execute')
           or exists (
               select 1
               from pg_catalog.pg_proc procedure,
                    lateral pg_catalog.aclexplode(procedure.proacl) privilege
               where procedure.oid = v_function
                 and privilege.grantee = 0
                 and privilege.privilege_type = 'EXECUTE'
           ) then
            raise exception 'marketplace terms: RPC grants changed for %', v_function;
        end if;
    end loop;
end;
$security$;

drop table marketplace_terms_proof;
