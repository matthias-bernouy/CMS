

create or replace function commerce.apply_platform_payout_liability_total(
    p_required_amount bigint,
    p_calculation_reason text,
    p_included_prospective_order_id bigint default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_control commerce.platform_payout_liability_controls%rowtype;
    v_direction text;
begin
    if p_calculation_reason is null or length(btrim(p_calculation_reason)) = 0 then
        raise exception 'validation: platform payout liability calculation reason is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
    );
    select * into v_control
    from commerce.platform_payout_liability_controls
    where control_key = 'default'
    for update;
    if not found then
        raise exception 'configuration: platform payout liability control is unavailable';
    end if;
    v_direction := case
        when p_required_amount > v_control.last_provider_applied_amount then 'increase'
        when p_required_amount < v_control.last_provider_applied_amount then 'decrease'
        else 'unchanged'
    end;
    if p_required_amount is distinct from v_control.required_minimum_amount then
        update commerce.platform_payout_liability_controls set
            liability_revision = liability_revision + 1,
            previous_required_minimum_amount = required_minimum_amount,
            required_minimum_amount = p_required_amount,
            change_direction = v_direction,
            decrease_authorization_id = null,
            decrease_authorized_by = null,
            decrease_authorized_reason = null,
            decrease_authorized_at = null,
            calculated_at = now(), updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        insert into commerce.platform_payout_liability_revisions (
            liability_revision, required_minimum_amount,
            previous_required_minimum_amount, change_direction,
            calculation_reason, included_prospective_order_id
        ) values (
            v_control.liability_revision, v_control.required_minimum_amount,
            v_control.previous_required_minimum_amount, v_control.change_direction,
            p_calculation_reason, p_included_prospective_order_id
        );
    else
        update commerce.platform_payout_liability_controls set
            change_direction = v_direction,
            calculated_at = now(), updated_at = now()
        where control_key = 'default'
        returning * into v_control;
    end if;
    return jsonb_build_object(
        'liabilityRevision', v_control.liability_revision,
        'requiredMinimumAmount', v_control.required_minimum_amount,
        'lastProviderAppliedRevision', v_control.last_provider_applied_revision,
        'lastProviderAppliedAmount', v_control.last_provider_applied_amount,
        'changeDirection', v_control.change_direction,
        'decreaseAuthorizationId', v_control.decrease_authorization_id,
        'decreaseAuthorizedAt', v_control.decrease_authorized_at,
        'calculatedAt', v_control.calculated_at
    );
end;
$$;