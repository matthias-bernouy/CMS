create or replace function sales_configurator.lock_draft_catalog()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
    lock table
        sales_configurator.catalog_items,
        sales_configurator.catalog_variants,
        sales_configurator.variant_features,
        sales_configurator.catalog_requirements
    in share mode;
end;
$$;
