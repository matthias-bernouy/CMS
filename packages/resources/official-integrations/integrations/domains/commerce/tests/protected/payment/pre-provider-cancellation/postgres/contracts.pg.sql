\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled Commerce SQL bundle.'
    \quit 3
\endif

\if :{?run_pre_provider_cancellation_contract}
\else
    \echo 'Set run_pre_provider_cancellation_contract=true to run this contract.'
    \quit 3
\endif

\if :{?allow_pre_provider_cancellation_schema_reset}
\else
    \echo 'Set allow_pre_provider_cancellation_schema_reset=true on a disposable database.'
    \quit 3
\endif

drop schema if exists commerce cascade;
drop schema if exists commerce_pre_provider_test cascade;

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
\ir fixture.sql

grant usage on schema commerce_pre_provider_test to service_role;
grant select, insert on commerce_pre_provider_test.cases to service_role;
grant execute on all functions in schema commerce_pre_provider_test to service_role;

begin;
set local role service_role;
\ir success.sql
\ir provider-possible-rejections.sql
rollback;
