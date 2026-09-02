reset role;

update commerce.offers set workflow_state = 'draft' where workflow_state = 'archived';
delete from commerce.offer_workflow_transitions
where from_state = 'archived' or to_state = 'archived';
delete from commerce.offer_workflow_states where code = 'archived';
update commerce.offer_workflow_states set terminal = false where terminal;
update commerce.offer_workflow_states set phase = 'terminal'
where phase in ('draft', 'ready', 'seller_input', 'admin_review');

set local role service_role;

do $empty_states$
declare
    result jsonb;
begin
    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'archived');
    perform pg_temp.assert_seller_page(
        result, array['seller-read-archive-pub'], 1, 'archived without matching state'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'rejected');
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'rejected without matching state'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'action_required');
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'action required without matching state'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'under_review');
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'under review without matching state'
    );

    result := commerce.list_seller_offers_read_model('seller-read-model-user', 'draft');
    perform pg_temp.assert_seller_page(
        result, array[]::text[], 0, 'draft without matching state'
    );
end;
$empty_states$;
