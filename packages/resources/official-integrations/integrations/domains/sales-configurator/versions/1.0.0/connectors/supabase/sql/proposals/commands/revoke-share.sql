create or replace function sales_configurator.revoke_partner_proposal_share(
    p_actor_cms_user_id text,
    p_proposal_id bigint,
    p_share_id bigint
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
    v_proposal sales_configurator.proposals%rowtype;
    v_share sales_configurator.proposal_shares%rowtype;
    v_revoked boolean := false;
begin
    perform sales_configurator.require_partner(v_actor, 'proposals.share');

    select proposal.*
    into v_proposal
    from sales_configurator.proposals proposal
    where proposal.id = p_proposal_id
      and proposal.owner_cms_user_id = v_actor
    for update;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    select share.*
    into v_share
    from sales_configurator.proposal_shares share
    join sales_configurator.proposal_versions version
      on version.id = share.proposal_version_id
    where share.id = p_share_id
      and version.proposal_id = v_proposal.id
    for update of share;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    if v_share.revoked_at is null then
        update sales_configurator.proposal_shares share
        set revoked_at = pg_catalog.clock_timestamp()
        where share.id = v_share.id
        returning * into v_share;
        v_revoked := true;

        insert into sales_configurator.proposal_events (
            proposal_id,
            proposal_version_id,
            share_id,
            event_type,
            actor_type,
            actor_id
        )
        values (
            v_proposal.id,
            v_share.proposal_version_id,
            v_share.id,
            'share_revoked',
            'partner',
            v_actor
        );

        if v_proposal.status in ('shared', 'viewed')
            and not exists (
                select 1
                from sales_configurator.proposal_shares active_share
                join sales_configurator.proposal_versions version
                  on version.id = active_share.proposal_version_id
                 and version.state = 'published'
                where version.proposal_id = v_proposal.id
                  and active_share.revoked_at is null
                  and (
                    active_share.expires_at is null
                    or active_share.expires_at > pg_catalog.clock_timestamp()
                  )
            )
        then
            update sales_configurator.proposals proposal
            set status = 'draft'
            where proposal.id = v_proposal.id;
        end if;
    end if;

    return sales_configurator.partner_proposal_json(v_proposal.id, v_actor)
        || pg_catalog.jsonb_build_object(
            'revoked', v_revoked,
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
