

create or replace function commerce.authorize_platform_payout_liability_decrease(
    p_expected_liability_revision bigint,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control commerce.platform_payout_liability_controls%rowtype;
begin
    if p_actor_id is null or length(btrim(p_actor_id)) = 0
        or p_reason is null or length(btrim(p_reason)) = 0 then
        raise exception 'validation: Admin actor and reason are required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
    );
    select * into v_control
    from commerce.platform_payout_liability_controls
    where control_key = 'default'
    for update;
    if v_control.liability_revision is distinct from p_expected_liability_revision then
        raise exception 'conflict: stale platform payout liability revision';
    end if;
    if v_control.required_minimum_amount >= v_control.last_provider_applied_amount then
        raise exception 'conflict: current platform payout liability is not a provider decrease';
    end if;
    if v_control.decrease_authorization_id is null then
        update commerce.platform_payout_liability_controls set
            change_direction = 'decrease',
            decrease_authorization_id = gen_random_uuid(),
            decrease_authorized_by = p_actor_id,
            decrease_authorized_reason = p_reason,
            decrease_authorized_at = now(),
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        update commerce.platform_payout_liability_revisions set
            decrease_authorization_id = v_control.decrease_authorization_id,
            decrease_authorized_by = p_actor_id,
            decrease_authorized_reason = p_reason,
            decrease_authorized_at = v_control.decrease_authorized_at
        where liability_revision = v_control.liability_revision;
    end if;
    perform commerce.append_financial_event(
        null, 'platform_payout_liability', v_control.liability_revision::text,
        'platform_payout_decrease_authorized', 'admin', p_actor_id, p_reason,
        jsonb_build_object('requiredMinimumAmount', v_control.required_minimum_amount,
            'previousProviderAmount', v_control.last_provider_applied_amount,
            'decreaseAuthorizationId', v_control.decrease_authorization_id),
        'commerce.platform_payout.decrease_authorized',
        'platform-payout-decrease:' || v_control.liability_revision
    );
    return commerce.refresh_platform_payout_liability(
        'Admin decrease authorization CAS confirmation', null
    );
end;
$$;