

create or replace function commerce.category_full_slug(p_parent_id bigint, p_slug text)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when p_parent_id is null then p_slug
        else (select category.full_slug from commerce.categories category where category.id = p_parent_id) || '/' || p_slug
    end;
$$;

create or replace function commerce.set_category_full_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.full_slug := commerce.category_full_slug(new.parent_id, new.slug);
    if new.full_slug is null then raise exception 'validation: category parent does not exist'; end if;
    return new;
end;
$$;

create or replace function commerce.cascade_category_full_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.full_slug is distinct from old.full_slug then
        update commerce.categories
        set full_slug = commerce.category_full_slug(new.id, slug)
        where parent_id = new.id;
    end if;
    return null;
end;
$$;