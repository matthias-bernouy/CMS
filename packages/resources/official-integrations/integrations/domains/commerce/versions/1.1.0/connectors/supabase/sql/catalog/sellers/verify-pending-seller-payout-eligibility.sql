

create or replace function commerce.verify_pending_seller_payout_eligibility(
    p_cms_user_id text,
    p_seller_id bigint,
    p_expected_version integer,
    p_provider text,
    p_provider_account_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_seller commerce.sellers%rowtype;
    v_provider text := lower(btrim(coalesce(p_provider, '')));
    v_provider_account_id text := btrim(coalesce(p_provider_account_id, ''));
    v_actor constant text := 'system:payout-eligibility';
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if v_provider !~ '^[a-z][a-z0-9_-]{0,31}$' then
        raise exception 'validation: invalid payout provider';
    end if;
    if length(v_provider_account_id) = 0 or length(v_provider_account_id) > 255 then
        raise exception 'validation: invalid payout provider account id';
    end if;

    select * into v_seller
    from commerce.sellers
    where id = p_seller_id
    for update;
    if not found or v_seller.kind <> 'user' or v_seller.cms_user_id is distinct from p_cms_user_id then
        raise exception 'not_found: seller';
    end if;

    if v_seller.verification_status = 'verified' then
        return jsonb_build_object(
            'seller', to_jsonb(v_seller),
            'transitioned', false,
            'idempotentReplay', true
        );
    end if;
    if v_seller.verification_status in ('rejected', 'suspended') then
        raise exception 'forbidden: seller payout eligibility cannot override marketplace review';
    end if;
    if v_seller.verification_status <> 'pending' then
        raise exception 'conflict: seller is not pending verification';
    end if;
    if p_expected_version is null or v_seller.version is distinct from p_expected_version then
        raise exception 'conflict: stale seller version';
    end if;

    update commerce.sellers
    set verification_status = 'verified',
        verified_at = now(),
        verified_by = v_actor
    where id = v_seller.id
    returning * into v_seller;

    insert into commerce.seller_verification_events (
        seller_id, previous_status, next_status, actor_id, reason, data
    ) values (
        v_seller.id,
        'pending',
        'verified',
        v_actor,
        'Payout provider eligibility verified server-side',
        jsonb_build_object(
            'provider', v_provider,
            'providerAccountId', v_provider_account_id,
            'eligibility', 'can_receive_protected_payments'
        )
    );

    return jsonb_build_object(
        'seller', to_jsonb(v_seller),
        'transitioned', true,
        'idempotentReplay', false
    );
end;
$$;