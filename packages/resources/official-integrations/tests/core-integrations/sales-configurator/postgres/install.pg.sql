\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to the assembled Sales Configurator SQL bundle.'
    \quit 3
\endif

\if :{?allow_sales_configurator_schema_reset}
\else
    \echo 'Set allow_sales_configurator_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_sales_configurator_schema_reset
\else
    \echo 'allow_sales_configurator_schema_reset must be true.'
    \quit 3
\endif

do $roles$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

alter role service_role bypassrls;
drop schema if exists sales_configurator_test cascade;
drop schema if exists sales_configurator cascade;
\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

do $install$
begin
    if pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(bigint,bigint,bigint,bigint)'
    ) is null then
        raise exception 'sales configurator: revision-aware publish RPC is missing';
    end if;
    if pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(text,bigint,bigint,bigint)'
    ) is not null then
        raise exception 'sales configurator: stale publish RPC signature remains installed';
    end if;
end;
$install$;

create schema sales_configurator_test;
create table sales_configurator_test.results (
    name text primary key,
    body jsonb not null
);

create function sales_configurator_test.id(p_name text, p_path text[])
returns bigint
language sql
stable
set search_path = ''
as $$
    select (result.body #>> p_path)::bigint
    from sales_configurator_test.results result
    where result.name = p_name
$$;

create function sales_configurator_test.assert_true(
    p_condition boolean,
    p_message text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    if p_condition is distinct from true then
        raise exception 'sales configurator contract: %', p_message;
    end if;
end;
$$;

grant usage on schema sales_configurator_test to service_role;
grant select, insert, update on sales_configurator_test.results to service_role;
grant execute on all functions in schema sales_configurator_test to service_role;
