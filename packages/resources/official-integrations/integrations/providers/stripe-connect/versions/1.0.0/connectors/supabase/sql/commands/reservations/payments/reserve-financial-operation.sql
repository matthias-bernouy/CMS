

create or replace function stripe_connect.reserve_financial_operation(
    p_payment_id bigint,
    p_business_key text,
    p_operation_type text,
    p_request jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
    v_amount bigint;
    v_existing_amount bigint;
    v_reversed_amount bigint;
    v_seller_recovery_amount bigint;
    v_authorized_seller_amount bigint;
    v_unresolved_refund_count bigint;
begin
    if p_business_key is null or length(btrim(p_business_key)) = 0 then
        raise exception 'validation: business key is required';
    end if;
    if p_request is null or jsonb_typeof(p_request) <> 'object' then
        raise exception 'validation: operation request must be an object';
    end if;

    select * into v_payment from stripe_connect.payments where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;

    select * into v_operation
    from stripe_connect.financial_operations
    where business_key = p_business_key;
    if found then
        if v_operation.payment_id is distinct from p_payment_id
            or v_operation.operation_type is distinct from p_operation_type
            or v_operation.request is distinct from p_request then
            raise exception 'conflict: financial operation replay mismatch';
        end if;
        return to_jsonb(v_operation);
    end if;

    if p_operation_type = 'transfer_create' then
        if v_payment.payment_status <> 'succeeded'
            or v_payment.stripe_charge_id is null
            or v_payment.dispute_status not in ('none', 'won', 'prevented', 'warning_closed')
            or v_payment.settlement_status not in ('held', 'eligible', 'release_pending') then
            raise exception 'conflict: payment is not releasable';
        end if;
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfers
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'succeeded', 'partially_reversed', 'reversed');
        select coalesce(sum(amount), 0) into v_reversed_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status = 'succeeded';
        select coalesce(sum(seller_entitlement_reduction_amount), 0) into v_seller_recovery_amount
        from stripe_connect.refunds
        where payment_id = p_payment_id and status = 'succeeded';
        select count(*) into v_unresolved_refund_count
        from stripe_connect.refunds
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'pending', 'manual_review');
        v_authorized_seller_amount := v_payment.seller_transfer_amount - v_seller_recovery_amount;
        if v_unresolved_refund_count > 0 then
            raise exception 'conflict: unresolved refund blocks seller release';
        end if;
        if v_amount <= 0
            or v_existing_amount - v_reversed_amount + v_amount > v_authorized_seller_amount then
            raise exception 'conflict: transfer exceeds authorized seller amount';
        end if;
        update stripe_connect.payments set settlement_status = 'release_pending' where id = p_payment_id;
    elsif p_operation_type = 'transfer_reversal_create' then
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status in ('reserved', 'processing', 'succeeded');
        if v_amount <= 0 or v_existing_amount + v_amount > v_payment.transferred_amount then
            raise exception 'conflict: payment has no reversible transfer';
        end if;
        update stripe_connect.payments
        set settlement_status = 'reversal_pending'
        where id = p_payment_id
          and settlement_status not in ('blocked', 'manual_review', 'refund_pending');
    elsif p_operation_type = 'refund_create' then
        if v_payment.payment_status <> 'succeeded' or v_payment.stripe_charge_id is null then
            raise exception 'conflict: payment is not refundable';
        end if;
        select count(*) into v_unresolved_refund_count
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status in ('reserved', 'processing', 'manual_review');
        if v_unresolved_refund_count > 0 then
            raise exception 'conflict: another refund is awaiting terminal provider confirmation';
        end if;
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum((operation.request->>'amount')::bigint), 0) into v_existing_amount
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status <> 'failed';
        if v_amount <= 0 or v_existing_amount + v_amount > v_payment.amount_total then
            raise exception 'conflict: refund exceeds captured amount';
        end if;
        select coalesce(sum((operation.request->>'sellerEntitlementReductionAmount')::bigint), 0)
        into v_seller_recovery_amount
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status <> 'failed';
        v_seller_recovery_amount := v_seller_recovery_amount
            + coalesce((p_request->>'sellerEntitlementReductionAmount')::bigint, 0);
        v_authorized_seller_amount := v_payment.seller_transfer_amount - v_seller_recovery_amount;
        if v_authorized_seller_amount < 0
            or v_authorized_seller_amount is distinct from
                coalesce((p_request->>'authorizedSellerAmount')::bigint, -1) then
            raise exception 'conflict: refund seller entitlement target is stale or invalid';
        end if;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfers
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'succeeded', 'partially_reversed', 'reversed');
        select coalesce(sum(amount), 0) into v_reversed_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status = 'succeeded';
        if v_existing_amount - v_reversed_amount > v_authorized_seller_amount then
            raise exception 'conflict: required Transfer Reversal is not confirmed or a Transfer is in flight';
        end if;
        update stripe_connect.payments set settlement_status = 'refund_pending' where id = p_payment_id;
    end if;

    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, request
    ) values (
        p_payment_id, p_business_key, p_operation_type, p_request
    ) returning * into v_operation;

    return to_jsonb(v_operation);
end;
$$;