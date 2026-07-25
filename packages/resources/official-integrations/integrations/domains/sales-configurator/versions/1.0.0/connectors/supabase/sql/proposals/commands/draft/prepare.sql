create or replace function sales_configurator.prepare_partner_proposal_draft(
    p_actor_cms_user_id text, p_proposal_id bigint, p_client_id bigint, p_payload jsonb
)
returns jsonb language plpgsql volatile security invoker
set search_path = ''
as $$
declare
    v_actor text := sales_configurator.require_bounded_text(
        p_actor_cms_user_id,
        'actorCmsUserId',
        512
    );
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'proposal');
    v_client sales_configurator.clients%rowtype;
    v_partner sales_configurator.partner_accounts%rowtype;
    v_proposal sales_configurator.proposals%rowtype;
    v_version sales_configurator.proposal_versions%rowtype;
begin
    perform sales_configurator.require_partner(v_actor, 'proposals.manage');
    select client.*
    into v_client
    from sales_configurator.clients client
    where client.id = p_client_id
      and client.owner_cms_user_id = v_actor
    for key share;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    select partner.*
    into strict v_partner
    from sales_configurator.partner_accounts partner
    where partner.cms_user_id = v_actor;

    if p_proposal_id is null then
        insert into sales_configurator.proposals (
            owner_cms_user_id,
            client_id,
            title,
            introduction,
            private_notes
        )
        values (
            v_actor,
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
        values (v_proposal.id, 'created', 'partner', v_actor);
    else
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
            client_contact_name,
            client_contact_email,
            client_contact_phone,
            sales_contact_name,
            sales_contact_email
        )
        select
            v_proposal.id,
            coalesce(pg_catalog.max(version.version_number), 0) + 1,
            v_client.company_name,
            v_client.contact_name,
            v_client.contact_email,
            v_client.contact_phone,
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
        client_contact_name = v_client.contact_name,
        client_contact_email = v_client.contact_email,
        client_contact_phone = v_client.contact_phone,
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
