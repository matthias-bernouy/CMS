create extension if not exists dblink;

create function commerce_liability_test.update_transfer(
    p_label text,
    p_transferred_amount bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_control commerce.platform_payout_liability_controls%rowtype;
begin
    update commerce.order_settlements settlement
    set total_transferred_amount = p_transferred_amount
    from commerce_liability_test.orders seeded
    where seeded.label = p_label
      and settlement.order_id = seeded.order_id;
    if not found then
        raise exception 'platform liability: missing concurrent order %', p_label;
    end if;
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';
    return jsonb_build_object(
        'revision', v_control.liability_revision,
        'requiredMinimumAmount', v_control.required_minimum_amount
    );
end;
$$;

create function commerce_liability_test.wait_until_blocked(
    p_application_name text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
    loop
        if exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and lock_row.locktype = 'advisory'
              and not lock_row.granted
        ) then
            return;
        end if;
        if clock_timestamp() >= v_deadline then
            raise exception 'platform liability: session % did not block',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

grant execute on function commerce_liability_test.update_transfer(text, bigint)
to service_role;
