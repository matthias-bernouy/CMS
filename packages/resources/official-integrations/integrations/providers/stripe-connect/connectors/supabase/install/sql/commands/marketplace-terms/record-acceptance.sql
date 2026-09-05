

create or replace function stripe_connect.record_marketplace_terms_acceptance(
    p_cms_user_id text,
    p_terms_version text,
    p_terms_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_acceptance stripe_connect.marketplace_terms_acceptances%rowtype;
    v_version text := btrim(coalesce(p_terms_version, ''));
    v_hash text := lower(btrim(coalesce(p_terms_hash, '')));
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'validation: CMS user id is required';
    end if;
    if length(v_version) < 1 or length(v_version) > 200 then
        raise exception 'validation: marketplace terms version is invalid';
    end if;
    if v_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'validation: marketplace terms hash must be a SHA-256 hex digest';
    end if;

    select * into v_account
    from stripe_connect.accounts
    where cms_user_id = p_cms_user_id
    for update;
    if not found then
        raise exception 'not_found: Stripe Connect account';
    end if;

    insert into stripe_connect.marketplace_terms_acceptances (
        cms_user_id, terms_version, terms_hash
    ) values (
        p_cms_user_id, v_version, v_hash
    )
    on conflict (cms_user_id, terms_version) do nothing;

    select * into v_acceptance
    from stripe_connect.marketplace_terms_acceptances
    where cms_user_id = p_cms_user_id
      and terms_version = v_version;
    if v_acceptance.terms_hash is distinct from v_hash then
        raise exception 'conflict: marketplace terms version is already bound to another document hash';
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
        'accepted_at', v_acceptance.accepted_at
    );
end;
$$;
