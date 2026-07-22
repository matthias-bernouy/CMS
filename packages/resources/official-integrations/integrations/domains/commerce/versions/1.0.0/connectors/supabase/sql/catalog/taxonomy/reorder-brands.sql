

create or replace function commerce.reorder_brands(p_ids jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_count integer;
begin
    if jsonb_typeof(p_ids) <> 'array' then raise exception 'validation: ids must be an array'; end if;
    if jsonb_array_length(p_ids) > 200 then raise exception 'validation: too many brand ids'; end if;
    with ordered as (
        select value::bigint id, ordinality::integer - 1 position
        from jsonb_array_elements_text(p_ids) with ordinality
    ), updated as (
        update commerce.brands brand set position = ordered.position
        from ordered where brand.id = ordered.id returning brand.id
    ) select count(*) into v_count from updated;
    if v_count <> jsonb_array_length(p_ids) then raise exception 'validation: unknown or duplicate brand id'; end if;
    return jsonb_build_object('ids', p_ids);
end;
$$;