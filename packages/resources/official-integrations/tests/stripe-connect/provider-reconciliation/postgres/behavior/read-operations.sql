select provider_reconciliation_test.cleanup();

do $fixture$
declare
    v_payment_id bigint;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('operation-read');
    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, status,
        request, created_at, updated_at
    ) values
        (v_payment_id, 'provider-reconciliation-pg-operation-read-old',
            'refund_create', 'reserved', '{"currency":"eur"}'::jsonb,
            '2026-07-21 08:00:00+00', '2026-07-21 08:00:00+00'),
        (v_payment_id, 'provider-reconciliation-pg-operation-read-payment',
            'refund_create', 'reserved', '{}'::jsonb,
            '2026-07-21 08:01:00+00', '2026-07-21 09:00:00+00'),
        (null, 'provider-reconciliation-pg-operation-read-platform',
            'payout_schedule_update', 'reserved', '{"scope":"platform"}'::jsonb,
            '2026-07-21 08:02:00+00', '2026-07-21 10:00:00+00');
end;
$fixture$;

create temporary table provider_reconciliation_operation_results (
    position bigint generated always as identity,
    operation jsonb not null,
    client_reference_id text,
    payment_currency text
);
insert into provider_reconciliation_operation_results (
    operation, client_reference_id, payment_currency
)
select * from stripe_connect.read_reconciliation_operations(2);

do $contract$
declare
    v_keys text[];
begin
    select pg_catalog.array_agg(operation->>'business_key' order by position)
    into v_keys
    from provider_reconciliation_operation_results;
    if v_keys <> array[
        'provider-reconciliation-pg-operation-read-platform',
        'provider-reconciliation-pg-operation-read-payment'
    ] then
        raise exception 'provider reconciliation: operation read order or limit changed: %',
            v_keys;
    end if;
    if exists (
        select 1
        from provider_reconciliation_operation_results result
        join stripe_connect.financial_operations operation
            on operation.id = (result.operation->>'id')::bigint
        where result.operation is distinct from pg_catalog.to_jsonb(operation)
    ) or not exists (
        select 1
        from provider_reconciliation_operation_results
        where position = 1
          and client_reference_id is null
          and payment_currency is null
    ) or not exists (
        select 1
        from provider_reconciliation_operation_results
        where position = 2
          and client_reference_id = 'provider-reconciliation-pg-operation-read'
          and payment_currency = 'eur'
    ) then
        raise exception 'provider reconciliation: operation payment context changed';
    end if;
    if (select pg_catalog.count(*)
        from stripe_connect.read_reconciliation_operations(1)) <> 1 then
        raise exception 'provider reconciliation: operation read minimum limit changed';
    end if;
end;
$contract$;

drop table provider_reconciliation_operation_results;
select provider_reconciliation_test.cleanup();
