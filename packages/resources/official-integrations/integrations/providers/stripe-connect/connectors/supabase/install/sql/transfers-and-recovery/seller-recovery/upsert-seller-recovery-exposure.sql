

drop function if exists stripe_connect.upsert_seller_recovery_exposure_and_refresh(
    text, bigint, text, text, text, bigint, text, text, jsonb
);
create or replace function stripe_connect.upsert_seller_recovery_exposure_and_refresh(
    p_seller_cms_user_id text,
    p_payment_id bigint,
    p_recovery_key text,
    p_exposure_type text,
    p_status text,
    p_amount bigint,
    p_currency text,
    p_reason text,
    p_details jsonb default '{}'::jsonb,
    p_recovered_amount bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_payment stripe_connect.payments%rowtype;
    v_existing stripe_connect.seller_recovery_exposures%rowtype;
    v_exposure stripe_connect.seller_recovery_exposures%rowtype;
    v_next_status text;
    v_next_amount bigint;
    v_next_recovered_amount bigint;
    v_debt bigint;
    v_at_risk bigint;
    v_preserve_independent_risk boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_recovery_key is null or length(btrim(p_recovery_key)) = 0
        or p_payment_id is null or p_payment_id <= 0
        or p_amount is null or p_amount <= 0 or p_amount > 9007199254740991
        or p_recovered_amount is not null
            and (p_recovered_amount < 0 or p_recovered_amount > p_amount)
        or p_exposure_type not in ('chargeback', 'refund_recovery', 'reversal_failure')
        or p_status not in ('at_risk', 'debt', 'recovered')
        or p_currency <> 'eur'
        or p_reason is null or length(btrim(p_reason)) = 0
        or p_details is null or jsonb_typeof(p_details) <> 'object'
    then
        raise exception 'Invalid seller recovery exposure';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );

    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;

    select * into v_payment
      from stripe_connect.payments
     where id = p_payment_id;
    if not found
        or v_payment.seller_cms_user_id <> p_seller_cms_user_id
        or v_payment.currency <> p_currency
    then
        raise exception 'Seller recovery payment mismatch';
    end if;

    select * into v_existing
      from stripe_connect.seller_recovery_exposures
     where recovery_key = p_recovery_key
     for update;

    if found then
        if v_existing.seller_cms_user_id <> p_seller_cms_user_id
            or v_existing.payment_id <> p_payment_id
            or v_existing.currency <> p_currency
        then
            raise exception 'Seller recovery key replay mismatch';
        end if;
        v_next_status := case
            when v_existing.status in ('recovered', 'waived') then v_existing.status
            when v_existing.status = 'debt' and p_status = 'at_risk' then 'debt'
            else p_status
        end;
        v_next_amount := greatest(v_existing.amount, p_amount);
        v_next_recovered_amount := case
            when v_next_status in ('recovered', 'waived') then v_next_amount
            else least(
                v_next_amount,
                greatest(v_existing.recovered_amount, coalesce(p_recovered_amount, 0))
            )
        end;
        update stripe_connect.seller_recovery_exposures
           set exposure_type = case
                   when p_status = 'debt' then p_exposure_type
                   else exposure_type
               end,
               status = v_next_status,
               amount = v_next_amount,
               recovered_amount = v_next_recovered_amount,
               reason = p_reason,
               details = v_existing.details || p_details,
               updated_at = now()
         where id = v_existing.id
         returning * into v_exposure;
    else
        insert into stripe_connect.seller_recovery_exposures (
            seller_cms_user_id, payment_id, recovery_key, exposure_type, status,
            amount, recovered_amount, currency, reason, details
        ) values (
            p_seller_cms_user_id, p_payment_id, p_recovery_key, p_exposure_type, p_status,
            p_amount, case
                when p_status = 'recovered' then p_amount
                else coalesce(p_recovered_amount, 0)
            end,
            p_currency, p_reason, p_details
        )
        returning * into v_exposure;
    end if;

    select
        coalesce(sum(amount - recovered_amount) filter (where status = 'debt'), 0),
        coalesce(sum(amount - recovered_amount) filter (where status = 'at_risk'), 0)
      into v_debt, v_at_risk
      from stripe_connect.seller_recovery_exposures
     where seller_cms_user_id = p_seller_cms_user_id;

    v_preserve_independent_risk := v_account.risk_status <> 'standard'
        and coalesce(v_account.financial_hold_reason, '') not like 'Seller recovery%';

    update stripe_connect.accounts
       set outstanding_debt_amount = v_debt,
           financial_exposure_amount = v_at_risk,
           risk_revision = risk_revision + 1,
           risk_status = case
               when v_preserve_independent_risk then v_account.risk_status
               when v_debt > 0 then 'blocked'
               when v_at_risk > 0 then 'restricted'
               else 'standard'
           end,
           financial_hold_reason = case
               when v_preserve_independent_risk then v_account.financial_hold_reason
               when v_debt > 0 then 'Seller recovery debt blocks payments and payouts'
               when v_at_risk > 0 then 'Seller recovery exposure blocks payments and payouts'
               else null
           end,
           payout_blocked_at = case
               when v_debt > 0 or v_at_risk > 0 then coalesce(v_account.payout_blocked_at, now())
               else null
           end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;

    return jsonb_build_object('account', to_jsonb(v_account), 'exposure', to_jsonb(v_exposure));
end;
$$;
