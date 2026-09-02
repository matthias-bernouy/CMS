do $filters$
declare
    result jsonb;
    product_id text;
    other_product_id text;
    variant_id text;
begin
    select product.id::text
    into product_id
    from commerce.products product
    where product.slug = 'seller-read-model-product';

    select product.id::text
    into other_product_id
    from commerce.products product
    where product.slug = 'seller-read-model-product-two';

    select variant.id::text
    into variant_id
    from commerce.product_variants variant
    where variant.sku = 'SELLER-READ-MODEL-V1';

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'all');
    perform pg_temp.assert_seller_page(result, array[
        'seller-read-ready', 'seller-read-draft', 'seller-read-action',
        'seller-read-rejected', 'seller-read-archive-state', 'seller-read-archive-pub',
        'seller-read-paused', 'seller-read-online', 'seller-read-custom-review',
        'seller-read-review-new', 'seller-read-review-old'
    ], 11, 'all status');

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'online');
    perform pg_temp.assert_seller_page(result, array['seller-read-online'], 1, 'online status');

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'paused');
    perform pg_temp.assert_seller_page(result, array['seller-read-paused'], 1, 'paused status');

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'archived');
    perform pg_temp.assert_seller_page(
        result, array['seller-read-archive-state', 'seller-read-archive-pub'], 2,
        'archived status'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'rejected');
    perform pg_temp.assert_seller_page(result, array['seller-read-rejected'], 1, 'rejected status');

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'action_required');
    perform pg_temp.assert_seller_page(
        result, array['seller-read-action'], 1, 'action required status'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'under_review');
    perform pg_temp.assert_seller_page(result, array[
        'seller-read-custom-review', 'seller-read-review-new', 'seller-read-review-old'
    ], 3, 'under review status including disabled dynamic state');

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'draft');
    perform pg_temp.assert_seller_page(result, array[
        'seller-read-ready', 'seller-read-draft', 'seller-read-archive-pub',
        'seller-read-paused', 'seller-read-online'
    ], 5, 'draft status');

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'online',
        p_publication_status => 'paused',
        p_workflow_state => 'approved'
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-online'], 1, 'online publication precedence'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'online',
        p_workflow_state => 'pending_review'
    );
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'online retains explicit workflow'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'under_review',
        p_publication_status => 'draft',
        p_workflow_state => 'draft'
    );
    perform pg_temp.assert_seller_page(result, array[
        'seller-read-custom-review', 'seller-read-review-new', 'seller-read-review-old'
    ], 3, 'review workflow precedence');

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'archived',
        p_publication_status => 'draft'
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-archive-state'], 1, 'archived explicit publication'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'archived',
        p_publication_status => 'draft',
        p_workflow_state => 'pending_review',
        p_query => 'Review'
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-review-new', 'seller-read-review-old'], 2,
        'search replaces archived or filter'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_status => 'under_review',
        p_condition_code => 'good',
        p_product_id => product_id
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-review-new', 'seller-read-review-old'], 2,
        'condition and product filters'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_product_id => other_product_id
    );
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'product filter excludes another product'
    );

    result := commerce.list_seller_offers_read_model(
        p_cms_user_id => 'seller-read-model-user',
        p_variant_id => variant_id
    );
    perform pg_temp.assert_seller_page(
        result, array['seller-read-review-old'], 1, 'variant filter'
    );
end;
$filters$;
