create or replace function sales_configurator.validate_variant_feature_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);
    if new.availability = 'included'
        and exists (
            select 1
            from sales_configurator.catalog_items variant_item
            where variant_item.id = new.variant_item_id
              and variant_item.status = 'published'
        )
        and not exists (
            select 1
            from sales_configurator.catalog_items feature_item
            where feature_item.id = new.feature_item_id
              and feature_item.status = 'published'
        )
    then
        raise exception
            'validation: a published variant includes only published features';
    end if;
    return new;
end;
$$;

drop trigger if exists variant_features_validate_publication
    on sales_configurator.variant_features;
create trigger variant_features_validate_publication
before insert or update on sales_configurator.variant_features
for each row execute function sales_configurator.validate_variant_feature_publication();
