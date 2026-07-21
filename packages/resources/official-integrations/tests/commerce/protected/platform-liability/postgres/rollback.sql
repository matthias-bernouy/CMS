select commerce_liability_test.seed_order('rollback-order', 10000);

do $rollback_contract$
declare
    v_order_id bigint;
    v_control_before jsonb;
    v_control_after jsonb;
    v_settlement_before jsonb;
    v_settlement_after jsonb;
    v_revisions_before jsonb;
    v_revisions_after jsonb;
    v_revision bigint;
begin
    select order_id into v_order_id
    from commerce_liability_test.orders where label = 'rollback-order';
    select to_jsonb(control) into v_control_before
    from commerce.platform_payout_liability_controls control
    where control_key = 'default';
    select to_jsonb(settlement) into v_settlement_before
    from commerce.order_settlements settlement where order_id = v_order_id;
    select coalesce(jsonb_agg(to_jsonb(revision) order by liability_revision), '[]')
    into v_revisions_before
    from commerce.platform_payout_liability_revisions revision;
    v_revision := (v_control_before->>'liability_revision')::bigint;

    begin
        update commerce.order_settlements
        set total_transferred_amount = 123
        where order_id = v_order_id;
        if (select liability_revision
            from commerce.platform_payout_liability_controls
            where control_key = 'default') <> v_revision + 1
           or not exists (
               select 1 from commerce.platform_payout_liability_revisions
               where liability_revision = v_revision + 1
           ) then
            raise exception 'platform liability: rollback setup did not mutate atomically';
        end if;
        raise exception 'platform-liability-rollback-marker';
    exception when others then
        if sqlerrm <> 'platform-liability-rollback-marker' then raise; end if;
    end;

    select to_jsonb(control) into v_control_after
    from commerce.platform_payout_liability_controls control
    where control_key = 'default';
    select to_jsonb(settlement) into v_settlement_after
    from commerce.order_settlements settlement where order_id = v_order_id;
    select coalesce(jsonb_agg(to_jsonb(revision) order by liability_revision), '[]')
    into v_revisions_after
    from commerce.platform_payout_liability_revisions revision;
    if v_control_after is distinct from v_control_before
       or v_settlement_after is distinct from v_settlement_before
       or v_revisions_after is distinct from v_revisions_before then
        raise exception 'platform liability: subtransaction rollback leaked state';
    end if;
end;
$rollback_contract$;
