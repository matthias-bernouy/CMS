create or replace function sales_configurator.admin_proposal_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (
            select pg_catalog.jsonb_build_object(
                'id', proposal.id,
                'ownerCmsUserId', proposal.owner_cms_user_id,
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
                'partner', pg_catalog.jsonb_build_object(
                    'id', partner.id,
                    'cmsUserId', partner.cms_user_id,
                    'status', partner.status,
                    'displayName', partner.display_name,
                    'contactEmail', partner.contact_email,
                    'capabilities', (
                        select coalesce(
                            pg_catalog.jsonb_agg(capability.capability order by capability.capability),
                            '[]'::jsonb
                        )
                        from sales_configurator.partner_capabilities capability
                        where capability.partner_account_id = partner.id
                    ),
                    'createdAt', partner.created_at,
                    'updatedAt', partner.updated_at
                ),
                'currentVersion', (
                    select sales_configurator.partner_proposal_version_json(version.id)
                    from sales_configurator.proposal_versions version
                    where version.proposal_id = proposal.id
                      and version.state = 'published'
                ),
                'versions', (
                    select coalesce(
                        pg_catalog.jsonb_agg(
                            sales_configurator.partner_proposal_version_json(version.id)
                            order by version.version_number desc
                        ),
                        '[]'::jsonb
                    )
                    from sales_configurator.proposal_versions version
                    where version.proposal_id = proposal.id
                ),
                'shares', sales_configurator.proposal_shares_json(proposal.id),
                'events', sales_configurator.proposal_events_json(proposal.id),
                'createdAt', proposal.created_at,
                'updatedAt', proposal.updated_at
            )
            from sales_configurator.proposals proposal
            join sales_configurator.clients client
              on client.id = proposal.client_id
            join sales_configurator.partner_accounts partner
              on partner.cms_user_id = proposal.owner_cms_user_id
            where proposal.id = p_proposal_id
        ),
        pg_catalog.jsonb_build_object('state', 'not_found')
    )
$$;
