create or replace function consent.prune_expired_consent_intents(
    p_context_key text,
    p_limit integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
    v_deleted integer;
begin
    with victims as materialized (
        select intent.context_key, intent.attempt_id
        from consent.acceptance_intents intent
        where intent.context_key = p_context_key
          and intent.expires_at <= now()
          and not exists (
              select 1
              from consent.acceptances acceptance
              where acceptance.context_key = intent.context_key
                and acceptance.attempt_id = intent.attempt_id
          )
        order by intent.expires_at, intent.attempt_id
        limit v_limit
        for update skip locked
    ), deleted as (
        delete from consent.acceptance_intents intent
        using victims
        where intent.context_key = victims.context_key
          and intent.attempt_id = victims.attempt_id
        returning 1
    )
    select count(*) into v_deleted from deleted;
    return v_deleted;
end;
$$;
