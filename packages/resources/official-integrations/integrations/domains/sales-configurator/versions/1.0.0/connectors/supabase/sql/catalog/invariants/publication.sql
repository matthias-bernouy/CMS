create or replace function sales_configurator.lock_catalog_publication_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    return new;
end;
$$;

drop trigger if exists catalog_items_lock_publication_write
    on sales_configurator.catalog_items;
create trigger catalog_items_lock_publication_write
before insert or update of status on sales_configurator.catalog_items
for each row execute function sales_configurator.lock_catalog_publication_write();

create or replace function sales_configurator.validate_catalog_publication_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_item sales_configurator.catalog_items%rowtype;
begin
    select item.*
    into v_item
    from sales_configurator.catalog_items item
    where item.id = new.id;
    if not found then
        return null;
    end if;

    if not (
        (
            v_item.kind = 'module'
            and exists (
                select 1
                from sales_configurator.catalog_modules module
                where module.item_id = v_item.id
            )
        )
        or (
            v_item.kind = 'variant'
            and exists (
                select 1
                from sales_configurator.catalog_variants variant
                where variant.item_id = v_item.id
            )
        )
        or (
            v_item.kind = 'feature'
            and exists (
                select 1
                from sales_configurator.catalog_features feature
                where feature.item_id = v_item.id
            )
        )
    ) then
        raise exception 'invariant: catalogue item requires its matching subtype';
    end if;

    if v_item.status = 'published' then
        if exists (
            select 1
            from sales_configurator.catalog_requirements requirement
            join sales_configurator.catalog_items required
              on required.id = requirement.required_item_id
            where requirement.subject_item_id = v_item.id
              and required.status <> 'published'
        ) then
            raise exception 'validation: a published item requires only published items';
        end if;
        if v_item.kind = 'variant' and not exists (
            select 1
            from sales_configurator.catalog_variants variant
            join sales_configurator.catalog_items module_item
              on module_item.id = variant.module_item_id
             and module_item.kind = 'module'
             and module_item.status = 'published'
            where variant.item_id = v_item.id
        ) then
            raise exception 'validation: a published variant requires a published module';
        end if;
        if v_item.kind = 'variant' and exists (
            select 1
            from sales_configurator.variant_features relation
            join sales_configurator.catalog_items feature_item
              on feature_item.id = relation.feature_item_id
            where relation.variant_item_id = v_item.id
              and relation.availability = 'included'
              and feature_item.status <> 'published'
        ) then
            raise exception
                'validation: a published variant includes only published features';
        end if;
    else
        if exists (
            select 1
            from sales_configurator.catalog_requirements requirement
            join sales_configurator.catalog_items subject
              on subject.id = requirement.subject_item_id
             and subject.status = 'published'
            where requirement.required_item_id = v_item.id
        ) then
            raise exception 'validation: an item required by a published item must stay published';
        end if;
        if v_item.kind = 'module' and exists (
            select 1
            from sales_configurator.catalog_variants variant
            join sales_configurator.catalog_items variant_item
              on variant_item.id = variant.item_id
             and variant_item.status = 'published'
            where variant.module_item_id = v_item.id
        ) then
            raise exception 'validation: a module with published variants must stay published';
        end if;
        if v_item.kind = 'feature' and exists (
            select 1
            from sales_configurator.variant_features relation
            join sales_configurator.catalog_items variant_item
              on variant_item.id = relation.variant_item_id
             and variant_item.status = 'published'
            where relation.feature_item_id = v_item.id
              and relation.availability = 'included'
        ) then
            raise exception
                'validation: a feature included by a published variant must stay published';
        end if;
    end if;
    return null;
end;
$$;

drop trigger if exists catalog_items_validate_publication
    on sales_configurator.catalog_items;
create constraint trigger catalog_items_validate_publication
after insert or update of status on sales_configurator.catalog_items
deferrable initially deferred
for each row execute function sales_configurator.validate_catalog_publication_state();
