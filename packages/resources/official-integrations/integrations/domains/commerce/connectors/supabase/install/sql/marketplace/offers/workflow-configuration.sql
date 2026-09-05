

create or replace function commerce.upsert_offer_condition(
    p_code text,
    p_label text,
    p_description text default null,
    p_position integer default 0,
    p_enabled boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_condition commerce.offer_conditions%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended('commerce-offer-conditions', 0));
    if not exists (select 1 from commerce.offer_conditions where code = p_code)
        and (select count(*) from commerce.offer_conditions) >= 32 then
        raise exception 'validation: at most 32 offer conditions are allowed';
    end if;
    insert into commerce.offer_conditions (code, label, description, position, enabled)
    values (p_code, p_label, p_description, p_position, p_enabled)
    on conflict (code) do update
    set label = excluded.label, description = excluded.description,
        position = excluded.position, enabled = excluded.enabled
    returning * into v_condition;
    return to_jsonb(v_condition);
end;
$$;

create or replace function commerce.upsert_workflow_state(
    p_code text,
    p_label text,
    p_phase text,
    p_position integer default 0,
    p_enabled boolean default true,
    p_terminal boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_state commerce.offer_workflow_states%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended('commerce-offer-workflow', 0));
    select * into v_state from commerce.offer_workflow_states where code = p_code for update;
    if found and p_code in (
        'draft', 'pending_review', 'changes_requested', 'awaiting_seller_price',
        'awaiting_final_approval', 'approved', 'rejected', 'archived'
    ) and (
        v_state.phase is distinct from p_phase
        or v_state.enabled is distinct from p_enabled
        or v_state.terminal is distinct from p_terminal
    ) then raise exception 'conflict: reserved workflow state behavior is immutable'; end if;
    perform id from commerce.offers
    where workflow_state = p_code
    order by id
    for update;
    if not exists (select 1 from commerce.offer_workflow_states where code = p_code)
        and (select count(*) from commerce.offer_workflow_states) >= 16 then
        raise exception 'validation: at most 16 workflow states are allowed';
    end if;
    if p_code in (
        'draft', 'pending_review', 'changes_requested', 'awaiting_seller_price',
        'awaiting_final_approval', 'approved', 'rejected', 'archived'
    ) then
        update commerce.offer_workflow_states
        set label = p_label, position = p_position
        where code = p_code
        returning * into v_state;
        if not found then raise exception 'conflict: reserved workflow state is missing'; end if;
    else
        insert into commerce.offer_workflow_states (code, label, phase, position, enabled, terminal)
        values (p_code, p_label, p_phase, p_position, p_enabled, p_terminal)
        on conflict (code) do update
        set label = excluded.label, phase = excluded.phase, position = excluded.position,
            enabled = excluded.enabled, terminal = excluded.terminal
        returning * into v_state;
    end if;
    if not v_state.enabled or v_state.phase <> 'ready' then
        update commerce.offers
        set publication_status = 'paused'
        where workflow_state = v_state.code and publication_status = 'active';
    end if;
    return to_jsonb(v_state);
end;
$$;

create or replace function commerce.upsert_workflow_transition(
    p_from_state text,
    p_action text,
    p_actor_kind text,
    p_to_state text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_transition commerce.offer_workflow_transitions%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended('commerce-offer-workflow', 0));
    if p_actor_kind not in ('seller', 'admin') then
        raise exception 'validation: configurable transitions support seller or admin actors';
    end if;
    if p_actor_kind = 'seller' and p_action not in ('submit', 'submit_price') then
        raise exception 'conflict: custom seller transitions are not executable';
    end if;
    if p_action in ('pause', 'archive', 'publish') then
        raise exception 'conflict: commerce command names cannot be configured as transitions';
    end if;
    if p_action in ('submit', 'submit_price', 'request_price', 'request_changes', 'approve', 'reject')
        and (p_from_state, p_action, p_actor_kind, p_to_state) not in (
            ('draft', 'submit', 'seller', 'pending_review'),
            ('changes_requested', 'submit', 'seller', 'pending_review'),
            ('pending_review', 'request_changes', 'admin', 'changes_requested'),
            ('pending_review', 'request_price', 'admin', 'awaiting_seller_price'),
            ('pending_review', 'approve', 'admin', 'approved'),
            ('awaiting_seller_price', 'submit_price', 'seller', 'awaiting_final_approval'),
            ('awaiting_final_approval', 'approve', 'admin', 'approved'),
            ('pending_review', 'reject', 'admin', 'rejected'),
            ('awaiting_final_approval', 'reject', 'admin', 'rejected')
        ) then
        raise exception 'conflict: commerce side-effect transitions are reserved';
    end if;
    if not exists (
        select 1 from commerce.offer_workflow_transitions
        where from_state = p_from_state and action = p_action and actor_kind = p_actor_kind
    ) and (select count(*) from commerce.offer_workflow_transitions) >= 64 then
        raise exception 'validation: at most 64 workflow transitions are allowed';
    end if;
    select * into v_transition
    from commerce.offer_workflow_transitions
    where from_state = p_from_state and action = p_action and actor_kind = p_actor_kind
    for update;
    if found and p_action in ('submit', 'submit_price', 'request_price', 'request_changes', 'approve', 'reject')
        and v_transition.to_state <> p_to_state then
        raise exception 'conflict: transitions with commerce side effects are immutable';
    end if;
    insert into commerce.offer_workflow_transitions (from_state, action, actor_kind, to_state)
    values (p_from_state, p_action, p_actor_kind, p_to_state)
    on conflict (from_state, action, actor_kind) do update set to_state = excluded.to_state
    returning * into v_transition;
    return to_jsonb(v_transition);
end;
$$;