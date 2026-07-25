create or replace function sales_configurator.save_partner_client(
    p_actor_cms_user_id text,
    p_client_id bigint,
    p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'payload');
    v_actor text := sales_configurator.require_bounded_text(
        p_actor_cms_user_id,
        'actorCmsUserId',
        512
    );
    v_client sales_configurator.clients%rowtype;
begin
    perform sales_configurator.require_partner(v_actor, 'clients.manage');

    if p_client_id is null then
        insert into sales_configurator.clients (
            owner_cms_user_id,
            company_name,
            contact_name,
            contact_email,
            contact_phone,
            notes
        )
        values (
            v_actor,
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'companyName', 'company_name'),
                'companyName',
                200
            ),
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'contactName', 'contact_name'),
                'contactName',
                200
            ),
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'contactEmail', 'contact_email'),
                'contactEmail',
                320
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'contactPhone', 'contact_phone'),
                'contactPhone',
                80
            ),
            sales_configurator.optional_bounded_text(v_payload ->> 'notes', 'notes', 20000)
        )
        returning * into v_client;
    else
        update sales_configurator.clients client
        set
            company_name = case
                when sales_configurator.json_has_alias(v_payload, 'companyName', 'company_name')
                    then sales_configurator.require_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'companyName',
                            'company_name'
                        ),
                        'companyName',
                        200
                    )
                else client.company_name
            end,
            contact_name = case
                when sales_configurator.json_has_alias(v_payload, 'contactName', 'contact_name')
                    then sales_configurator.require_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'contactName',
                            'contact_name'
                        ),
                        'contactName',
                        200
                    )
                else client.contact_name
            end,
            contact_email = case
                when sales_configurator.json_has_alias(v_payload, 'contactEmail', 'contact_email')
                    then sales_configurator.require_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'contactEmail',
                            'contact_email'
                        ),
                        'contactEmail',
                        320
                    )
                else client.contact_email
            end,
            contact_phone = case
                when sales_configurator.json_has_alias(v_payload, 'contactPhone', 'contact_phone')
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'contactPhone',
                            'contact_phone'
                        ),
                        'contactPhone',
                        80
                    )
                else client.contact_phone
            end,
            notes = case when v_payload ? 'notes'
                then sales_configurator.optional_bounded_text(
                    v_payload ->> 'notes',
                    'notes',
                    20000
                )
                else client.notes
            end
        where client.id = p_client_id
          and client.owner_cms_user_id = v_actor
        returning * into v_client;

        if not found then
            return pg_catalog.jsonb_build_object('state', 'not_found');
        end if;
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'client', pg_catalog.jsonb_build_object(
            'id', v_client.id,
            'companyName', v_client.company_name,
            'contactName', v_client.contact_name,
            'contactEmail', v_client.contact_email,
            'contactPhone', v_client.contact_phone,
            'notes', v_client.notes,
            'createdAt', v_client.created_at,
            'updatedAt', v_client.updated_at
        )
    );
end;
$$;
