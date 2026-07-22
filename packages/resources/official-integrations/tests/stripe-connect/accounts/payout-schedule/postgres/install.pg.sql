\set ON_ERROR_STOP on

-- Explicit opt-in: this contract destroys and recreates stripe_connect.
\if :{?allow_payout_schedule_schema_reset}
\else
    \echo 'Set allow_payout_schedule_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_payout_schedule_schema_reset
\else
    \echo 'allow_payout_schedule_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists stripe_connect cascade;
\ir ../../../../../integrations/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

create temporary table payout_schedule_install_fingerprint
on commit preserve rows
as
select
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    procedure.proacl::text as acl,
    procedure.proconfig::text as configuration,
    procedure.prosecdef as security_definer
from pg_catalog.pg_proc procedure
where procedure.oid = pg_catalog.to_regprocedure(
    'stripe_connect.claim_seller_payout_hold(text,text,boolean,boolean)'
);

do $fresh_install$
begin
    if (select pg_catalog.count(*) from payout_schedule_install_fingerprint) <> 1 then
        raise exception 'payout schedule: fresh install omitted claim RPC';
    end if;
end;
$fresh_install$;

\ir ../../../../../integrations/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

do $reapply$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.claim_seller_payout_hold(text,text,boolean,boolean)'
    );
begin
    if target is null
       or pg_catalog.to_regprocedure(
           'stripe_connect.claim_seller_payout_hold(text,text,boolean)'
       ) is not null
       or not exists (
           select 1
           from payout_schedule_install_fingerprint fingerprint
           join pg_catalog.pg_proc procedure on procedure.oid = target
           where fingerprint.definition = pg_catalog.pg_get_functiondef(target)
             and fingerprint.acl is not distinct from procedure.proacl::text
             and fingerprint.configuration is not distinct from procedure.proconfig::text
             and fingerprint.security_definer is not distinct from procedure.prosecdef
       ) then
        raise exception 'payout schedule: schema reapply changed claim RPC';
    end if;
end;
$reapply$;

drop table payout_schedule_install_fingerprint;
