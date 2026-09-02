do $$
begin
    perform pg_catalog.pg_advisory_xact_lock(83472911);

    if exists (
        select 1
        from sales_configurator.catalog_items item
        where not (
            (
                item.kind = 'module'
                and exists (
                    select 1 from sales_configurator.catalog_modules module
                    where module.item_id = item.id
                )
            )
            or (
                item.kind = 'variant'
                and exists (
                    select 1 from sales_configurator.catalog_variants variant
                    where variant.item_id = item.id
                )
            )
            or (
                item.kind = 'feature'
                and exists (
                    select 1 from sales_configurator.catalog_features feature
                    where feature.item_id = item.id
                )
            )
        )
    ) then
        raise exception
            'invariant: a catalogue item is missing its matching subtype';
    end if;

    if exists (
        select 1
        from sales_configurator.catalog_modules module
        join sales_configurator.catalog_items item on item.id = module.item_id
        where item.kind <> 'module'
        union all
        select 1
        from sales_configurator.catalog_variants variant
        join sales_configurator.catalog_items item on item.id = variant.item_id
        where item.kind <> 'variant'
        union all
        select 1
        from sales_configurator.catalog_features feature
        join sales_configurator.catalog_items item on item.id = feature.item_id
        where item.kind <> 'feature'
    ) then
        raise exception
            'invariant: a catalogue subtype does not match its item kind';
    end if;

    if exists (
        select 1
        from sales_configurator.catalog_requirements requirement
        join sales_configurator.catalog_items subject
          on subject.id = requirement.subject_item_id
         and subject.status = 'published'
        join sales_configurator.catalog_items required
          on required.id = requirement.required_item_id
        where required.status <> 'published'
    ) then
        raise exception
            'invariant: a published catalogue item requires an unpublished item';
    end if;

    if exists (
        select 1
        from sales_configurator.catalog_variants variant
        join sales_configurator.catalog_items variant_item
          on variant_item.id = variant.item_id
         and variant_item.status = 'published'
        join sales_configurator.catalog_items module_item
          on module_item.id = variant.module_item_id
        where module_item.status <> 'published'
    ) then
        raise exception
            'invariant: a published catalogue variant belongs to an unpublished module';
    end if;

    if exists (
        select 1
        from sales_configurator.variant_features relation
        join sales_configurator.catalog_items variant_item
          on variant_item.id = relation.variant_item_id
         and variant_item.status = 'published'
        join sales_configurator.catalog_items feature_item
          on feature_item.id = relation.feature_item_id
        where relation.availability = 'included'
          and feature_item.status <> 'published'
    ) then
        raise exception
            'invariant: a published catalogue variant includes an unpublished feature';
    end if;
end;
$$;
