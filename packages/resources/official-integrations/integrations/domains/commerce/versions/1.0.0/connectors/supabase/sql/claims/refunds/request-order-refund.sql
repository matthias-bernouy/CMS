

create or replace function commerce.request_order_refund(
    p_order_id bigint,
    p_reason text,
    p_requested_amount bigint,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_component commerce.fee_policy_components%rowtype;
    v_existing_amount bigint;
    v_existing_protection_refund bigint;
    v_existing_seller_recovery bigint;
    v_protection_refund bigint;
    v_seller_recovery bigint;
    v_remaining_non_fee bigint;
    v_request jsonb;
begin
    if p_actor_kind is distinct from 'admin' then
        raise exception 'forbidden: admin refund request actor is required';
    end if;
    select * into v_terms from commerce.order_financial_terms where order_id = p_order_id;
    if not found then raise exception 'conflict: refund requires immutable financial terms'; end if;
    select coalesce(sum(requested_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0),
        coalesce(sum(seller_recovery_amount), 0)
    into v_existing_amount, v_existing_protection_refund, v_existing_seller_recovery
    from commerce.refund_requests
    where order_id = p_order_id and status not in ('rejected', 'cancelled', 'failed');
    v_protection_refund := commerce.calculate_protection_fee_refund(
        p_order_id, p_requested_amount, 0
    );
    v_remaining_non_fee := greatest(
        0,
        v_terms.buyer_total_amount - v_terms.buyer_protection_fee_amount
            - (v_existing_amount - v_existing_protection_refund)
    );
    if p_requested_amount <= 0 or p_requested_amount > v_remaining_non_fee + v_protection_refund then
        raise exception 'validation: requested refund includes a non-refundable protection fee';
    end if;
    v_seller_recovery := least(
        p_requested_amount - v_protection_refund,
        greatest(0, v_terms.seller_proceeds_amount - v_existing_seller_recovery)
    );
    v_request := commerce.create_refund_request(
        p_order_id, null, null, p_reason, p_requested_amount,
        v_protection_refund, v_seller_recovery,
        p_actor_kind, p_actor_id, true
    );
    return v_request || jsonb_build_object(
        'refundAuthorization', commerce.refund_authorization_payload((v_request->>'id')::bigint)
    );
end;
$$;

create or replace function commerce.request_allocated_order_refund(
    p_order_id bigint,
    p_reason text,
    p_merchandise_refund_amount bigint,
    p_shipping_refund_amount bigint,
    p_protection_fee_refund_amount bigint,
    p_actor_kind text,
    p_actor_id text,
    p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_request jsonb;
    v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
    v_business_key text;
begin
    if p_actor_kind is distinct from 'admin' then
        raise exception 'forbidden: admin refund request actor is required';
    end if;
    if length(v_idempotency_key) not between 1 and 200 then
        raise exception 'validation: idempotency key is required and must not exceed 200 characters';
    end if;
    v_business_key := 'admin-order-refund:v1:' || p_order_id || ':' ||
        encode(extensions.digest(
            convert_to(v_idempotency_key, 'UTF8'),
            'sha256'
        ), 'hex');
    v_request := commerce.create_allocated_refund_request(
        p_order_id,
        null,
        v_business_key,
        p_reason,
        p_merchandise_refund_amount,
        p_shipping_refund_amount,
        p_protection_fee_refund_amount,
        p_actor_kind,
        p_actor_id,
        false
    );
    return v_request || jsonb_build_object(
        'refundAuthorization',
        commerce.refund_authorization_payload((v_request->>'id')::bigint)
    );
end;
$$;

-- Positional SQL callers from earlier releases retain their one-shot
-- behavior. The HTTP/source contract always uses the idempotent overload.
create or replace function commerce.request_allocated_order_refund(
    p_order_id bigint,
    p_reason text,
    p_merchandise_refund_amount bigint,
    p_shipping_refund_amount bigint,
    p_protection_fee_refund_amount bigint,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
    return commerce.request_allocated_order_refund(
        p_order_id,
        p_reason,
        p_merchandise_refund_amount,
        p_shipping_refund_amount,
        p_protection_fee_refund_amount,
        p_actor_kind,
        p_actor_id,
        gen_random_uuid()::text
    );
end;
$$;
