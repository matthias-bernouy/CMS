\set ON_ERROR_STOP on

-- Explicit opt-in: this contract destroys and recreates stripe_connect.
\if :{?allow_dispute_approval_schema_reset}
\else
    \echo 'Set allow_dispute_approval_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_dispute_approval_schema_reset
\else
    \echo 'allow_dispute_approval_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists stripe_connect cascade;
\ir ../../../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

create temporary table dispute_approval_install_fingerprint
on commit preserve rows
as
select
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    procedure.proacl::text as acl,
    procedure.proconfig::text as configuration,
    procedure.prosecdef as security_definer
from pg_catalog.pg_proc procedure
where procedure.oid = pg_catalog.to_regprocedure(
    'stripe_connect.authorize_irreversible_dispute_action(text,text,bigint,bigint,text,text,text)'
);

do $fresh_install$
begin
    if (select pg_catalog.count(*) from dispute_approval_install_fingerprint) <> 1 then
        raise exception 'dispute approval: fresh install omitted RPC';
    end if;
end;
$fresh_install$;

\ir ../../../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

do $reapply$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.authorize_irreversible_dispute_action(text,text,bigint,bigint,text,text,text)'
    );
begin
    if target is null or pg_catalog.to_regprocedure(
        'stripe_connect.authorize_irreversible_dispute_action(text,text,bigint,bigint,bigint,text,text,text)'
    ) is not null or not exists (
        select 1
        from dispute_approval_install_fingerprint fingerprint
        join pg_catalog.pg_proc procedure on procedure.oid = target
        where fingerprint.definition = pg_catalog.pg_get_functiondef(target)
          and fingerprint.acl is not distinct from procedure.proacl::text
          and fingerprint.configuration is not distinct from procedure.proconfig::text
          and fingerprint.security_definer is not distinct from procedure.prosecdef
    ) then
        raise exception 'dispute approval: schema reapply changed RPC';
    end if;
end;
$reapply$;

drop table dispute_approval_install_fingerprint;
