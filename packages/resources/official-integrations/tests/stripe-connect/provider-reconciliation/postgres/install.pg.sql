\set ON_ERROR_STOP on

-- Explicit opt-in: this contract destroys and recreates stripe_connect.
\if :{?allow_provider_reconciliation_schema_reset}
\else
    \echo 'Set allow_provider_reconciliation_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_provider_reconciliation_schema_reset
\else
    \echo 'allow_provider_reconciliation_schema_reset must be true.'
    \quit 3
\endif

drop schema if exists stripe_connect cascade;
\ir ../../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

create temporary table provider_reconciliation_install_fingerprint
on commit preserve rows
as
select
    procedure.oid::pg_catalog.regprocedure::text as signature,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    procedure.proacl::text as acl,
    procedure.proconfig::text as configuration,
    procedure.prosecdef as security_definer
from pg_catalog.pg_proc procedure
where procedure.oid in (
    pg_catalog.to_regprocedure(
        'stripe_connect.read_reconciliation_operations(integer)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_payment_reconciliation_ledger(bigint)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_payment_reconciliation_local_context(bigint)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_refund_projection_context(bigint)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_refund_preflight_context(bigint,text)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_settlement_release_context(bigint,text,text)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_settlement_release_ledger(bigint)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_transfer_reversal_completion_context(bigint)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_provider_transfer_reconciliation_context(text)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.read_financial_operation_recovery_context(bigint,bigint,text)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_intent(text,text,text)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_operation(bigint,text,text,jsonb)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.claim_commerce_projection_outbox(text,integer)'
    ),
    pg_catalog.to_regprocedure(
        'stripe_connect.claim_reconciliation_projection_batch(text,integer)'
    )
);

do $fresh_install$
begin
    if pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_operation(bigint,text,text,jsonb)'
    ) is null then
        raise exception 'provider reconciliation: fresh install omitted cancellation operation RPC';
    end if;
    if (select pg_catalog.count(*)
        from provider_reconciliation_install_fingerprint) <> 14 then
        raise exception 'provider reconciliation: fresh install omitted RPCs';
    end if;
end;
$fresh_install$;

\ir ../../../../integrations/providers/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql

do $reapply$
begin
    if exists (
        select 1
        from provider_reconciliation_install_fingerprint fingerprint
        left join pg_catalog.pg_proc procedure
            on procedure.oid = pg_catalog.to_regprocedure(fingerprint.signature)
        where procedure.oid is null
           or fingerprint.definition is distinct from pg_catalog.pg_get_functiondef(procedure.oid)
           or fingerprint.acl is distinct from procedure.proacl::text
           or fingerprint.configuration is distinct from procedure.proconfig::text
           or fingerprint.security_definer is distinct from procedure.prosecdef
    ) then
        raise exception 'provider reconciliation: schema reapply changed RPCs';
    end if;
end;
$reapply$;

drop table provider_reconciliation_install_fingerprint;
