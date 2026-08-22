

create or replace function commerce.complete_outbox_event(
    p_event_id bigint,
    p_worker_id text,
    p_succeeded boolean,
    p_error text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_event commerce.outbox_events%rowtype;
begin
    update commerce.outbox_events set
        status = case when p_succeeded then 'delivered' else 'failed' end,
        delivered_at = case when p_succeeded then now() else null end,
        available_at = case when p_succeeded then available_at
            else now() + make_interval(secs => least(3600, attempts * attempts * 30)) end,
        last_error = case when p_succeeded then null else p_error end
    where id = p_event_id and status = 'processing' and claimed_by = p_worker_id
    returning * into v_event;
    if not found then raise exception 'conflict: outbox event is not owned by worker'; end if;
    return to_jsonb(v_event);
end;
$$;