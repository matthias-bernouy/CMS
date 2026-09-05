create or replace function commerce.review_marketplace_service_withdrawal_request(
    p_request_public_id uuid,
    p_next_status text,
    p_resolution text,
    p_actor_id text,
    p_note text,
    p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_request commerce.marketplace_service_withdrawal_requests%rowtype;
    v_previous_status text;
    v_actor text := nullif(btrim(p_actor_id), '');
    v_note text := nullif(btrim(p_note), '');
begin
    if p_request_public_id is null then
        raise exception 'validation: request public id is required';
    end if;
    if v_actor is null then
        raise exception 'forbidden: missing review actor';
    end if;
    if v_note is null or length(v_note) > 4000 then
        raise exception 'validation: review note is required and must not exceed 4000 characters';
    end if;
    if p_expected_version is null or p_expected_version <= 0 then
        raise exception 'validation: expected version is required';
    end if;
    if p_next_status not in ('under_review', 'information_requested', 'resolved') then
        raise exception 'validation: unsupported service withdrawal status';
    end if;
    if p_next_status = 'resolved' then
        if p_resolution is null or p_resolution not in ('accepted', 'rejected', 'no_action') then
            raise exception 'validation: a supported resolution is required';
        end if;
    elsif p_resolution is not null then
        raise exception 'validation: resolution is only allowed for a resolved request';
    end if;

    select * into v_request
    from commerce.marketplace_service_withdrawal_requests
    where public_id = p_request_public_id
    for update;
    if not found then
        raise exception 'not_found: service withdrawal request';
    end if;
    if v_request.version <> p_expected_version then
        raise exception 'conflict: stale service withdrawal request version';
    end if;
    if v_request.status = 'resolved' then
        raise exception 'conflict: service withdrawal request is already resolved';
    end if;
    if v_request.status = p_next_status then
        raise exception 'conflict: service withdrawal request status is unchanged';
    end if;

    v_previous_status := v_request.status;
    update commerce.marketplace_service_withdrawal_requests
    set
        status = p_next_status,
        resolution = case when p_next_status = 'resolved' then p_resolution else null end,
        last_reviewed_at = clock_timestamp(),
        last_reviewed_by = v_actor,
        review_note = v_note,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = v_request.id
      and version = p_expected_version
    returning * into v_request;
    if not found then
        raise exception 'conflict: stale service withdrawal request version';
    end if;

    insert into commerce.marketplace_service_withdrawal_events (
        request_id, order_id, event_type, actor_kind, actor_id,
        previous_status, next_status, request_version, note, data
    ) values (
        v_request.id, v_request.order_id, 'reviewed', 'admin', v_actor,
        v_previous_status, v_request.status, v_request.version, v_note,
        jsonb_build_object('resolution', v_request.resolution)
    );
    perform commerce.append_financial_event(
        v_request.order_id,
        'marketplace_service_withdrawal_request',
        v_request.id::text,
        'service_withdrawal_reviewed',
        'admin',
        v_actor,
        v_note,
        jsonb_build_object(
            'previousStatus', v_previous_status,
            'nextStatus', v_request.status,
            'resolution', v_request.resolution,
            'requestVersion', v_request.version
        ),
        'commerce.marketplace_service_withdrawal.reviewed',
        'service-withdrawal:' || v_request.id || ':review:' || v_request.version
    );

    return commerce.marketplace_service_withdrawal_request_read_model(v_request.id);
end;
$$;

comment on function commerce.review_marketplace_service_withdrawal_request(
    uuid, text, text, text, text, integer
) is
    'CAS review decision only. Financial and order effects require independent authorized workflows.';
