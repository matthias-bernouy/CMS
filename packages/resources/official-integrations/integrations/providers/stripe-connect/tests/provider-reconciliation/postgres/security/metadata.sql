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
            ('stripe_connect.read_payment_reconciliation_local_context(bigint)', 's', false),
            ('stripe_connect.read_stripe_dispute_application_context(text,text)', 'v', false),
            ('stripe_connect.read_refund_projection_context(bigint)', 'v', false),
            ('stripe_connect.read_refund_preflight_context(bigint,text)', 'v', false),
            ('stripe_connect.read_settlement_release_context(bigint,text,text)', 'v', false),
            ('stripe_connect.read_settlement_release_ledger(bigint)', 'v', false),
            ('stripe_connect.read_transfer_reversal_completion_context(bigint)', 'v', false),
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

rollback;
