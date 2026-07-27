create or replace function consent.refresh_consent_context(
    p_context_key text,
    p_documents jsonb,
    p_actor_id text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
    select consent.materialize_consent_documents(
        p_context_key,
        p_documents,
        p_actor_id
    );
$$;
