begin;

do $behavior$
declare
    v_connected text;
    v_disconnected text;
    v_risk text;
    v_result jsonb;
begin
    begin
        perform stripe_connect.claim_seller_payout_hold('', 'owner', false);
        raise exception 'payout schedule: blank seller was accepted';
    exception when others then
        if sqlerrm = 'payout schedule: blank seller was accepted'
           or sqlerrm <> 'Invalid seller payout hold claim' then
            raise;
        end if;
    end;

    begin
        perform stripe_connect.claim_seller_payout_hold(
            'payout-schedule-pg-absent', 'owner', false
        );
        raise exception 'payout schedule: missing seller was accepted';
    exception when others then
        if sqlerrm = 'payout schedule: missing seller was accepted'
           or sqlerrm <> 'Stripe Connect account not found' then
            raise;
        end if;
    end;

    v_connected := payout_schedule_test.seed('connected', true);
    v_result := payout_schedule_test.attempt(v_connected, 'owner-first');
    if v_result->>'claimed' <> 'true'
       or v_result->'account'->>'cms_user_id' <> v_connected
       or v_result->'account'->>'stripe_account_id' <> 'acct_payout_schedule_pg_connected'
       or v_result->'account'->>'payout_hold_claimed_by' <> 'owner-first'
       or not exists (
           select 1
           from stripe_connect.accounts
           where cms_user_id = v_connected
             and payout_hold_claimed_by = 'owner-first'
             and payout_hold_claimed_at is not null
       ) then
        raise exception 'payout schedule: first claim changed: %', v_result;
    end if;

    v_result := payout_schedule_test.attempt(v_connected, 'owner-second');
    if v_result->>'claimed' <> 'false'
       or v_result->'account'->>'payout_hold_claimed_by' <> 'owner-first' then
        raise exception 'payout schedule: collision changed: %', v_result;
    end if;

    v_disconnected := payout_schedule_test.seed('disconnected', false);
    v_result := payout_schedule_test.attempt(v_disconnected, 'owner-disconnected');
    if v_result->>'claimed' <> 'true'
       or jsonb_typeof(v_result->'account'->'stripe_account_id') <> 'null'
       or v_result->'account'->>'payout_hold_claimed_by' <> 'owner-disconnected' then
        raise exception 'payout schedule: generic disconnected claim changed: %', v_result;
    end if;

    v_risk := payout_schedule_test.seed('risk', true, 500);
    v_result := payout_schedule_test.attempt(v_risk, 'owner-risk-required', true);
    if v_result->>'claimed' <> 'true' then
        raise exception 'payout schedule: required risk claim changed: %', v_result;
    end if;

    v_result := payout_schedule_test.attempt(
        payout_schedule_test.seed('no-risk', true),
        'owner-no-risk',
        true
    );
    if v_result->>'claimed' <> 'false'
       or jsonb_typeof(v_result->'account') <> 'object' then
        raise exception 'payout schedule: no-risk refusal changed: %', v_result;
    end if;
end;
$behavior$;

rollback;
