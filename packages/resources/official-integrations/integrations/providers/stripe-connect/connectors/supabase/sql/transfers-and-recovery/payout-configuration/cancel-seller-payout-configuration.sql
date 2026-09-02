

create or replace function stripe_connect.cancel_seller_payout_configuration(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_superseded boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
    then
        raise exception 'Invalid seller payout configuration cancellation';
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
    update stripe_connect.accounts
       set payout_hold_claimed_by = case when v_superseded then p_owner else null end,
           payout_hold_claimed_at = case when v_superseded then now() else null end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;
    return jsonb_build_object('accepted', true, 'superseded', v_superseded, 'account', to_jsonb(v_account));
end;
$$;