create or replace function sales_configurator.reject_catalog_requirement_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_old_subject_item_id bigint;
    v_old_required_item_id bigint;
    v_subject_status text;
    v_required_status text;
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    lock table sales_configurator.catalog_requirements
        in share row exclusive mode;

    if tg_op = 'UPDATE' then
        v_old_subject_item_id := old.subject_item_id;
        v_old_required_item_id := old.required_item_id;
    end if;
    if new.subject_item_id = new.required_item_id then
        raise exception 'validation: a catalogue item cannot require itself';
    end if;

    select subject.status, required.status
    into v_subject_status, v_required_status
    from sales_configurator.catalog_items subject
    join sales_configurator.catalog_items required
      on required.id = new.required_item_id
    where subject.id = new.subject_item_id;

    if v_subject_status = 'published' and v_required_status <> 'published' then
        raise exception 'validation: a published item requires only published items';
    end if;

    if exists (
        with recursive reachable(item_id) as (
            select new.required_item_id
            union
            select requirement.required_item_id
            from sales_configurator.catalog_requirements requirement
            join reachable parent on parent.item_id = requirement.subject_item_id
            where not (
                tg_op = 'UPDATE'
                and requirement.subject_item_id = v_old_subject_item_id
                and requirement.required_item_id = v_old_required_item_id
            )
        )
        select 1
        from reachable
        where item_id = new.subject_item_id
    ) then
        raise exception 'validation: catalogue requirement would create a cycle';
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_requirements_reject_cycle
    on sales_configurator.catalog_requirements;
create trigger catalog_requirements_reject_cycle
before insert or update on sales_configurator.catalog_requirements
for each row execute function sales_configurator.reject_catalog_requirement_cycle();
