create or replace function stripe_connect.publish_marketplace_terms_configuration(
    p_document jsonb,
    p_actor_id text,
    p_expected_version text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_current_version text;
begin
    if length(btrim(coalesce(p_expected_version, ''))) not between 1 and 200 then
        raise exception 'validation: marketplace terms expected version is invalid';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe-connect:marketplace-terms', 0)
    );
    select coalesce(version.terms_version, configuration.legacy_terms_version)
    into v_current_version
    from stripe_connect.marketplace_terms_configuration configuration
    left join stripe_connect.marketplace_terms_versions version
      on version.id = configuration.current_terms_version_id
    where configuration.singleton;
    if found and v_current_version is distinct from p_expected_version then
        raise exception 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED';
    end if;
    if not found and p_expected_version <> 'new' then
        raise exception 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED';
    end if;
    return stripe_connect.sync_marketplace_terms_configuration(
        p_document,
        null,
        null,
        p_actor_id
    );
end;
$$;
