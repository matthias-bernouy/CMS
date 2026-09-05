

drop function if exists stripe_connect.finalize_seller_payout_configuration(text, text, bigint, text, boolean);
drop function if exists stripe_connect.finalize_seller_payout_configuration(text, text, bigint, text);

create function stripe_connect.finalize_seller_payout_configuration(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint,
    p_interval text,
    p_clear_ambiguous_recovery_hold boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_superseded boolean;
    v_clear_ambiguous_recovery_hold boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
        or p_interval not in ('manual', 'daily', 'weekly', 'monthly')
        or p_clear_ambiguous_recovery_hold is null
    then
        raise exception 'Invalid seller payout configuration finalization';
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
    if v_account.payout_hold_claimed_by is distinct from p_owner then
        return jsonb_build_object('accepted', false, 'superseded', true, 'account', to_jsonb(v_account));
    end if;

    v_superseded := v_account.risk_revision <> p_expected_risk_revision
        or v_account.outstanding_debt_amount + v_account.financial_exposure_amount > 0;
    if v_superseded then
        update stripe_connect.accounts
           set payout_hold_claimed_at = now(),
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        return jsonb_build_object('accepted', true, 'superseded', true, 'account', to_jsonb(v_account));
    end if;

    v_clear_ambiguous_recovery_hold := p_clear_ambiguous_recovery_hold
        and v_account.risk_status = 'manual_review'
        and v_account.financial_hold_reason = 'Seller recovery payout hold is not confirmed'
        and v_account.outstanding_debt_amount = 0
        and v_account.financial_exposure_amount = 0;

    update stripe_connect.accounts
       set payout_schedule = p_interval,
           risk_status = case
               when v_clear_ambiguous_recovery_hold then 'standard'
               else risk_status
           end,
           financial_hold_reason = case
               when v_clear_ambiguous_recovery_hold then null
               else financial_hold_reason
           end,
           payout_blocked_at = case
               when v_clear_ambiguous_recovery_hold then null
               else payout_blocked_at
           end,
           last_provider_sync_at = now(),
           payout_hold_claimed_by = null,
           payout_hold_claimed_at = null,
           manual_payout_hold_started_at = null,
           manual_payout_hold_alert_at = null,
           manual_payout_hold_deadline_at = null,
           manual_payout_hold_restore_settings = null,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;
    return jsonb_build_object('accepted', true, 'superseded', false, 'account', to_jsonb(v_account));
end;
$$;
