select commerce_liability_test.seed_order('expiry-trigger', 10000);
select commerce_liability_test.seed_order('expiry-due', 20000);

do $cross_order_expiry$
declare
    v_trigger_order_id bigint;
    v_due_order_id bigint;
    v_due_risk bigint;
    v_control commerce.platform_payout_liability_controls%rowtype;
    v_authorized commerce.platform_payout_liability_controls%rowtype;
    v_authorization_id uuid;
begin
    select order_id into v_trigger_order_id
    from commerce_liability_test.orders where label = 'expiry-trigger';
    select seeded.order_id,
        (seeded.terms->>'platform_risk_reserve_contribution_amount')::bigint
    into v_due_order_id, v_due_risk
    from commerce_liability_test.orders seeded where label = 'expiry-due';
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';

    perform commerce.record_platform_payout_liability_applied(
        v_control.liability_revision,
        v_control.required_minimum_amount + 1000,
        null
    );
    update commerce.order_settlements
    set total_transferred_amount = 10
    where order_id = v_trigger_order_id;
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';
    perform commerce.authorize_platform_payout_liability_decrease(
        v_control.liability_revision, 'liability-admin', 'Cross-order expiry contract'
    );
    select * into v_authorized
    from commerce.platform_payout_liability_controls where control_key = 'default';
    v_authorization_id := v_authorized.decrease_authorization_id;
    if v_authorization_id is null then
        raise exception 'platform liability: decrease authorization was not created';
    end if;

    update commerce.platform_payout_order_liabilities
    set lifecycle_status = 'active', risk_release_at = now()
    where order_id = v_due_order_id;
    if (select (liability_revision, required_minimum_amount,
            decrease_authorization_id)
        from commerce.platform_payout_liability_controls
        where control_key = 'default') is distinct from row(
            v_authorized.liability_revision,
            v_authorized.required_minimum_amount,
            v_authorization_id
        ) then
        raise exception 'platform liability: direct expiry unexpectedly refreshed control';
    end if;

    update commerce.order_settlements
    set total_transferred_amount = 110
    where order_id = v_trigger_order_id;
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_control.liability_revision <> v_authorized.liability_revision + 1
       or v_control.previous_required_minimum_amount
            <> v_authorized.required_minimum_amount
       or v_control.required_minimum_amount
            <> v_authorized.required_minimum_amount - 100 - v_due_risk
       or v_control.decrease_authorization_id is not null
       or v_control.change_direction <> 'decrease' then
        raise exception 'platform liability: cross-order expiry changed: %',
            to_jsonb(v_control);
    end if;
    if (select count(*) from commerce.platform_payout_liability_revisions
        where liability_revision > v_authorized.liability_revision) <> 1
       or not exists (
           select 1 from commerce.platform_payout_liability_revisions
           where liability_revision = v_control.liability_revision
             and calculation_reason =
                'Transactional order_settlements projection refresh'
             and included_prospective_order_id is null
       ) then
        raise exception 'platform liability: combined expiry did not create one revision';
    end if;
end;
$cross_order_expiry$;
