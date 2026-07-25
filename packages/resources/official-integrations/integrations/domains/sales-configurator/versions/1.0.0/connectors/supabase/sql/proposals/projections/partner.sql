create or replace function sales_configurator.partner_proposal_json(
    p_proposal_id bigint,
    p_owner_cms_user_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (
            select pg_catalog.jsonb_build_object(
                'state', 'ok',
                'proposal', pg_catalog.jsonb_build_object(
                    'id', proposal.id,
                    'reference', proposal.reference,
                    'status', proposal.status,
                    'title', proposal.title,
                    'introduction', proposal.introduction,
                    'privateNotes', proposal.private_notes,
                    'client', pg_catalog.jsonb_build_object(
                        'id', client.id,
                        'companyName', client.company_name,
                        'contactName', client.contact_name,
                        'contactEmail', client.contact_email,
                        'contactPhone', client.contact_phone,
                        'notes', client.notes,
                        'createdAt', client.created_at,
                        'updatedAt', client.updated_at
                    ),
                    'draftVersion', (
                        select sales_configurator.partner_proposal_version_json(version.id)
                        from sales_configurator.proposal_versions version
                        where version.proposal_id = proposal.id
                          and version.state = 'draft'
                    ),
                    'publishedVersion', (
                        select sales_configurator.partner_proposal_version_json(version.id)
                        from sales_configurator.proposal_versions version
                        where version.proposal_id = proposal.id
                          and version.state = 'published'
                    ),
                    'missingRequirements', '[]'::jsonb,
                    'shares', sales_configurator.proposal_shares_json(proposal.id),
                    'events', sales_configurator.proposal_events_json(proposal.id),
                    'createdAt', proposal.created_at,
                    'updatedAt', proposal.updated_at
                )
            )
            from sales_configurator.proposals proposal
            join sales_configurator.clients client
              on client.id = proposal.client_id
             and client.owner_cms_user_id = proposal.owner_cms_user_id
            where proposal.id = p_proposal_id
              and proposal.owner_cms_user_id = p_owner_cms_user_id
        ),
        pg_catalog.jsonb_build_object('state', 'not_found')
    )
$$;

create or replace function sales_configurator.read_partner_proposal(
    p_actor_cms_user_id text,
    p_proposal_id bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_actor text := sales_configurator.require_bounded_text(
        p_actor_cms_user_id,
        'actorCmsUserId',
        512
    );
begin
    perform sales_configurator.require_partner(v_actor, 'proposals.manage');
    return sales_configurator.partner_proposal_json(p_proposal_id, v_actor);
end;
$$;
