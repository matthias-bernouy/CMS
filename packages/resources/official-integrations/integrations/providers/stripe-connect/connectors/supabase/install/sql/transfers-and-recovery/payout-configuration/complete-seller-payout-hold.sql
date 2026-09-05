

drop function if exists stripe_connect.complete_seller_payout_hold(text, text, bigint, bigint, boolean, text);
drop function if exists stripe_connect.complete_seller_payout_hold(text, text, bigint, bigint, boolean, text, jsonb);

create function stripe_connect.complete_seller_payout_hold(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint,
    p_applied_minimum_amount bigint,
    p_succeeded boolean,
    p_error text default null,
    p_restore_settings jsonb default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_required_hold bigint;
    v_needs_reapply boolean := false;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
        or p_applied_minimum_amount is null or p_applied_minimum_amount < 0
        or p_applied_minimum_amount > 9007199254740991
        or p_succeeded is null
        or (p_succeeded and jsonb_typeof(p_restore_settings) is distinct from 'object')
    then
        raise exception 'Invalid seller payout hold completion';
    end if;
    if p_succeeded and (
        coalesce(p_restore_settings->>'interval', '') not in ('manual', 'daily', 'weekly', 'monthly')
        or coalesce((p_restore_settings->>'minimumBalanceEur')::bigint, -1) < 0
        or exists (
            select 1
            from jsonb_object_keys(p_restore_settings) as setting(key)
            where setting.key not in (
                'interval', 'weeklyPayoutDays', 'monthlyPayoutDays', 'minimumBalanceEur',
                'delayDaysOverride', 'debitNegativeBalances'
            )
        )
    ) then
        raise exception 'Invalid seller payout hold restoration settings';
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
        return jsonb_build_object('accepted', false, 'needsReapply', false, 'account', to_jsonb(v_account));
    end if;

    v_required_hold := v_account.outstanding_debt_amount + v_account.financial_exposure_amount;
    if not p_succeeded then
        update stripe_connect.accounts
           set risk_status = 'manual_review',
               financial_hold_reason = 'Seller recovery payout hold is not confirmed',
               payout_blocked_at = coalesce(payout_blocked_at, now()),
               payout_hold_claimed_by = null,
               payout_hold_claimed_at = null,
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        return jsonb_build_object('accepted', true, 'needsReapply', false, 'account', to_jsonb(v_account));
    end if;

    v_needs_reapply := v_required_hold > p_applied_minimum_amount;
    update stripe_connect.accounts
       set provider_hold_minimum_amount = greatest(provider_hold_minimum_amount, p_applied_minimum_amount),
           payout_schedule = 'manual',
           manual_payout_hold_started_at = coalesce(manual_payout_hold_started_at, now()),
           manual_payout_hold_alert_at = coalesce(
               manual_payout_hold_alert_at,
               coalesce(manual_payout_hold_started_at, now()) + interval '75 days'
           ),
           manual_payout_hold_deadline_at = coalesce(
               manual_payout_hold_deadline_at,
               coalesce(manual_payout_hold_started_at, now()) + interval '90 days'
           ),
           manual_payout_hold_restore_settings = coalesce(
               manual_payout_hold_restore_settings,
               p_restore_settings
           ),
           last_provider_sync_at = now(),
           payout_hold_claimed_by = case when v_needs_reapply then p_owner else null end,
           payout_hold_claimed_at = case when v_needs_reapply then now() else null end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;

    return jsonb_build_object(
        'accepted', true,
        'needsReapply', v_needs_reapply,
        'revisionChanged', v_account.risk_revision <> p_expected_risk_revision,
        'account', to_jsonb(v_account)
    );
end;
$$;
