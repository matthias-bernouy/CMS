create or replace function sales_configurator.upsert_partner_account(
    p_partner_account_id bigint,
    p_cms_user_id text,
    p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'payload');
    v_cms_user_id text := sales_configurator.require_opaque_identifier(
        p_cms_user_id,
        'cmsUserId',
        512
    );
    v_partner sales_configurator.partner_accounts%rowtype;
begin
    if p_partner_account_id is null then
        insert into sales_configurator.partner_accounts (
            cms_user_id,
            status,
            display_name,
            contact_email
        )
        values (
            v_cms_user_id,
            coalesce(nullif(v_payload ->> 'status', ''), 'active'),
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'displayName', 'display_name'),
                'displayName',
                200
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'contactEmail', 'contact_email'),
                'contactEmail',
                320
            )
        )
        returning * into v_partner;
    else
        select partner.*
        into v_partner
        from sales_configurator.partner_accounts partner
        where partner.id = p_partner_account_id
        for update;
        if not found then
            return pg_catalog.jsonb_build_object('state', 'not_found');
        end if;
        if v_partner.cms_user_id <> v_cms_user_id then
            raise exception 'validation: cmsUserId is immutable';
        end if;

        update sales_configurator.partner_accounts partner
        set
            status = case when v_payload ? 'status'
                then v_payload ->> 'status'
                else partner.status
            end,
            display_name = case
                when sales_configurator.json_has_alias(v_payload, 'displayName', 'display_name')
                    then sales_configurator.require_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'displayName',
                            'display_name'
                        ),
                        'displayName',
                        200
                    )
                else partner.display_name
            end,
            contact_email = case
                when sales_configurator.json_has_alias(v_payload, 'contactEmail', 'contact_email')
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'contactEmail',
                            'contact_email'
                        ),
                        'contactEmail',
                        320
                    )
                else partner.contact_email
            end
        where partner.id = p_partner_account_id
        returning * into v_partner;
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'partner', pg_catalog.jsonb_build_object(
            'id', v_partner.id,
            'cmsUserId', v_partner.cms_user_id,
            'status', v_partner.status,
            'displayName', v_partner.display_name,
            'contactEmail', v_partner.contact_email,
            'createdAt', v_partner.created_at,
            'updatedAt', v_partner.updated_at
        )
    );
end;
$$;

create or replace function sales_configurator.set_partner_capability(
    p_partner_account_id bigint,
    p_capability text,
    p_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from sales_configurator.partner_accounts partner
        where partner.id = p_partner_account_id
    ) then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    if p_capability not in (
        'clients.manage',
        'proposals.manage',
        'proposals.publish',
        'proposals.share'
    ) then
        raise exception 'validation: unknown partner capability';
    end if;

    if p_enabled then
        insert into sales_configurator.partner_capabilities (
            partner_account_id,
            capability
        )
        values (p_partner_account_id, p_capability)
        on conflict (partner_account_id, capability) do nothing;
    else
        delete from sales_configurator.partner_capabilities capability
        where capability.partner_account_id = p_partner_account_id
          and capability.capability = p_capability;
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'partnerAccountId', p_partner_account_id,
        'capability', p_capability,
        'enabled', p_enabled
    );
end;
$$;
