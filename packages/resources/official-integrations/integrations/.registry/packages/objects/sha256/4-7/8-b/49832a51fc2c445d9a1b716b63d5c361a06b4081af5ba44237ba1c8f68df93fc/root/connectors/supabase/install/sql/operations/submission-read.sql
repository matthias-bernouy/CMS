create or replace function forms.list_submissions(
    p_form_key text default null,
    p_status text default null,
    p_limit integer default 100,
    p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    with page as (
        select s.*, f.form_key, count(*) over () as total_count
        from forms.submissions s
        join forms.forms f on f.id = s.form_id
        where (nullif(btrim(p_form_key), '') is null or f.form_key = p_form_key)
          and (nullif(btrim(p_status), '') is null or s.status = p_status)
        order by s.created_at desc, s.id desc
        limit least(greatest(coalesce(p_limit, 100), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0)
    )
    select jsonb_build_object(
        'items', coalesce(jsonb_agg(jsonb_build_object(
            'id', id,
            'receiptId', receipt_id,
            'formKey', form_key,
            'formVersion', form_version,
            'status', status,
            'answers', answers,
            'submittedBy', submitted_by,
            'createdAt', created_at,
            'updatedAt', updated_at
        ) order by created_at desc, id desc), '[]'::jsonb),
        'total', coalesce(max(total_count), 0)
    )
    from page;
$$;

create or replace function forms.get_submission(p_submission_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    select jsonb_build_object(
        'id', s.id,
        'receiptId', s.receipt_id,
        'formKey', f.form_key,
        'formVersion', s.form_version,
        'status', s.status,
        'answers', s.answers,
        'definition', v.definition,
        'submittedBy', s.submitted_by,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
    ) into result
    from forms.submissions s
    join forms.forms f on f.id = s.form_id
    join forms.form_versions v on v.form_id = s.form_id and v.version_number = s.form_version
    where s.id = p_submission_id;
    if result is null then
        raise exception 'not_found: submission does not exist';
    end if;
    return result;
end;
$$;
