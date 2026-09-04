

drop function if exists stripe_connect.claim_platform_payout_protection(text, bigint);
create or replace function stripe_connect.claim_platform_payout_protection(
    p_owner text,
    p_required_minimum_amount bigint,
    p_liability_revision bigint,
    p_decrease_authorization_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control stripe_connect.platform_payout_controls%rowtype;
    v_claimed boolean := false;
begin
    if p_owner is null or length(btrim(p_owner)) = 0
        or p_required_minimum_amount is null
        or p_required_minimum_amount < 0
        or p_required_minimum_amount > 9007199254740991
        or p_liability_revision is null
        or p_liability_revision < 0
        or p_liability_revision > 9007199254740991
    then
        raise exception 'validation: invalid platform payout protection claim';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:platform_payout_control', 0)
    );
    select * into v_control
    from stripe_connect.platform_payout_controls
    where control_key = 'default'
    for update;
    if not found then
        raise exception 'configuration: platform payout control is unavailable';
    end if;

    if p_liability_revision < v_control.liability_revision then
        raise exception 'conflict: stale Commerce platform payout liability revision';
    end if;
    if p_liability_revision = v_control.liability_revision
        and p_required_minimum_amount is distinct from v_control.required_minimum_amount then
        raise exception 'conflict: Commerce platform payout liability revision changed amount';
    end if;
    if p_liability_revision > v_control.liability_revision then
        update stripe_connect.platform_payout_controls
        set required_minimum_amount = p_required_minimum_amount,
            liability_revision = p_liability_revision,
            decrease_authorization_id = case
                when p_required_minimum_amount < provider_minimum_amount
                    then p_decrease_authorization_id
                else null end,
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
    elsif p_required_minimum_amount < v_control.provider_minimum_amount
    then
        if v_control.decrease_authorization_id is null
            and p_decrease_authorization_id is not null then
            update stripe_connect.platform_payout_controls
            set decrease_authorization_id = p_decrease_authorization_id,
                updated_at = now()
            where control_key = 'default'
            returning * into v_control;
        elsif v_control.decrease_authorization_id is distinct from p_decrease_authorization_id then
            raise exception 'forbidden: exact Admin decrease authorization does not match Commerce authority';
        end if;
    end if;

    if v_control.claim_owner is null
        or v_control.claim_owner = p_owner
        or v_control.claimed_at < now() - interval '15 minutes'
    then
        update stripe_connect.platform_payout_controls
        set claim_owner = p_owner,
            claimed_at = now(),
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        v_claimed := true;
    end if;

    return jsonb_build_object('claimed', v_claimed, 'control', to_jsonb(v_control));
end;
$$;