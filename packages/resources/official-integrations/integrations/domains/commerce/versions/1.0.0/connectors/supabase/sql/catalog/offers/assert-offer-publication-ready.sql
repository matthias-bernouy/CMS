

create or replace function commerce.assert_offer_publication_ready(
    p_seller_id bigint,
    p_product_id bigint,
    p_variant_id bigint,
    p_workflow_state text,
    p_price_amount bigint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_seller commerce.sellers%rowtype;
begin
    if p_price_amount is null or p_price_amount < 0 then
        raise exception 'validation: a non-negative accepted price is required for publication';
    end if;
    select * into v_settings from commerce.settings where id = 'default';
    select * into v_seller from commerce.sellers where id = p_seller_id;
    if not found then raise exception 'not_found: seller'; end if;
    if v_seller.verification_status in ('rejected', 'suspended') then
        raise exception 'forbidden: seller is not allowed to publish';
    end if;
    if v_settings.mode = 'ecommerce' and v_seller.kind = 'user' then
        raise exception 'forbidden: marketplace offers are disabled';
    end if;
    if not exists (
        select 1 from commerce.products
        where id = p_product_id and status = 'active' and visibility = 'public'
    ) then raise exception 'validation: an active public product is required for publication'; end if;
    perform commerce.assert_product_variant_ready(p_product_id, p_variant_id);
    if not exists (
        select 1 from commerce.offer_workflow_states
        where code = p_workflow_state and phase = 'ready' and enabled
    ) then raise exception 'validation: a ready workflow state is required for publication'; end if;
end;
$$;