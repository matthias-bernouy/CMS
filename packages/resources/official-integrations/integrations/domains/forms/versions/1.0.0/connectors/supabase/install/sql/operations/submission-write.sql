create or replace function forms.submit_form(
    p_form_key text,
    p_version integer,
    p_idempotency_key text,
    p_session_id uuid,
    p_answers jsonb,
    p_actor_id text default null,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_form forms.forms%rowtype;
    version_access text;
    submission_row forms.submissions%rowtype;
begin
    select f.* into target_form
    from forms.forms f
    where f.form_key = p_form_key and f.lifecycle_status = 'active'
    for share;
    if not found then
        raise exception 'not_found: form is not available';
    end if;
    select v.access_mode into version_access
    from forms.form_versions v
    where v.form_id = target_form.id and v.version_number = p_version;
    if not found then
        raise exception 'not_found: form version is not available';
    end if;
    if version_access = 'authenticated' and nullif(btrim(p_actor_id), '') is null then
        raise exception 'not_found: form is not available';
    end if;

    insert into forms.submissions (
        form_id, form_version, idempotency_key, session_id, answers, submitted_by, metadata
    ) values (
        target_form.id, p_version, p_idempotency_key, p_session_id, p_answers, p_actor_id, p_metadata
    )
    on conflict (form_id, idempotency_key) do nothing
    returning * into submission_row;

    if submission_row.id is null then
        select * into submission_row
        from forms.submissions
        where form_id = target_form.id and idempotency_key = p_idempotency_key;
        if submission_row.answers <> p_answers
           or submission_row.form_version <> p_version
           or submission_row.session_id <> p_session_id then
            raise exception 'conflict: idempotency key was already used with different answers';
        end if;
    end if;
    return jsonb_build_object('ok', true, 'receiptId', submission_row.receipt_id);
end;
$$;

create or replace function forms.update_submission_status(
    p_submission_id bigint,
    p_status text,
    p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    update forms.submissions s set status = p_status, updated_by = p_actor_id
    from forms.forms f
    where s.id = p_submission_id and f.id = s.form_id
    returning jsonb_build_object(
        'id', s.id,
        'receiptId', s.receipt_id,
        'formKey', f.form_key,
        'formVersion', s.form_version,
        'status', s.status,
        'answers', s.answers,
        'submittedBy', s.submitted_by,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
    ) into result;
    if result is null then
        raise exception 'not_found: submission does not exist';
    end if;
    return result;
end;
$$;
