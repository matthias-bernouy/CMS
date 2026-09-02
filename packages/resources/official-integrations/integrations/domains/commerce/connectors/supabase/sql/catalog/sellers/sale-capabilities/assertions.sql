create or replace function commerce.seller_has_required_sale_capabilities(
    p_seller_id bigint
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select exists (
        select 1
        from commerce.sellers seller
        where seller.id = p_seller_id
    ) and not exists (
        select 1
        from commerce.sale_capability_requirements requirement
        join commerce.sellers seller
          on seller.id = p_seller_id
         and seller.kind = requirement.seller_kind
        left join commerce.seller_sale_capabilities capability
          on capability.seller_id = seller.id
         and capability.capability_key = requirement.capability_key
        where requirement.enabled
          and coalesce(capability.ready, false) is not true
    );
$$;

create or replace function commerce.assert_required_seller_sale_capabilities(
    p_seller_id bigint
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    if not commerce.seller_has_required_sale_capabilities(p_seller_id) then
        raise exception 'conflict: seller protected sale capability is not ready';
    end if;
end;
$$;
