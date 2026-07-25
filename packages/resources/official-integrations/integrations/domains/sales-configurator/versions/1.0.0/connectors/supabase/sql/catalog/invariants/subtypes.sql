create or replace function sales_configurator.assert_catalog_subtype_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_expected_kind text;
    v_actual_kind text;
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    v_expected_kind := case tg_table_name
        when 'catalog_modules' then 'module'
        when 'catalog_variants' then 'variant'
        when 'catalog_features' then 'feature'
        else null
    end;
    if v_expected_kind is null then
        raise exception 'invariant: unsupported catalogue subtype';
    end if;

    select item.kind
    into v_actual_kind
    from sales_configurator.catalog_items item
    where item.id = new.item_id;

    if v_actual_kind is distinct from v_expected_kind then
        raise exception
            'invariant: catalog item % must have kind %',
            new.item_id,
            v_expected_kind;
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_modules_assert_kind on sales_configurator.catalog_modules;
create trigger catalog_modules_assert_kind
before insert or update on sales_configurator.catalog_modules
for each row execute function sales_configurator.assert_catalog_subtype_kind();

drop trigger if exists catalog_variants_assert_kind on sales_configurator.catalog_variants;
create trigger catalog_variants_assert_kind
before insert or update on sales_configurator.catalog_variants
for each row execute function sales_configurator.assert_catalog_subtype_kind();

drop trigger if exists catalog_features_assert_kind on sales_configurator.catalog_features;
create trigger catalog_features_assert_kind
before insert or update on sales_configurator.catalog_features
for each row execute function sales_configurator.assert_catalog_subtype_kind();

create or replace function sales_configurator.validate_published_variant_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    if exists (
        select 1
        from sales_configurator.catalog_items item
        where item.id = new.item_id
          and item.status = 'published'
    ) and not exists (
        select 1
        from sales_configurator.catalog_items module_item
        where module_item.id = new.module_item_id
          and module_item.kind = 'module'
          and module_item.status = 'published'
    ) then
        raise exception 'validation: a published variant requires a published module';
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_variants_validate_module
    on sales_configurator.catalog_variants;
create trigger catalog_variants_validate_module
before insert or update of module_item_id on sales_configurator.catalog_variants
for each row execute function sales_configurator.validate_published_variant_module();

create or replace function sales_configurator.protect_catalog_item_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    if new.kind = old.kind then
        return new;
    end if;
    if exists (
        select 1 from sales_configurator.catalog_modules module where module.item_id = old.id
        union all
        select 1 from sales_configurator.catalog_variants variant where variant.item_id = old.id
        union all
        select 1 from sales_configurator.catalog_features feature where feature.item_id = old.id
    ) then
        raise exception 'invariant: catalog item kind is immutable after subtype creation';
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_items_protect_kind on sales_configurator.catalog_items;
create trigger catalog_items_protect_kind
before update of kind on sales_configurator.catalog_items
for each row execute function sales_configurator.protect_catalog_item_kind();
