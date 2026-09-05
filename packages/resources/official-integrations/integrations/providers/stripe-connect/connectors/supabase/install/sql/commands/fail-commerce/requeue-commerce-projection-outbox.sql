

create or replace function stripe_connect.requeue_commerce_projection_outbox(
    p_projection_id bigint,
    p_expected_intervention_revision bigint,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_projection stripe_connect.commerce_projection_outbox%rowtype;
    v_previous_status text;
begin
    if p_projection_id is null or p_projection_id <= 0
        or p_expected_intervention_revision is null or p_expected_intervention_revision < 0
        or nullif(btrim(p_actor_id), '') is null
        or nullif(btrim(p_reason), '') is null
    then
        raise exception 'validation: invalid Commerce projection intervention';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:commerce_projection:' || p_projection_id, 0)
    );
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where id = p_projection_id
    for update;
    if not found then raise exception 'not_found: Commerce projection'; end if;
    if v_projection.intervention_revision is distinct from p_expected_intervention_revision then
        raise exception 'conflict: stale Commerce projection intervention revision';
    end if;
    if v_projection.projection_status <> 'manual_review' then
        raise exception 'conflict: Commerce projection is not awaiting Finance intervention';
    end if;
    v_previous_status := v_projection.projection_status;
    update stripe_connect.commerce_projection_outbox
    set projection_status = 'retry',
        attempt_count = 0,
        next_attempt_at = now(),
        claim_owner = null,
        claim_token = null,
        claimed_at = null,
        intervention_revision = intervention_revision + 1,
        last_intervention_at = now(),
        last_intervention_by = p_actor_id,
        last_intervention_reason = left(p_reason, 2000)
    where id = p_projection_id
    returning * into v_projection;
    insert into stripe_connect.commerce_projection_interventions (
        projection_id, intervention_revision, action, actor_id, reason,
        previous_status, next_status
    ) values (
        v_projection.id, v_projection.intervention_revision, 'requeue',
        p_actor_id, left(p_reason, 2000), v_previous_status, v_projection.projection_status
    );
    return to_jsonb(v_projection);
end;
$$;
