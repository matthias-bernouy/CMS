

create or replace function stripe_connect.mark_payment_manual_review(
    p_payment_id bigint,
    p_reason text,
    p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_payment stripe_connect.payments%rowtype; v_previous text;
begin
    if p_reason is null or length(btrim(p_reason)) = 0 then
        raise exception 'validation: manual review reason is required';
    end if;
    select * into v_payment from stripe_connect.payments where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;
    v_previous := v_payment.settlement_status;
    update stripe_connect.payments
    set settlement_status = 'manual_review', manual_review_reason = p_reason
    where id = p_payment_id returning * into v_payment;
    insert into stripe_connect.payment_events (
        payment_id, event_type, actor_kind, actor_id,
        previous_settlement_status, next_settlement_status, data
    ) values (
        p_payment_id, 'manual_review_required', 'system', 'stripe-connect',
        v_previous, 'manual_review', coalesce(p_details, '{}'::jsonb)
    );
    return to_jsonb(v_payment);
end;
$$;