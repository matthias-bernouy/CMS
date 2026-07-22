\set ON_ERROR_STOP on

-- Run with psql -f so the relative includes resolve from this directory.

begin;

do $security$
declare
    target oid := to_regprocedure(
        'commerce.list_seller_offers_read_model(text,text,text,text,text,text,text,text,integer,bigint)'
    );
begin
    if target is null then
        raise exception 'seller read model: RPC is missing';
    end if;
    if exists (
        select 1 from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 's'
              or not coalesce(proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'seller read model: RPC security attributes are invalid';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'seller read model: RPC privileges are invalid';
    end if;
end;
$security$;

create function pg_temp.assert_seller_page(
    actual jsonb,
    expected_slugs text[],
    expected_total bigint,
    label text
)
returns void
language plpgsql
as $assert$
declare
    actual_slugs text[];
begin
    select coalesce(array_agg(item.value->>'slug' order by item.ordinality), array[]::text[])
    into actual_slugs
    from jsonb_array_elements(actual->'rows') with ordinality item(value, ordinality);
    if actual->>'seller_exists' is distinct from 'true'
       or actual->>'status_valid' is distinct from 'true'
       or (actual->>'total')::bigint is distinct from expected_total
       or actual_slugs is distinct from expected_slugs then
        raise exception 'seller read model: % changed: %', label, actual;
    end if;
end;
$assert$;

set local role service_role;
\ir seller-read-model.fixture.sql

do $contract$
declare
    result jsonb;
    expected_media bigint[];
begin
    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'under_review',
        p_condition_code => 'good',
        p_limit => 2,
        p_offset => 0
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-review-new', 'seller-read-review-old'], 2, 'page contract'
    );
    if (select count(*) from jsonb_object_keys(result->'rows'->0)) <> 18
       or (result->'rows'->0) ? 'inventory_revision'
       or result #> '{rows,0,variant_id}' is distinct from 'null'::jsonb
       or result #> '{rows,0,description}' is distinct from 'null'::jsonb
       or result #> '{rows,0,metadata}' is distinct from '{"privateNote":"kept"}'::jsonb then
        raise exception 'seller read model: row projection or nulls changed: %', result->'rows';
    end if;
    if result->'workflow_states' is distinct from '[
        {"code":"draft","label":"Draft","phase":"draft","terminal":false},
        {"code":"pending_review","label":"Pending review","phase":"admin_review","terminal":false},
        {"code":"seller_read_model_review","label":"Custom review","phase":"admin_review","terminal":false},
        {"code":"changes_requested","label":"Changes requested","phase":"seller_input","terminal":false},
        {"code":"awaiting_seller_price","label":"Awaiting seller price","phase":"seller_input","terminal":false},
        {"code":"awaiting_final_approval","label":"Awaiting final approval","phase":"admin_review","terminal":false},
        {"code":"approved","label":"Approved","phase":"ready","terminal":false},
        {"code":"rejected","label":"Rejected","phase":"terminal","terminal":true},
        {"code":"archived","label":"Archived","phase":"terminal","terminal":true}
    ]'::jsonb then
        raise exception 'seller read model: workflow projection changed: %', result->'workflow_states';
    end if;

    select array_agg(media.id order by expected.position)
    into expected_media
    from (values ('12', 1), ('14', 2), ('15', 3), ('13', 4)) expected(key, position)
    join commerce.media media
      on media.storage_path = 'seller-read-model/' || expected.key || '.jpg';
    if array(
        select (item.value->>'media_id')::bigint
        from jsonb_array_elements(result->'media') with ordinality item(value, ordinality)
        order by item.ordinality
    ) <> expected_media then
        raise exception 'seller read model: media order changed: %', result->'media';
    end if;
    if array(
        select (item.value->>'amount')::bigint
        from jsonb_array_elements(result->'active_price_proposals')
            with ordinality item(value, ordinality)
        order by item.ordinality
    ) <> array[12000, 11000]::bigint[] then
        raise exception 'seller read model: proposal order changed: %', result->'active_price_proposals';
    end if;

    result := commerce.list_seller_offers_read_model(
        'seller-read-model-user', 'under_review', null, null, 'good',
        null, null, null, 2, 3000000000
    );
    perform pg_temp.assert_seller_page(result, array[]::text[], 2, 'deep offset');

    result := commerce.list_seller_offers_read_model(
        'missing-seller', 'unknown', null, null, null,
        'not-an-integer', null, null, 50, 0
    );
    if result->>'seller_exists' <> 'false' or result->>'status_valid' <> 'true' then
        raise exception 'seller read model: missing seller short circuit changed: %', result;
    end if;
    result := commerce.list_seller_offers_read_model(
        'seller-read-model-user', 'unknown', null, null, null,
        'not-an-integer', null, null, 50, 0
    );
    if result->>'seller_exists' <> 'true' or result->>'status_valid' <> 'false' then
        raise exception 'seller read model: invalid status short circuit changed: %', result;
    end if;

    begin
        perform commerce.list_seller_offers_read_model(
            'seller-read-model-user', 'all', null, null, null,
            'not-an-integer', 'also-not-an-integer', null, 50, 0
        );
        raise exception 'seller read model: invalid product id was accepted';
    exception when invalid_text_representation then
        if sqlerrm <> 'invalid input syntax for type bigint: "not-an-integer"' then raise; end if;
    end;
    begin
        perform commerce.list_seller_offers_read_model(null);
        raise exception 'seller read model: empty actor was accepted';
    exception when insufficient_privilege then
        if sqlerrm <> 'forbidden: CMS user id is required' then raise; end if;
    end;

    result := commerce.list_seller_offers_read_model('seller-read-model-other', 'under_review');
    perform pg_temp.assert_seller_page(result, array['seller-read-other-offer'], 1, 'ownership');
end;
$contract$;

\ir seller-read-model.filters.sql
\ir seller-read-model.empty-states.sql

rollback;
