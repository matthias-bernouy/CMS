create or replace function sales_configurator.prepare_partner_proposal_draft(
    p_partner_account_id bigint, p_proposal_id bigint, p_client_id bigint, p_payload jsonb
)
returns jsonb language plpgsql volatile security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'proposal');
    v_client sales_configurator.clients%rowtype;
    v_partner sales_configurator.partner_accounts%rowtype;
    v_proposal sales_configurator.proposals%rowtype;
    v_version sales_configurator.proposal_versions%rowtype;
begin
    if p_partner_account_id is null then
        raise exception 'validation: partnerAccountId is required';
    end if;

    select client.*
    into v_client
    from sales_configurator.clients client
    where client.id = p_client_id
      and client.partner_account_id = p_partner_account_id
    for key share;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    select partner.*
    into strict v_partner
    from sales_configurator.partner_accounts partner
    where partner.id = p_partner_account_id;

    if p_proposal_id is null then
        insert into sales_configurator.proposals (
            partner_account_id,
            client_id,
            title,
            introduction,
            private_notes
        )
        values (
            p_partner_account_id,
            p_client_id,
            sales_configurator.optional_bounded_text(v_payload ->> 'title', 'title', 300),
            sales_configurator.optional_bounded_text(
                v_payload ->> 'introduction',
                'introduction',
                20000
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(
                    v_payload,
                    'privateNotes',
                    'private_notes'
                ),
                'privateNotes',
                30000
            )
        )
        returning * into v_proposal;

        insert into sales_configurator.proposal_events (
            proposal_id,
            event_type,
            actor_type,
            actor_id
        )
        values (
            v_proposal.id,
            'created',
            'partner',
            p_partner_account_id::text
        );
    else
        select proposal.*
        into v_proposal
        from sales_configurator.proposals proposal
        where proposal.id = p_proposal_id
          and proposal.partner_account_id = p_partner_account_id
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

        update sales_configurator.proposals proposal
        set
            client_id = p_client_id,
            title = case when v_payload ? 'title'
                then sales_configurator.optional_bounded_text(
                    v_payload ->> 'title',
                    'title',
                    300
                )
                else proposal.title
            end,
            introduction = case when v_payload ? 'introduction'
                then sales_configurator.optional_bounded_text(
                    v_payload ->> 'introduction',
                    'introduction',
                    20000
                )
                else proposal.introduction
            end,
            private_notes = case
                when sales_configurator.json_has_alias(
                    v_payload,
                    'privateNotes',
                    'private_notes'
                )
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'privateNotes',
                            'private_notes'
                        ),
                        'privateNotes',
                        30000
                    )
                else proposal.private_notes
            end
        where proposal.id = v_proposal.id
        returning * into v_proposal;
    end if;

    select version.*
    into v_version
    from sales_configurator.proposal_versions version
    where version.proposal_id = v_proposal.id
      and version.state = 'draft'
    for update;

    if not found then
        insert into sales_configurator.proposal_versions (
            proposal_id,
            version_number,
            client_company_name,
            client_company_registration_number,
            client_contact_name,
            client_contact_job_title,
            client_contact_email,
            client_contact_phone,
            client_address_line1,
            client_address_line2,
            client_postal_code,
            client_city,
            client_country,
            sales_contact_name,
            sales_contact_email
        )
        select
            v_proposal.id,
            coalesce(pg_catalog.max(version.version_number), 0) + 1,
            v_client.company_name,
            v_client.company_registration_number,
            v_client.contact_name,
            v_client.contact_job_title,
            v_client.contact_email,
            v_client.contact_phone,
            v_client.address_line1,
            v_client.address_line2,
            v_client.postal_code,
            v_client.city,
            v_client.country,
            v_partner.display_name,
            v_partner.contact_email
        from sales_configurator.proposal_versions version
        where version.proposal_id = v_proposal.id
        returning * into v_version;
    end if;

    update sales_configurator.proposal_versions version
    set
        public_title = v_proposal.title,
        public_introduction = v_proposal.introduction,
        client_company_name = v_client.company_name,
        client_company_registration_number = v_client.company_registration_number,
        client_contact_name = v_client.contact_name,
        client_contact_job_title = v_client.contact_job_title,
        client_contact_email = v_client.contact_email,
        client_contact_phone = v_client.contact_phone,
        client_address_line1 = v_client.address_line1,
        client_address_line2 = v_client.address_line2,
        client_postal_code = v_client.postal_code,
        client_city = v_client.city,
        client_country = v_client.country,
        sales_contact_name = v_partner.display_name,
        sales_contact_email = v_partner.contact_email
    where version.id = v_version.id
    returning * into v_version;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'proposalId', v_proposal.id,
        'versionId', v_version.id,
        'versionNumber', v_version.version_number
    );
end;
$$;
