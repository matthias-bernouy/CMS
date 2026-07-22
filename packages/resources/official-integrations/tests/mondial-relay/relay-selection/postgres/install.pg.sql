\set ON_ERROR_STOP on

\if :{?allow_relay_selection_schema_reset}
\else
    \echo 'Set allow_relay_selection_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_relay_selection_schema_reset
\else
    \echo 'allow_relay_selection_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists delivery cascade;
\ir ../../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql

create temporary table relay_selection_install_fingerprint
on commit preserve rows
as
select
    procedure.oid::regprocedure::text as signature,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    procedure.proacl::text as acl,
    procedure.proconfig::text as configuration,
    procedure.prosecdef as security_definer,
    procedure.provolatile as volatility
from pg_catalog.pg_proc procedure
where procedure.oid = pg_catalog.to_regprocedure(
    'delivery.read_relay_selection_context(text,text)'
);

do $fresh_install$
begin
    if (select pg_catalog.count(*) from relay_selection_install_fingerprint) <> 1 then
        raise exception 'relay selection: fresh install omitted the read context RPC';
    end if;
end;
$fresh_install$;

\ir ../../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql

do $reapply$
begin
    if exists (
        select 1
        from relay_selection_install_fingerprint fingerprint
        left join pg_catalog.pg_proc procedure
            on procedure.oid = pg_catalog.to_regprocedure(fingerprint.signature)
        where procedure.oid is null
           or fingerprint.definition is distinct from pg_catalog.pg_get_functiondef(procedure.oid)
           or fingerprint.acl is distinct from procedure.proacl::text
           or fingerprint.configuration is distinct from procedure.proconfig::text
           or fingerprint.security_definer is distinct from procedure.prosecdef
           or fingerprint.volatility is distinct from procedure.provolatile
    ) then
        raise exception 'relay selection: schema reapply changed the read context RPC';
    end if;
end;
$reapply$;

drop table relay_selection_install_fingerprint;
