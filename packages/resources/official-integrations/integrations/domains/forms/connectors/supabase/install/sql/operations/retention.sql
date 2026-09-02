create or replace function forms.purge_expired_submissions(
    p_retention_days integer,
    p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_count integer;
begin
    if p_retention_days < 1 or p_retention_days > 3650 then
        raise exception 'validation: retentionDays must be between 1 and 3650';
    end if;
    with candidates as (
        select id
        from forms.submissions
        where created_at < now() - make_interval(days => p_retention_days)
        order by created_at, id
        for update skip locked
        limit least(greatest(coalesce(p_batch_size, 500), 1), 2000)
    ), deleted as (
        delete from forms.submissions s
        using candidates c
        where s.id = c.id
        returning s.id
    )
    select count(*) into deleted_count from deleted;
    return jsonb_build_object('ok', true, 'deleted', deleted_count);
end;
$$;
