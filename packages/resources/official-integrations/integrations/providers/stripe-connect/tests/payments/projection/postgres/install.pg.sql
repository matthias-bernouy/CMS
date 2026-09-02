\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled temporary SQL bundle.'
    \quit 3
\endif

-- Explicit opt-in: this contract destroys and recreates stripe_connect.
\if :{?allow_payment_projection_schema_reset}
\else
    \echo 'Set allow_payment_projection_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_payment_projection_schema_reset
\else
    \echo 'allow_payment_projection_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists stripe_connect cascade;
\ir :cms_integration_schema_bundle

create temporary table payment_projection_install_fingerprint
on commit preserve rows
as
select
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    procedure.proacl::text as acl,
    procedure.proconfig::text as configuration,
    procedure.prosecdef as security_definer
from pg_catalog.pg_proc procedure
where procedure.oid = pg_catalog.to_regprocedure(
    'stripe_connect.apply_payment_provider_projection(bigint,jsonb,jsonb)'
);

do $fresh_install$
begin
    if (select pg_catalog.count(*)
        from payment_projection_install_fingerprint) <> 1 then
        raise exception 'payment projection: fresh install omitted RPC';
    end if;
end;
$fresh_install$;

\ir :cms_integration_schema_bundle

do $reapply$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.apply_payment_provider_projection(bigint,jsonb,jsonb)'
    );
begin
    if target is null or not exists (
        select 1
        from payment_projection_install_fingerprint fingerprint
        join pg_catalog.pg_proc procedure on procedure.oid = target
        where fingerprint.definition = pg_catalog.pg_get_functiondef(target)
          and fingerprint.acl is not distinct from procedure.proacl::text
          and fingerprint.configuration is not distinct from procedure.proconfig::text
          and fingerprint.security_definer is not distinct from procedure.prosecdef
    ) then
        raise exception 'payment projection: schema reapply changed RPC';
    end if;
end;
$reapply$;

drop table payment_projection_install_fingerprint;
