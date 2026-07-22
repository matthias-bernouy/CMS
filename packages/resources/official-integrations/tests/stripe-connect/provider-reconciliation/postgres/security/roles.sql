begin;
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
do $anon_payment_local_context$
begin
    perform * from stripe_connect.read_payment_reconciliation_local_context(-900000001);
    raise exception 'provider reconciliation: anon executed payment local context RPC';
exception when insufficient_privilege then
    null;
end;
$anon_payment_local_context$;
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
do $anon_reversal_completion$
begin
    perform * from stripe_connect.read_transfer_reversal_completion_context(-900000001);
    raise exception 'provider reconciliation: anon executed reversal completion RPC';
exception when insufficient_privilege then
    null;
end;
$anon_reversal_completion$;
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
do $authenticated_payment_local_context$
begin
    perform * from stripe_connect.read_payment_reconciliation_local_context(-900000001);
    raise exception 'provider reconciliation: authenticated executed payment local context RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated_payment_local_context$;
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
do $authenticated_reversal_completion$
begin
    perform * from stripe_connect.read_transfer_reversal_completion_context(-900000001);
    raise exception 'provider reconciliation: authenticated executed reversal completion RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated_reversal_completion$;
reset role;

set local role service_role;
select pg_catalog.count(*)
from stripe_connect.claim_commerce_projection_outbox('service-role-contract', 1);
select pg_catalog.count(*)
from stripe_connect.read_reconciliation_operations(1);
select pg_catalog.count(*)
from stripe_connect.read_payment_reconciliation_ledger(-900000001);
select pg_catalog.count(*)
from stripe_connect.read_payment_reconciliation_local_context(-900000001);
select pg_catalog.count(*)
from stripe_connect.read_refund_projection_context(-900000001);
select pg_catalog.count(*)
from stripe_connect.read_refund_preflight_context(
    -900000001,
    'provider-reconciliation-pg-missing-refund'
);
select pg_catalog.count(*)
from stripe_connect.read_settlement_release_context(
    -900000001,
    'provider-reconciliation-pg-missing-seller',
    'provider-reconciliation-pg-missing-authorization'
);
select pg_catalog.count(*)
from stripe_connect.read_settlement_release_ledger(-900000001);
select pg_catalog.count(*)
from stripe_connect.read_transfer_reversal_completion_context(-900000001);
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
