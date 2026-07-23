\set ON_ERROR_STOP on

begin;
set local role service_role;

select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'filter-read-model-root', 'label', 'Filter read model root'
))->>'id')::bigint root_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :root_id,
    'slug', 'filter-read-model-child',
    'label', 'Filter read model child'
))->>'id')::bigint category_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'filter-read-model-outside', 'label', 'Filter read model outside'
))->>'id')::bigint outside_category_id \gset
update commerce.categories set status = 'inactive' where id = :root_id;

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options, unit, public_readable, enabled
) values (
    'product', 'filterReadModelWeight', 'Weight', 'number', '[]', 'g', true, true
);
insert into commerce.category_custom_fields (
    category_id, field_key, required, filterable, position
) values (:root_id, 'filterReadModelWeight', false, true, 1);

update commerce.brands set status = 'inactive' where status = 'active';
insert into commerce.brands (id, slug, name, status) values
    (9100000000000, 'filter-alpha', 'Alpha', 'active'),
    (9100000000002, 'filter-beta-two', 'Beta', 'active'),
    (9100000000001, 'filter-beta-one', 'Beta', 'active'),
    (9100000000003, 'filter-inactive', 'Aardvark inactive', 'inactive'),
    (9100000000004, 'filter-archived', 'Aardvark archived', 'archived'),
    (9100000000005, 'filter-outside', 'Aardvark outside', 'active');
insert into commerce.brands (id, slug, name, status)
select
    9200000000000 + generated,
    'filter-generated-' || lpad(generated::text, 3, '0'),
    'Filter ' || lpad(generated::text, 3, '0'),
    'active'
from generate_series(1, 205) generated;

insert into commerce.products (slug, title, brand_id, status, visibility)
select
    'product-' || brand.slug,
    'Product ' || brand.name,
    brand.id,
    'active',
    'public'
from commerce.brands brand
where brand.slug like 'filter-%';

insert into commerce.product_categories (product_id, category_id, is_primary)
select
    product.id,
    case when brand.slug = 'filter-outside'
        then :outside_category_id
        else :category_id
    end,
    true
from commerce.products product
join commerce.brands brand on brand.id = product.brand_id
where product.slug like 'product-filter-%';

do $$
declare
    v_slug text := 'filter-read-model-root/filter-read-model-child';
    v_schema jsonb;
    v_actual jsonb;
    v_keys text[];
begin
    v_schema := commerce.offer_filter_schema(v_slug);
    v_actual := commerce.get_offer_filter_schema_read_model(v_slug);

    if v_schema is null or v_actual - 'brands' is distinct from v_schema then
        raise exception 'offer filter read model: schema projection changed';
    end if;
    if jsonb_array_length(v_actual->'brands') <> 200
        or v_actual->'brands'->0->>'name' is distinct from 'Alpha'
        or v_actual->'brands'->1->>'id' is distinct from '9100000000001'
        or v_actual->'brands'->2->>'id' is distinct from '9100000000002'
        or v_actual->'brands'->199->>'name' is distinct from 'Filter 197' then
        raise exception 'offer filter read model: brand limit or order changed';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(v_actual->'brands') brand
        where brand->>'slug' in (
            'filter-inactive', 'filter-archived', 'filter-generated-198',
            'filter-outside'
        )
    ) then
        raise exception 'offer filter read model: excluded brand was returned';
    end if;

    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_actual) model_key(key);
    if v_keys is distinct from array['brands', 'category', 'fields'] then
        raise exception 'offer filter read model: top-level keys changed';
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_actual->'brands'->0) brand_key(key);
    if v_keys is distinct from array['id', 'name', 'slug'] then
        raise exception 'offer filter read model: brand keys changed';
    end if;

    update commerce.brands set status = 'inactive'
    where slug like 'filter-%' and status = 'active';
    if commerce.get_offer_filter_schema_read_model(v_slug)->'brands'
        is distinct from '[]'::jsonb then
        raise exception 'offer filter read model: empty brands changed';
    end if;
    if commerce.get_offer_filter_schema_read_model('filter-read-model-missing')
        is not null then
        raise exception 'offer filter read model: missing category returned a model';
    end if;
    update commerce.categories set status = 'inactive'
    where full_slug = v_slug;
    if commerce.get_offer_filter_schema_read_model(v_slug) is not null then
        raise exception 'offer filter read model: inactive category returned a model';
    end if;

    if not has_function_privilege(
        'service_role',
        'commerce.get_offer_filter_schema_read_model(text)',
        'execute'
    ) or has_function_privilege(
        'anon', 'commerce.get_offer_filter_schema_read_model(text)', 'execute'
    ) or has_function_privilege(
        'authenticated',
        'commerce.get_offer_filter_schema_read_model(text)',
        'execute'
    ) then
        raise exception 'offer filter read model: function ACL is unsafe';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname = 'get_offer_filter_schema_read_model'
          and (procedure.prosecdef or procedure.provolatile <> 's'
            or not coalesce(
                procedure.proconfig @> array['search_path=""']::text[], false
            ))
    ) then
        raise exception 'offer filter read model: function attributes are unsafe';
    end if;
end;
$$;

rollback;
