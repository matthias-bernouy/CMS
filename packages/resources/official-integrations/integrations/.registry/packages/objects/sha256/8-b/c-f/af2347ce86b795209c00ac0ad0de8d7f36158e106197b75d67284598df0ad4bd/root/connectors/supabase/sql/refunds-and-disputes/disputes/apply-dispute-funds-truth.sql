

create or replace function stripe_connect.apply_dispute_funds_truth(
    p_stripe_dispute_id text,
    p_event_at timestamptz,
    p_event_id text,
    p_funds_withdrawn boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_dispute stripe_connect.stripe_disputes%rowtype;
begin
    if nullif(btrim(p_stripe_dispute_id), '') is null
        or p_event_at is null
        or nullif(btrim(p_event_id), '') is null
        or p_funds_withdrawn is null
    then
        raise exception 'validation: invalid dispute funds truth';
    end if;
    select * into v_dispute
    from stripe_connect.stripe_disputes
    where stripe_dispute_id = p_stripe_dispute_id
    for update;
    if not found then raise exception 'not_found: Stripe dispute'; end if;
    if v_dispute.last_funds_event_at is null or p_event_at > v_dispute.last_funds_event_at then
        update stripe_connect.stripe_disputes
        set funds_withdrawn = p_funds_withdrawn,
            last_funds_event_at = p_event_at,
            last_funds_event_id = p_event_id
        where id = v_dispute.id
        returning * into v_dispute;
    elsif p_event_at = v_dispute.last_funds_event_at
        and p_funds_withdrawn is distinct from v_dispute.funds_withdrawn
    then
        update stripe_connect.stripe_disputes
        set funds_withdrawn = true,
            last_funds_event_id = 'same-second-conflict'
        where id = v_dispute.id
        returning * into v_dispute;
    end if;
    return to_jsonb(v_dispute);
end;
$$;