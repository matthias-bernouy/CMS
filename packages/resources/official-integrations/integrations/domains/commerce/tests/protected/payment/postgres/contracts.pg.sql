\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled Commerce SQL bundle.'
    \quit 3
\endif

\if :{?run_buyer_legal_install_contract}
\else
    \echo 'Set run_buyer_legal_install_contract=true to run this contract.'
    \quit 3
\endif

\if :{?allow_buyer_legal_schema_reset}
\else
    \echo 'Set allow_buyer_legal_schema_reset=true on a disposable database.'
    \quit 3
\endif

drop schema if exists commerce cascade;
drop schema if exists commerce_buyer_legal_test cascade;

do $roles$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

-- Hosted Supabase grants the backend role access to installed extension functions.
grant usage on schema extensions to service_role;
grant execute on all functions in schema extensions to service_role;

\ir helpers.sql
\ir migration.sql

begin;
set local role service_role;

\ir fixture.sql
\ir behavior.sql
\ir negotiated.sql
\ir security.sql

rollback;
