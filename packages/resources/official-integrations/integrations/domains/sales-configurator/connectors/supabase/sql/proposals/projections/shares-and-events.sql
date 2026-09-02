
create or replace function sales_configurator.proposal_shares_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', share.id,
                'proposalVersionId', share.proposal_version_id,
                'expiresAt', share.expires_at,
                'revokedAt', share.revoked_at,
                'firstViewedAt', share.first_viewed_at,
                'lastViewedAt', share.last_viewed_at,
                'viewCount', share.view_count,
                'createdAt', share.created_at
            )
            order by share.created_at desc, share.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_shares share
    join sales_configurator.proposal_versions version
      on version.id = share.proposal_version_id
    where version.proposal_id = p_proposal_id
$$;

create or replace function sales_configurator.proposal_events_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'actorType', event.actor_type,
                'actorId', event.actor_id,
                'metadata', event.metadata,
                'occurredAt', event.occurred_at
            )
            order by event.occurred_at desc, event.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_events event
    where event.proposal_id = p_proposal_id
$$;

create or replace function sales_configurator.partner_proposal_events_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'actorType', event.actor_type,
                'metadata', event.metadata,
                'occurredAt', event.occurred_at
            )
            order by event.occurred_at desc, event.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_events event
    where event.proposal_id = p_proposal_id
$$;
