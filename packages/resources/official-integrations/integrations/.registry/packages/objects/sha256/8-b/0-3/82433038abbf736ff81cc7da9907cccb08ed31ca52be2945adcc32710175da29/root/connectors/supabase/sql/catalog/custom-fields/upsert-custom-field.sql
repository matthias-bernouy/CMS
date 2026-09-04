

drop function if exists commerce.upsert_custom_field(
    text, text, text, text, jsonb, boolean, boolean, boolean,
    boolean, boolean, integer, boolean
);

create or replace function commerce.upsert_custom_field(
    p_entity_type text,
    p_key text,
    p_label text,
    p_field_type text,
    p_options jsonb default '[]'::jsonb,
    p_required boolean default false,
    p_self_editable boolean default false,
    p_admin_editable boolean default true,
    p_public_readable boolean default false,
    p_show_in_dashboard_table boolean default false,
    p_position integer default 0,
    p_enabled boolean default true,
    p_unit text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_definition commerce.custom_field_definitions%rowtype;
begin
    if p_entity_type not in ('product', 'variant', 'seller', 'offer', 'order') then
        raise exception 'validation: unsupported custom field entity type';
    end if;
    if p_field_type not in ('string', 'number', 'boolean', 'enum') then
        raise exception 'validation: unsupported custom field type';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce-custom-fields:' || p_entity_type, 0));
    if not exists (
        select 1 from commerce.custom_field_definitions
        where entity_type = p_entity_type and key = p_key
    ) and (
        select count(*) from commerce.custom_field_definitions where entity_type = p_entity_type
    ) >= 128 then
        raise exception 'validation: at most 128 custom fields are allowed per entity';
    end if;

    if exists (
        select 1
        from (
            select metadata from commerce.products where p_entity_type = 'product'
            union all select metadata from commerce.product_variants where p_entity_type = 'variant'
            union all select metadata from commerce.sellers where p_entity_type = 'seller'
            union all select metadata from commerce.offers where p_entity_type = 'offer'
            union all select metadata from commerce.orders where p_entity_type = 'order'
        ) entity
        where entity.metadata ? p_key
          and (
              (p_field_type in ('string', 'enum') and jsonb_typeof(entity.metadata->p_key) <> 'string')
              or (p_field_type = 'number' and jsonb_typeof(entity.metadata->p_key) <> 'number')
              or (p_field_type = 'boolean' and jsonb_typeof(entity.metadata->p_key) <> 'boolean')
              or (p_field_type = 'enum' and not (p_options @> jsonb_build_array(entity.metadata->p_key)))
          )
    ) then raise exception 'conflict: existing metadata values are incompatible with this definition'; end if;

    if p_enabled and p_required and exists (
        select 1
        from (
            select metadata from commerce.products where p_entity_type = 'product'
            union all select metadata from commerce.product_variants where p_entity_type = 'variant'
            union all select metadata from commerce.sellers where p_entity_type = 'seller'
            union all select metadata from commerce.offers where p_entity_type = 'offer'
            union all select metadata from commerce.orders where p_entity_type = 'order'
        ) entity
        where not (entity.metadata ? p_key)
    ) then raise exception 'conflict: existing entities are missing this required custom field'; end if;

    insert into commerce.custom_field_definitions (
        entity_type, key, label, field_type, options, unit, required,
        self_editable, admin_editable, public_readable,
        show_in_dashboard_table, position, enabled
    ) values (
        p_entity_type, p_key, p_label, p_field_type, coalesce(p_options, '[]'::jsonb), nullif(btrim(p_unit), ''), p_required,
        p_self_editable, p_admin_editable, p_public_readable,
        p_show_in_dashboard_table, p_position, p_enabled
    ) on conflict (entity_type, key) do update
    set label = excluded.label,
        field_type = excluded.field_type,
        options = excluded.options,
        unit = excluded.unit,
        required = excluded.required,
        self_editable = excluded.self_editable,
        admin_editable = excluded.admin_editable,
        public_readable = excluded.public_readable,
        show_in_dashboard_table = excluded.show_in_dashboard_table,
        position = excluded.position,
        enabled = excluded.enabled
    returning * into v_definition;
    return to_jsonb(v_definition);
end;
$$;