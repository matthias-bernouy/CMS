-- Refund preflight keeps request-id precedence and a later payment snapshot.
select provider_reconciliation_test.cleanup();

do $refund_preflight_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'refund-preflight-context'
    );
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment(
        'refund-preflight-context-other'
    );
    v_succeeded_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'refund-preflight-succeeded', 'refund_create'
    );
    v_status_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'refund-preflight-status', 'refund_create'
    );
    v_ignored_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'refund-preflight-ignored', 'refund_create'
    );
    v_other_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_other_payment_id, 'refund-preflight-other', 'refund_create'
    );
    v_context record;
    v_status text;
begin
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_charge_id,
        amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status
    ) values
        (
            v_payment_id, v_succeeded_operation_id,
            'provider-reconciliation-pg-refund-preflight-succeeded',
            'ch_provider_reconciliation_refund_preflight',
            100, 70, 1010, 'eur', 'succeeded'
        ),
        (
            v_payment_id, v_status_operation_id,
            'provider-reconciliation-pg-refund-preflight-status',
            'ch_provider_reconciliation_refund_preflight',
            100, 1000, 10, 'eur', 'reserved'
        ),
        (
            v_payment_id, v_ignored_operation_id,
            'provider-reconciliation-pg-refund-preflight-ignored',
            'ch_provider_reconciliation_refund_preflight',
            100, 1000, 10, 'eur', 'cancelled'
        ),
        (
            v_other_payment_id, v_other_operation_id,
            'provider-reconciliation-pg-refund-preflight-other',
            'ch_provider_reconciliation_refund_preflight_other',
            100, 1000, 10, 'eur', 'pending'
        );

    foreach v_status in array array[
        'reserved', 'processing', 'pending', 'manual_review'
    ] loop
        update stripe_connect.refunds set status = v_status
        where operation_id = v_status_operation_id;
        select * into strict v_context
        from stripe_connect.read_refund_preflight_context(
            v_payment_id, 'provider-reconciliation-pg-refund-preflight-absent'
        );
        if v_context.existing_refund is not null
           or not v_context.has_nonterminal
           or v_context.committed_reduction_amount <> 70 then
            raise exception 'provider reconciliation: refund preflight status changed: %',
                pg_catalog.to_jsonb(v_context);
        end if;
    end loop;

    update stripe_connect.refunds set status = 'failed'
    where operation_id = v_status_operation_id;
    select * into strict v_context
    from stripe_connect.read_refund_preflight_context(
        v_payment_id, 'provider-reconciliation-pg-refund-preflight-absent'
    );
    if v_context.existing_refund is not null
       or v_context.has_nonterminal
       or v_context.committed_reduction_amount <> 70 then
        raise exception 'provider reconciliation: refund preflight aggregate changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_refund_preflight_context(
        v_other_payment_id,
        'provider-reconciliation-pg-refund-preflight-succeeded'
    );
    if v_context.existing_refund ->> 'refund_request_id'
            <> 'provider-reconciliation-pg-refund-preflight-succeeded'
       or v_context.has_nonterminal
       or v_context.committed_reduction_amount <> 0 then
        raise exception 'provider reconciliation: refund preflight replay changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_refund_preflight_context(
        -900000001, 'provider-reconciliation-pg-refund-preflight-missing'
    );
    if v_context.existing_refund is not null
       or v_context.has_nonterminal
       or v_context.committed_reduction_amount <> 0 then
        raise exception 'provider reconciliation: missing refund preflight changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$refund_preflight_context$;

select provider_reconciliation_test.cleanup();
