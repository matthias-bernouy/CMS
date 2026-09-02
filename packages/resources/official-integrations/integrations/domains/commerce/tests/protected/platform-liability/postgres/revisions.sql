select commerce_liability_test.seed_order('revision-order', 10000);

do $revision_contract$
declare
    v_order_id bigint;
    v_before commerce.platform_payout_liability_controls%rowtype;
    v_after commerce.platform_payout_liability_controls%rowtype;
    v_revision_count bigint;
    v_initial_preparation jsonb;
    v_replay jsonb;
begin
    select order_id, preparation into v_order_id, v_initial_preparation
    from commerce_liability_test.orders where label = 'revision-order';
    select * into v_before
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if not exists (
        select 1 from commerce.platform_payout_liability_revisions
        where liability_revision = v_before.liability_revision
          and required_minimum_amount = v_before.required_minimum_amount
          and previous_required_minimum_amount = 0
          and calculation_reason =
            'Protected payment preparation reserved prospective liability'
          and included_prospective_order_id = v_order_id
    ) then
        raise exception 'platform liability: prospective revision metadata changed';
    end if;
    select count(*) into v_revision_count
    from commerce.platform_payout_liability_revisions;
    update commerce.platform_payout_liability_controls
    set calculated_at = '-infinity'::timestamptz
    where control_key = 'default';
    perform commerce.refresh_platform_payout_liability(
        'Unchanged aggregate contract', null
    );
    select * into v_after
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_after.liability_revision <> v_before.liability_revision
       or v_after.required_minimum_amount <> v_before.required_minimum_amount
       or v_after.calculated_at = '-infinity'::timestamptz
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_revision_count then
        raise exception 'platform liability: unchanged refresh created a revision';
    end if;
    v_replay := commerce.prepare_protected_payment(
        v_order_id, 'liability-buyer-revision-order'
    );
    if v_replay is distinct from v_initial_preparation
       or (select liability_revision
           from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_before.liability_revision
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_revision_count then
        raise exception 'platform liability: prepare replay changed state or response';
    end if;

    update commerce.order_settlements
    set total_transferred_amount = 40
    where order_id = v_order_id;
    select * into v_after
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_after.liability_revision <> v_before.liability_revision + 1
       or v_after.previous_required_minimum_amount
            <> v_before.required_minimum_amount
       or v_after.required_minimum_amount
            <> v_before.required_minimum_amount - 40
       or v_after.change_direction <> 'increase'
       or not exists (
           select 1 from commerce.platform_payout_liability_revisions
           where liability_revision = v_after.liability_revision
             and required_minimum_amount = v_after.required_minimum_amount
             and previous_required_minimum_amount = v_before.required_minimum_amount
             and calculation_reason =
                'Transactional order_settlements projection refresh'
             and included_prospective_order_id is null
       ) then
        raise exception 'platform liability: changed aggregate revision changed: %',
            to_jsonb(v_after);
    end if;
end;
$revision_contract$;

select commerce_liability_test.seed_order('revision-peer', 20000);

do $multi_row_revision$
declare
    v_before commerce.platform_payout_liability_controls%rowtype;
    v_after commerce.platform_payout_liability_controls%rowtype;
begin
    select * into v_before
    from commerce.platform_payout_liability_controls where control_key = 'default';
    update commerce.order_settlements settlement
    set total_transferred_amount = case seeded.label
        when 'revision-order' then 73
        when 'revision-peer' then 47
    end
    from commerce_liability_test.orders seeded
    where settlement.order_id = seeded.order_id
      and seeded.label in ('revision-order', 'revision-peer');
    select * into v_after
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_after.liability_revision <> v_before.liability_revision + 1
       or v_after.previous_required_minimum_amount
            <> v_before.required_minimum_amount
       or v_after.required_minimum_amount
            <> v_before.required_minimum_amount - 80
       or (select count(*) from commerce.platform_payout_liability_revisions
           where liability_revision > v_before.liability_revision) <> 1 then
        raise exception 'platform liability: multi-row write revision changed: %',
            to_jsonb(v_after);
    end if;
end;
$multi_row_revision$;
