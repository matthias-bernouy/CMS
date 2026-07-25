create or replace function sales_configurator.transition_admin_proposal(
    p_actor_cms_user_id text,
    p_proposal_id bigint,
    p_status text
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
    v_target_status text := pg_catalog.lower(pg_catalog.btrim(p_status));
    v_proposal sales_configurator.proposals%rowtype;
    v_revoked_share record;
begin
    if v_target_status not in (
        'draft',
        'shared',
        'viewed',
        'accepted',
        'rejected',
        'expired',
        'archived'
    ) then
        raise exception 'validation: unknown proposal status';
    end if;

    select proposal.*
    into v_proposal
    from sales_configurator.proposals proposal
    where proposal.id = p_proposal_id
    for update;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    if v_proposal.status = v_target_status then
        return sales_configurator.admin_proposal_json(v_proposal.id);
    end if;

    if not (
        (v_proposal.status = 'draft' and v_target_status = 'archived')
        or (
            v_proposal.status in ('shared', 'viewed')
            and v_target_status in (
                'accepted',
                'rejected',
                'expired',
                'archived'
            )
        )
        or (
            v_proposal.status in ('accepted', 'rejected', 'expired')
            and v_target_status = 'archived'
        )
    ) then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'invalid_status_transition',
            'fromStatus', v_proposal.status,
            'toStatus', v_target_status
        );
    end if;

    if v_target_status in (
        'accepted',
        'rejected',
        'expired',
        'archived'
    ) then
        for v_revoked_share in
            update sales_configurator.proposal_shares share
            set revoked_at = pg_catalog.clock_timestamp()
            from sales_configurator.proposal_versions version
            where version.id = share.proposal_version_id
              and version.proposal_id = v_proposal.id
              and share.revoked_at is null
            returning share.id, share.proposal_version_id
        loop
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
                v_revoked_share.proposal_version_id,
                v_revoked_share.id,
                'share_revoked',
                'admin',
                v_actor,
                pg_catalog.jsonb_build_object(
                    'reason', 'proposal_status_changed',
                    'status', v_target_status
                )
            );
        end loop;
    end if;

    update sales_configurator.proposals proposal
    set status = v_target_status
    where proposal.id = v_proposal.id;

    insert into sales_configurator.proposal_events (
        proposal_id,
        event_type,
        actor_type,
        actor_id,
        metadata
    )
    values (
        v_proposal.id,
        'status_changed',
        'admin',
        v_actor,
        pg_catalog.jsonb_build_object(
            'fromStatus', v_proposal.status,
            'toStatus', v_target_status
        )
    );

    return sales_configurator.admin_proposal_json(v_proposal.id);
end;
$$;
