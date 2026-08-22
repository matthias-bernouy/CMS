

create or replace function commerce.get_product_read_model(
    p_scope text,
    p_product_id bigint default null,
    p_slug text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select case
        when p_scope is null or p_scope not in ('public', 'admin')
            then jsonb_build_object('state', 'invalid_scope')
        else coalesce(
            jsonb_build_object('state', 'ok') || commerce.product_read_bundle(
                p_product_id,
                p_slug,
                p_scope = 'public',
                p_scope = 'public'
            ),
            jsonb_build_object('state', 'not_found')
        )
    end;
$$;

create or replace function commerce.upsert_product_read_model(
    p_product_id bigint,
    p_payload jsonb,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_product jsonb;
    v_bundle jsonb;
begin
    v_product := commerce.upsert_product(p_product_id, p_payload, p_expected_version);
    v_bundle := commerce.product_read_bundle((v_product->>'id')::bigint, null, false, false);
    if v_bundle is null then
        raise exception 'not_found: product';
    end if;
    return jsonb_build_object('state', 'ok') || v_bundle;
end;
$$;