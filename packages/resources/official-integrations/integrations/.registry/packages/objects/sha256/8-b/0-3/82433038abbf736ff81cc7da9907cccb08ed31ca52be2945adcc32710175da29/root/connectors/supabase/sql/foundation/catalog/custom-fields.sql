

create table if not exists commerce.custom_field_definitions (
    entity_type text not null,
    key text not null,
    label text not null,
    field_type text not null,
    options jsonb not null default '[]'::jsonb,
    unit text,
    required boolean not null default false,
    self_editable boolean not null default false,
    admin_editable boolean not null default true,
    public_readable boolean not null default false,
    show_in_dashboard_table boolean not null default false,
    position integer not null default 0,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (entity_type, key),
    constraint custom_field_definitions_entity check (
        entity_type in ('product', 'variant', 'seller', 'offer', 'order')
    ),
    constraint custom_field_definitions_key_format check (key ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
    constraint custom_field_definitions_label_not_blank check (length(btrim(label)) > 0),
    constraint custom_field_definitions_label_length check (length(label) <= 200),
    constraint custom_field_definitions_type check (field_type in ('string', 'number', 'boolean', 'enum')),
    constraint custom_field_definitions_options_array check (jsonb_typeof(options) = 'array'),
    constraint custom_field_definitions_options_size check (pg_column_size(options) <= 16384),
    constraint custom_field_definitions_unit_length check (unit is null or length(unit) <= 32),
    constraint custom_field_definitions_enum_options check (
        (field_type = 'enum' and jsonb_array_length(options) between 1 and 64)
        or (field_type <> 'enum' and jsonb_array_length(options) = 0)
    ),
    constraint custom_field_definitions_required_editable check (
        not required
        or (entity_type in ('seller', 'order') and self_editable)
        or (entity_type = 'offer' and self_editable and admin_editable)
        or (entity_type in ('product', 'variant') and admin_editable)
    )
);

alter table commerce.custom_field_definitions add column if not exists unit text;
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'custom_field_definitions_unit_length'
          and conrelid = 'commerce.custom_field_definitions'::regclass
    ) then
        alter table commerce.custom_field_definitions
        add constraint custom_field_definitions_unit_length check (unit is null or length(unit) <= 32);
    end if;
end;
$$;

create table if not exists commerce.category_custom_fields (
    category_id bigint not null references commerce.categories(id) on delete cascade,
    entity_type text not null default 'product',
    field_key text not null,
    required boolean not null default false,
    filterable boolean not null default false,
    position integer not null default 0,
    unit text,
    operators jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (category_id, field_key),
    constraint category_custom_fields_definition_fk foreign key (entity_type, field_key)
        references commerce.custom_field_definitions(entity_type, key) on delete cascade,
    constraint category_custom_fields_product_only check (entity_type = 'product'),
    constraint category_custom_fields_unit_length check (unit is null or length(unit) <= 32),
    constraint category_custom_fields_operators_array check (jsonb_typeof(operators) = 'array'),
    constraint category_custom_fields_operators_size check (pg_column_size(operators) <= 2048)
);

update commerce.custom_field_definitions definition
set unit = migrated.unit
from (
    select field_key, min(unit) unit
    from commerce.category_custom_fields
    where unit is not null and btrim(unit) <> ''
    group by field_key
    having count(distinct unit) = 1
) migrated
where definition.entity_type = 'product'
  and definition.key = migrated.field_key
  and definition.unit is null;

update commerce.category_custom_fields
set unit = null, operators = '[]'::jsonb
where unit is not null or operators <> '[]'::jsonb;