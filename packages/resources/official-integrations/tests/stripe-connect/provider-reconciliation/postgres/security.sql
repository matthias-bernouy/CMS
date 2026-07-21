begin;

do $security$
declare
    target oid;
    contract record;
begin
    for contract in
        select * from (values
            ('stripe_connect.read_reconciliation_operations(integer)', 's', false),
            ('stripe_connect.read_payment_reconciliation_ledger(bigint)', 's', false),
            ('stripe_connect.read_provider_transfer_reconciliation_context(text)', 's', false),
            ('stripe_connect.read_financial_operation_recovery_context(bigint,bigint,text)', 's', false),
            ('stripe_connect.claim_commerce_projection_outbox(text,integer)', 'v', false),
            ('stripe_connect.claim_reconciliation_projection_batch(text,integer)', 'v', true)
        ) expected(signature, volatility, jit_disabled)
    loop
        target := pg_catalog.to_regprocedure(contract.signature);
        if target is null or exists (
            select 1
            from pg_catalog.pg_proc
            where oid = target
              and (
                  prosecdef
                  or provolatile::text <> contract.volatility
                  or not proretset
                  or proacl is null
                  or not coalesce(proconfig @> array['search_path=""'], false)
                  or (contract.jit_disabled
                      and not coalesce(proconfig @> array['jit=off'], false))
                  or exists (
                      select 1
                      from pg_catalog.aclexplode(proacl)
                      where grantee = 0 and privilege_type = 'EXECUTE'
                  )
              )
        ) then
            raise exception 'provider reconciliation: RPC security changed: %',
                contract.signature;
        end if;
        if pg_catalog.has_function_privilege('anon', target, 'execute')
           or pg_catalog.has_function_privilege('authenticated', target, 'execute')
           or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
            raise exception 'provider reconciliation: RPC grants changed: %',
                contract.signature;
        end if;
    end loop;
end;
$security$;

set local role anon;
do $anon$
begin
    perform * from stripe_connect.claim_commerce_projection_outbox('anon', 1);
    raise exception 'provider reconciliation: anon executed claim RPC';
exception when insufficient_privilege then
    null;
end;
$anon$;
do $anon_ledger$
begin
    perform * from stripe_connect.read_payment_reconciliation_ledger(-900000001);
    raise exception 'provider reconciliation: anon executed payment ledger RPC';
exception when insufficient_privilege then
    null;
end;
$anon_ledger$;
do $anon_transfer_context$
begin
    perform * from stripe_connect.read_provider_transfer_reconciliation_context(
        'tr_provider_reconciliation_missing'
    );
    raise exception 'provider reconciliation: anon executed transfer context RPC';
exception when insufficient_privilege then
    null;
end;
$anon_transfer_context$;
do $anon_operation_context$
begin
    perform * from stripe_connect.read_financial_operation_recovery_context(
        -900000001, -900000001, null
    );
    raise exception 'provider reconciliation: anon executed operation recovery context RPC';
exception when insufficient_privilege then
    null;
end;
$anon_operation_context$;
reset role;

set local role authenticated;
do $authenticated$
begin
    perform * from stripe_connect.claim_commerce_projection_outbox('authenticated', 1);
    raise exception 'provider reconciliation: authenticated executed claim RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated$;
do $authenticated_ledger$
begin
    perform * from stripe_connect.read_payment_reconciliation_ledger(-900000001);
    raise exception 'provider reconciliation: authenticated executed payment ledger RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated_ledger$;
do $authenticated_transfer_context$
begin
    perform * from stripe_connect.read_provider_transfer_reconciliation_context(
        'tr_provider_reconciliation_missing'
    );
    raise exception 'provider reconciliation: authenticated executed transfer context RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated_transfer_context$;
do $authenticated_operation_context$
begin
    perform * from stripe_connect.read_financial_operation_recovery_context(
        -900000001, -900000001, null
    );
    raise exception 'provider reconciliation: authenticated executed operation recovery context RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated_operation_context$;
reset role;

set local role service_role;
select pg_catalog.count(*)
from stripe_connect.claim_commerce_projection_outbox('service-role-contract', 1);
select pg_catalog.count(*)
from stripe_connect.read_reconciliation_operations(1);
select pg_catalog.count(*)
from stripe_connect.read_payment_reconciliation_ledger(-900000001);
select pg_catalog.count(*)
from stripe_connect.read_provider_transfer_reconciliation_context(
    'tr_provider_reconciliation_missing'
);
select pg_catalog.count(*)
from stripe_connect.read_financial_operation_recovery_context(
    -900000001, -900000001, null
);
select pg_catalog.count(*)
from stripe_connect.claim_reconciliation_projection_batch('service-role-batch-contract', 1);
reset role;

rollback;
