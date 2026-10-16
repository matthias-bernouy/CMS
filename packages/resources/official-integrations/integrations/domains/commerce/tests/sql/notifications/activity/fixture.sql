update commerce.notification_configuration
set mode = 'builtin', admin_recipient_cms_user_ids = array['admin-1', 'admin-2', 'admin-1', '', ' '];
insert into commerce.sellers (kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by)
values ('user', 'seller-1', 'notification-seller', 'Seller One', 'verified', now(), 'contract');
insert into commerce.products (slug, title, status, visibility)
values ('notification-product', 'Notification product', 'active', 'public');
insert into commerce.offers (seller_id, product_id, slug, title, condition_code, currency, workflow_state,
    publication_status, accepted_price_amount, quantity_available)
select seller.id, product.id, fixture.slug, fixture.title, 'good', 'eur', fixture.state,
    fixture.publication, fixture.amount, 1
from (values
    ('review-offer', 'Review offer', 'draft', 'draft', null::bigint),
    ('rejected-offer', 'Rejected offer', 'pending_review', 'draft', null::bigint),
    ('automatic-offer', 'Automatic offer', 'pending_review', 'draft', null::bigint),
    ('negotiation-offer', 'Negotiation offer', 'approved', 'active', 10000::bigint),
    ('expiry-offer', 'Expiry offer', 'approved', 'active', 10000::bigint)
) fixture(slug, title, state, publication, amount)
cross join commerce.sellers seller cross join commerce.products product
where seller.cms_user_id = 'seller-1' and product.slug = 'notification-product';

create function pg_temp.assert_delivery(p_key text, p_user text, p_count bigint)
returns void language plpgsql as $$
declare v_count bigint;
begin
    select count(*) into v_count from commerce.notification_deliveries
    where rule_key = p_key and recipient_cms_user_id = p_user;
    if v_count <> p_count then
        raise exception 'delivery % to %: expected %, got %', p_key, p_user, p_count, v_count;
    end if;
end;
$$;
