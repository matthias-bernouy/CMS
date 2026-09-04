

create or replace function commerce.record_platform_payout_liability_applied(
    p_liability_revision bigint,
    p_applied_minimum_amount bigint,
    p_decrease_authorization_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control commerce.platform_payout_liability_controls%rowtype;
begin
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
    );
    select * into v_control
    from commerce.platform_payout_liability_controls
    where control_key = 'default'
    for update;
    if v_control.liability_revision is distinct from p_liability_revision then
        return jsonb_build_object(
            'accepted', false, 'needsReapply', true,
            'control', commerce.refresh_platform_payout_liability(
                'Provider completion observed a newer Commerce revision', null
            )
        );
    end if;
    if p_applied_minimum_amount < v_control.required_minimum_amount then
        raise exception 'conflict: provider applied amount is below the Commerce aggregate';
    end if;
    if v_control.decrease_authorization_id is not null then
        if v_control.decrease_authorization_id is distinct from p_decrease_authorization_id then
            raise exception 'forbidden: exact Admin decrease authorization does not match';
        end if;
        if p_applied_minimum_amount is distinct from v_control.required_minimum_amount then
            raise exception 'conflict: Admin-authorized provider decrease must match the exact Commerce aggregate';
        end if;
    end if;
    if p_applied_minimum_amount < v_control.last_provider_applied_amount then
        if v_control.decrease_authorization_id is null
            or v_control.decrease_authorization_id is distinct from p_decrease_authorization_id then
            raise exception 'forbidden: exact Admin decrease authorization is required';
        end if;
    end if;
    update commerce.platform_payout_liability_revisions set
        provider_applied_amount = p_applied_minimum_amount,
        provider_applied_at = now()
    where liability_revision = v_control.liability_revision;
    update commerce.platform_payout_liability_controls set
        last_provider_applied_revision = v_control.liability_revision,
        last_provider_applied_amount = p_applied_minimum_amount,
        last_provider_applied_at = now(),
        change_direction = 'unchanged',
        decrease_authorization_id = null,
        decrease_authorized_by = null,
        decrease_authorized_reason = null,
        decrease_authorized_at = null,
        updated_at = now()
    where control_key = 'default'
    returning * into v_control;
    return jsonb_build_object(
        'accepted', true, 'needsReapply', false,
        'liabilityRevision', v_control.liability_revision,
        'requiredMinimumAmount', v_control.required_minimum_amount,
        'lastProviderAppliedAmount', v_control.last_provider_applied_amount
    );
end;
$$;