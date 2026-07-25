drop function if exists sales_configurator.publish_partner_proposal(
    text,
    bigint,
    bigint
);

create or replace function sales_configurator.publish_partner_proposal(
    p_actor_cms_user_id text,
    p_proposal_id bigint,
    p_expected_version_id bigint,
    p_expected_revision bigint
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
    v_draft sales_configurator.proposal_versions%rowtype;
    v_previous_version_id bigint;
    v_revoked_share record;
begin
    perform sales_configurator.require_partner(v_actor, 'proposals.publish');

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

    select version.*
    into v_draft
    from sales_configurator.proposal_versions version
    where version.proposal_id = v_proposal.id
      and version.state = 'draft'
    for update;

    if not found or p_expected_version_id is null
        or v_draft.id <> p_expected_version_id
        or p_expected_revision is null
        or v_draft.revision <> p_expected_revision
    then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'draft_version_changed'
        );
    end if;
    if not exists (
        select 1
        from sales_configurator.proposal_items item
        where item.proposal_version_id = v_draft.id
    ) then
        return pg_catalog.jsonb_build_object(
            'state', 'conflict',
            'code', 'draft_is_empty'
        );
    end if;

    select version.id
    into v_previous_version_id
    from sales_configurator.proposal_versions version
    where version.proposal_id = v_proposal.id
      and version.state = 'published'
    for update;

    if v_previous_version_id is not null then
        for v_revoked_share in
            update sales_configurator.proposal_shares share
            set revoked_at = pg_catalog.clock_timestamp()
            where share.proposal_version_id = v_previous_version_id
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
                'partner',
                v_actor,
                pg_catalog.jsonb_build_object('reason', 'version_superseded')
            );
        end loop;

        update sales_configurator.proposal_versions version
        set state = 'superseded'
        where version.id = v_previous_version_id;
    end if;

    update sales_configurator.proposal_versions version
    set
        state = 'published',
        published_at = pg_catalog.clock_timestamp()
    where version.id = v_draft.id;

    update sales_configurator.proposals proposal
    set status = 'draft'
    where proposal.id = v_proposal.id;

    insert into sales_configurator.proposal_events (
        proposal_id,
        proposal_version_id,
        event_type,
        actor_type,
        actor_id,
        metadata
    )
    values (
        v_proposal.id,
        v_draft.id,
        'published',
        'partner',
        v_actor,
        pg_catalog.jsonb_build_object(
            'versionNumber', v_draft.version_number,
            'revision', v_draft.revision,
            'supersededVersionId', v_previous_version_id
        )
    );

    return sales_configurator.partner_proposal_json(v_proposal.id, v_actor);
end;
$$;
