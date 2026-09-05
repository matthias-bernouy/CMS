

create or replace function stripe_connect.complete_platform_payout_protection(
    p_owner text,
    p_expected_liability_revision bigint,
    p_applied_minimum_amount bigint,
    p_succeeded boolean,
    p_error text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control stripe_connect.platform_payout_controls%rowtype;
    v_needs_reapply boolean := false;
begin
    if p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_liability_revision is null
        or p_expected_liability_revision < 0
        or p_applied_minimum_amount is null
        or p_applied_minimum_amount < 0
        or p_applied_minimum_amount > 9007199254740991
        or p_succeeded is null
    then
        raise exception 'validation: invalid platform payout protection completion';
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
    if v_control.claim_owner is distinct from p_owner then
        return jsonb_build_object(
            'accepted', false,
            'needsReapply', false,
            'control', to_jsonb(v_control)
        );
    end if;

    if not p_succeeded then
        update stripe_connect.platform_payout_controls
        set claim_owner = null,
            claimed_at = null,
            last_error = nullif(btrim(coalesce(p_error, '')), ''),
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        return jsonb_build_object(
            'accepted', true,
            'needsReapply', false,
            'revisionChanged', v_control.liability_revision <> p_expected_liability_revision,
            'control', to_jsonb(v_control)
        );
    end if;

    v_needs_reapply := p_applied_minimum_amount < v_control.required_minimum_amount
        or (v_control.decrease_authorization_id is not null
            and p_applied_minimum_amount is distinct from v_control.required_minimum_amount);
    update stripe_connect.platform_payout_controls
    set provider_minimum_amount = p_applied_minimum_amount,
        decrease_authorization_id = case when v_needs_reapply
            then decrease_authorization_id else null end,
        claim_owner = case when v_needs_reapply then p_owner else null end,
        claimed_at = case when v_needs_reapply then now() else null end,
        last_error = null,
        last_provider_sync_at = now(),
        updated_at = now()
    where control_key = 'default'
    returning * into v_control;

    return jsonb_build_object(
        'accepted', true,
        'needsReapply', v_needs_reapply,
        'revisionChanged', v_control.liability_revision <> p_expected_liability_revision,
        'control', to_jsonb(v_control)
    );
end;
$$;
