

drop function if exists stripe_connect.claim_seller_payout_hold(text, text);
drop function if exists stripe_connect.claim_seller_payout_hold(text, text, boolean);
drop function if exists stripe_connect.claim_seller_payout_hold(text, text, boolean, boolean);

create function stripe_connect.claim_seller_payout_hold(
    p_seller_cms_user_id text,
    p_owner text,
    p_require_risk boolean default true,
    p_require_connected_account boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_claimed boolean := false;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_require_risk is null
        or p_require_connected_account is null
    then
        raise exception 'Invalid seller payout hold claim';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );
    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        if p_require_connected_account then
            return jsonb_build_object(
                'claimed', false,
                'connectedAccountFound', false,
                'account', null
            );
        end if;
        raise exception 'Stripe Connect account not found';
    end if;
    if p_require_connected_account and v_account.stripe_account_id is null then
        return jsonb_build_object(
            'claimed', false,
            'connectedAccountFound', false,
            'account', null
        );
    end if;

    if (not p_require_risk
            or v_account.outstanding_debt_amount + v_account.financial_exposure_amount > 0)
        and (
            v_account.payout_hold_claimed_by is null
            or v_account.payout_hold_claimed_by = p_owner
            or v_account.payout_hold_claimed_at is null
            or v_account.payout_hold_claimed_at < now() - interval '15 minutes'
        )
    then
        update stripe_connect.accounts
           set payout_hold_claimed_by = p_owner,
               payout_hold_claimed_at = now(),
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        v_claimed := true;
    end if;

    return jsonb_build_object('claimed', v_claimed, 'account', to_jsonb(v_account));
end;
$$;
