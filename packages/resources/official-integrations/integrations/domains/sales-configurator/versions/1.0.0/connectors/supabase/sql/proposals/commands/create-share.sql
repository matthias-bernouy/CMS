create or replace function sales_configurator.create_partner_proposal_share(
    p_actor_cms_user_id text,
    p_proposal_id bigint,
    p_expires_at timestamptz,
    p_token_hash text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_actor text := sales_configurator.require_bounded_text(
        p_actor_cms_user_id,
        'actorCmsUserId',
        512
    );
    v_token_hash text := pg_catalog.lower(pg_catalog.btrim(p_token_hash));
    v_proposal sales_configurator.proposals%rowtype;
    v_version_id bigint;
    v_share sales_configurator.proposal_shares%rowtype;
begin
    perform sales_configurator.require_partner(v_actor, 'proposals.share');

    if v_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'validation: tokenHash must be a SHA-256 hex digest';
    end if;
    if p_expires_at is not null
        and p_expires_at <= pg_catalog.clock_timestamp()
    then
        raise exception 'validation: expiresAt must be in the future';
    end if;

    select proposal.*
    into v_proposal
    from sales_configurator.proposals proposal
    where proposal.id = p_proposal_id
      and proposal.owner_cms_user_id = v_actor
    for update;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    if v_proposal.status in ('accepted', 'rejected', 'expired', 'archived') then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'proposal_is_terminal'
        );
    end if;

    select version.id
    into v_version_id
    from sales_configurator.proposal_versions version
    where version.proposal_id = v_proposal.id
      and version.state = 'published'
    for key share;
    if not found then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'proposal_is_not_published'
        );
    end if;

    insert into sales_configurator.proposal_shares (
        proposal_version_id,
        token_hash,
        expires_at
    )
    values (
        v_version_id,
        v_token_hash,
        p_expires_at
    )
    on conflict (token_hash) do nothing
    returning * into v_share;
    if not found then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'token_hash_exists'
        );
    end if;

    update sales_configurator.proposals proposal
    set status = 'shared'
    where proposal.id = v_proposal.id;

    insert into sales_configurator.proposal_events (
        proposal_id,
        proposal_version_id,
        share_id,
        event_type,
        actor_type,
        actor_id,
        metadata
    )
    values (
        v_proposal.id,
        v_version_id,
        v_share.id,
        'share_created',
        'partner',
        v_actor,
        pg_catalog.jsonb_build_object('expiresAt', v_share.expires_at)
    );

    return sales_configurator.partner_proposal_json(v_proposal.id, v_actor)
        || pg_catalog.jsonb_build_object(
            'share', pg_catalog.jsonb_build_object(
                'id', v_share.id,
                'proposalVersionId', v_share.proposal_version_id,
                'expiresAt', v_share.expires_at,
                'revokedAt', v_share.revoked_at,
                'firstViewedAt', v_share.first_viewed_at,
                'lastViewedAt', v_share.last_viewed_at,
                'viewCount', v_share.view_count,
                'createdAt', v_share.created_at
            )
        );
end;
$$;
