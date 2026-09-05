drop function if exists stripe_connect.record_current_marketplace_terms_acceptance(text);
create or replace function stripe_connect.record_current_marketplace_terms_acceptance(
    p_cms_user_id text,
    p_expected_version text default null,
    p_expected_hash text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_configuration stripe_connect.marketplace_terms_configuration%rowtype;
    v_version stripe_connect.marketplace_terms_versions%rowtype;
    v_acceptance stripe_connect.marketplace_terms_acceptances%rowtype;
    v_current_version text;
    v_current_hash text;
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'validation: CMS user id is required';
    end if;

    select * into v_account
    from stripe_connect.accounts
    where cms_user_id = p_cms_user_id
    for update;
    if not found then
        raise exception 'not_found: Stripe Connect account';
    end if;

    select * into v_configuration
    from stripe_connect.marketplace_terms_configuration
    where singleton
    for share;
    if not found then
        raise exception 'conflict: current marketplace terms are not configured';
    end if;

    if (p_expected_version is null) <> (p_expected_hash is null) then
        raise exception 'validation: expected marketplace terms version and hash must be provided together';
    end if;

    if v_configuration.current_terms_version_id is not null then
        select * into strict v_version
        from stripe_connect.marketplace_terms_versions
        where id = v_configuration.current_terms_version_id;
        v_current_version := v_version.terms_version;
        v_current_hash := v_version.content_hash;
        if p_expected_version is null or p_expected_hash is null then
            raise exception 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED';
        end if;
    else
        v_current_version := v_configuration.legacy_terms_version;
        v_current_hash := v_configuration.legacy_terms_hash;
    end if;

    if p_expected_version is not null and (
        p_expected_version is distinct from v_current_version
        or lower(p_expected_hash) is distinct from v_current_hash
    ) then
        raise exception 'conflict: MARKETPLACE_TERMS_VERSION_CHANGED';
    end if;

    insert into stripe_connect.marketplace_terms_acceptances (
        cms_user_id,
        terms_version,
        terms_hash,
        terms_version_id
    ) values (
        p_cms_user_id,
        v_current_version,
        v_current_hash,
        v_configuration.current_terms_version_id
    )
    on conflict (cms_user_id, terms_version) do nothing;

    select * into strict v_acceptance
    from stripe_connect.marketplace_terms_acceptances
    where cms_user_id = p_cms_user_id
      and terms_version = v_current_version;
    if v_acceptance.terms_hash is distinct from v_current_hash
        or v_acceptance.terms_version_id
            is distinct from v_configuration.current_terms_version_id then
        raise exception 'conflict: marketplace terms acceptance evidence does not match the configured revision';
    end if;

    if v_account.marketplace_terms_accepted_at is null
        or v_acceptance.accepted_at >= v_account.marketplace_terms_accepted_at then
        update stripe_connect.accounts
        set marketplace_terms_version = v_acceptance.terms_version,
            marketplace_terms_hash = v_acceptance.terms_hash,
            marketplace_terms_accepted_at = v_acceptance.accepted_at
        where cms_user_id = p_cms_user_id;
    end if;

    return jsonb_build_object(
        'cms_user_id', v_acceptance.cms_user_id,
        'terms_version', v_acceptance.terms_version,
        'terms_hash', v_acceptance.terms_hash,
        'terms_version_id', v_acceptance.terms_version_id,
        'accepted_at', v_acceptance.accepted_at
    );
end;
$$;
