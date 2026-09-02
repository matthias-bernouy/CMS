begin;
set local role service_role;
do $direct_fixture$
declare v_bundle jsonb;
begin
    v_bundle := commerce.upsert_product_read_model(null, '{
        "slug":"matrix-contract-direct-race",
        "title":"Matrix direct race",
        "status":"active",
        "visibility":"public"
    }'::jsonb, null);
    insert into commerce_product_matrix_test.products
    values (
        'direct-race',
        (v_bundle->'product'->>'id')::bigint,
        (v_bundle->'product'->>'version')::integer
    );
end;
$direct_fixture$;
commit;

select public.dblink_connect(
    'matrix_direct_a', 'dbname=' || current_database()
        || ' application_name=matrix_direct_a options=-cstatement_timeout=10000'
);
select public.dblink_connect(
    'matrix_direct_b', 'dbname=' || current_database()
        || ' application_name=matrix_direct_b options=-cstatement_timeout=10000'
);
select public.dblink_exec('matrix_direct_a', 'set role service_role');
select public.dblink_exec('matrix_direct_b', 'set role service_role');

begin;
lock table commerce.product_variant_axes in access exclusive mode;
select public.dblink_send_query('matrix_direct_a', pg_catalog.format(
    'select jsonb_build_object(''ok'',true,''result'',commerce.sync_product_variant_matrix(%s,%L::jsonb,%L::jsonb))',
    product_id,
    '[{"key":"size","label":"Size","values":[{"key":"s","label":"Small"}]}]',
    '[{"key":"size:s","title":"Small","choices":[{"axisKey":"size","valueKey":"s"}]}]'
)) from commerce_product_matrix_test.products where label = 'direct-race';
select public.dblink_send_query('matrix_direct_b', pg_catalog.format(
    'select jsonb_build_object(''ok'',true,''result'',commerce.sync_product_variant_matrix(%s,%L::jsonb,%L::jsonb))',
    product_id,
    '[{"key":"color","label":"Color","values":[{"key":"red","label":"Red"}]}]',
    '[{"key":"color:red","title":"Red","choices":[{"axisKey":"color","valueKey":"red"}]}]'
)) from commerce_product_matrix_test.products where label = 'direct-race';

select commerce_product_matrix_test.wait_until_blocked('matrix_direct_a');
select commerce_product_matrix_test.wait_until_blocked('matrix_direct_b');
commit;
