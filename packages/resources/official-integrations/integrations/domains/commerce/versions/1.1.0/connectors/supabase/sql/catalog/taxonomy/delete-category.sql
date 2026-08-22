

create or replace function commerce.delete_category(p_category_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_category commerce.categories%rowtype;
begin
    select * into v_category from commerce.categories where id = p_category_id for update;
    if not found then raise exception 'not_found: category not found'; end if;
    if exists (select 1 from commerce.categories where parent_id = p_category_id) then
        raise exception 'conflict: category has child categories';
    end if;
    if exists (
        select 1 from commerce.product_categories where category_id = p_category_id
    ) then raise exception 'conflict: category is used by at least one product'; end if;
    delete from commerce.categories where id = p_category_id;
    return jsonb_build_object('id', p_category_id, 'deleted', true);
end;
$$;