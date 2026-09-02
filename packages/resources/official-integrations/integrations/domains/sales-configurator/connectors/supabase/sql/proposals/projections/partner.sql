create or replace function sales_configurator.partner_proposal_json(
    p_proposal_id bigint,
    p_partner_account_id bigint
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
                        'companyRegistrationNumber', client.company_registration_number,
                        'contactName', client.contact_name,
                        'contactJobTitle', client.contact_job_title,
                        'contactEmail', client.contact_email,
                        'contactPhone', client.contact_phone,
                        'addressLine1', client.address_line1,
                        'addressLine2', client.address_line2,
                        'postalCode', client.postal_code,
                        'city', client.city,
                        'country', client.country,
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
                    'events', sales_configurator.partner_proposal_events_json(proposal.id),
                    'createdAt', proposal.created_at,
                    'updatedAt', proposal.updated_at
                )
            )
            from sales_configurator.proposals proposal
            join sales_configurator.clients client
              on client.id = proposal.client_id
             and client.partner_account_id = proposal.partner_account_id
            where proposal.id = p_proposal_id
              and proposal.partner_account_id = p_partner_account_id
        ),
        pg_catalog.jsonb_build_object('state', 'not_found')
    )
$$;

create or replace function sales_configurator.read_partner_proposal(
    p_partner_account_id bigint,
    p_proposal_id bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    return sales_configurator.partner_proposal_json(
        p_proposal_id,
        p_partner_account_id
    );
end;
$$;
