\set ON_ERROR_STOP on
-- PostgreSQL must preload pg_stat_statements so nested PL/pgSQL calls are observable.
create extension if not exists pg_stat_statements;

create function pg_temp.assert_checkout_budget(p_max_nested bigint, p_max_non_fk bigint)
returns void language plpgsql as $$
declare
    v_nested bigint;
    v_non_fk bigint;
begin
    select
        coalesce(sum(statements.calls) filter (where not statements.toplevel), 0),
        coalesce(sum(statements.calls) filter (
            where not statements.toplevel
              and statements.query not like 'SELECT $% FROM ONLY %'
        ), 0)
    into v_nested, v_non_fk
    from pg_stat_statements statements
    where statements.dbid = (
        select database.oid
        from pg_database database
        where database.datname = current_database()
    ) and statements.query not ilike '%pg_stat_statements%';

    if v_nested > p_max_nested or v_non_fk > p_max_non_fk then
        raise exception
            'checkout budget: expected at most % nested/% non-FK statements, got %/%',
            p_max_nested, p_max_non_fk, v_nested, v_non_fk;
    end if;
end;
$$;

begin;
set local role service_role;

insert into commerce.products (slug, title, status, visibility)
values ('checkout-budget-product', 'Checkout budget product', 'active', 'public')
returning id as product_id \gset

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
)
select
    'user',
    'checkout-budget-seller-' || to_char(number, 'FM000'),
    'checkout-budget-seller-' || to_char(number, 'FM000'),
    'Checkout budget seller ' || number,
    'verified', now(), 'checkout-budget-test'
from generate_series(1, 100) number;

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount,
    currency, availability, quantity_available
)
select
    seller.id,
    :product_id,
    'checkout-budget-offer-' || right(seller.slug, 3),
    'Checkout budget offer ' || right(seller.slug, 3),
    'good', 'active', 'approved',
    1000 + right(seller.slug, 3)::integer,
    'eur', 'available', 2
from commerce.sellers seller
where seller.slug like 'checkout-budget-seller-%'
order by seller.id;

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount,
    currency, availability, quantity_available
)
select
    seller.id, :product_id, 'checkout-budget-offer-001-extra',
    'Checkout budget offer 001 extra', 'good', 'active', 'approved',
    1501, 'eur', 'available', 2
from commerce.sellers seller
where seller.slug = 'checkout-budget-seller-001';

insert into commerce.carts (buyer_cms_user_id, status, currency, version)
values ('checkout-budget-buyer', 'open', 'eur', 7)
returning id as cart_id \gset

insert into commerce.cart_items (
    cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
)
select :cart_id, offer.id, 1, offer.accepted_price_amount, offer.version
from commerce.offers offer
where offer.slug like 'checkout-budget-offer-%'
order by offer.id;

reset role;
set pg_stat_statements.track = 'all';
select pg_stat_statements_reset();
set local role service_role;
select jsonb_array_length(commerce.checkout_cart(
    'checkout-budget-buyer',
    'checkout-budget-key',
    7,
    '{"city":"Paris","line1":null}'::jsonb,
    '{"city":"Lyon"}'::jsonb,
    '{}'::jsonb
)->'orders') as order_count;
reset role;
-- The first ceiling includes PostgreSQL's 1,311 referential-integrity checks.
select pg_temp.assert_checkout_budget(1440, 129);

select pg_stat_statements_reset();
set local role service_role;
select (commerce.checkout_cart(
    'checkout-budget-buyer',
    'checkout-budget-key',
    7,
    '{"city":"Paris","line1":null}'::jsonb,
    '{"city":"Lyon"}'::jsonb,
    '{}'::jsonb
)->>'idempotent_replay')::boolean as idempotent_replay;
reset role;
select pg_temp.assert_checkout_budget(5, 5);

rollback;
