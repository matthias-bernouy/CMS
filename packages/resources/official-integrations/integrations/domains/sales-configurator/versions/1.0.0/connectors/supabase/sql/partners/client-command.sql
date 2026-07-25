create or replace function sales_configurator.save_partner_client(
    p_partner_account_id bigint,
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
    v_client sales_configurator.clients%rowtype;
begin
    if p_partner_account_id is null then
        raise exception 'validation: partnerAccountId is required';
    end if;

    if p_client_id is null then
        insert into sales_configurator.clients (
            partner_account_id,
            company_name,
            company_registration_number,
            contact_name,
            contact_job_title,
            contact_email,
            contact_phone,
            address_line1,
            address_line2,
            postal_code,
            city,
            country,
            notes
        )
        values (
            p_partner_account_id,
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'companyName', 'company_name'),
                'companyName',
                200
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(
                    v_payload,
                    'companyRegistrationNumber',
                    'company_registration_number'
                ),
                'companyRegistrationNumber',
                100
            ),
            sales_configurator.require_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'contactName', 'contact_name'),
                'contactName',
                200
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(
                    v_payload,
                    'contactJobTitle',
                    'contact_job_title'
                ),
                'contactJobTitle',
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
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'addressLine1', 'address_line1'),
                'addressLine1',
                300
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'addressLine2', 'address_line2'),
                'addressLine2',
                300
            ),
            sales_configurator.optional_bounded_text(
                sales_configurator.json_alias_text(v_payload, 'postalCode', 'postal_code'),
                'postalCode',
                40
            ),
            sales_configurator.optional_bounded_text(v_payload ->> 'city', 'city', 200),
            sales_configurator.optional_bounded_text(v_payload ->> 'country', 'country', 100),
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
            company_registration_number = case
                when sales_configurator.json_has_alias(
                    v_payload,
                    'companyRegistrationNumber',
                    'company_registration_number'
                )
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'companyRegistrationNumber',
                            'company_registration_number'
                        ),
                        'companyRegistrationNumber',
                        100
                    )
                else client.company_registration_number
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
            contact_job_title = case
                when sales_configurator.json_has_alias(
                    v_payload,
                    'contactJobTitle',
                    'contact_job_title'
                )
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'contactJobTitle',
                            'contact_job_title'
                        ),
                        'contactJobTitle',
                        200
                    )
                else client.contact_job_title
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
            address_line1 = case
                when sales_configurator.json_has_alias(v_payload, 'addressLine1', 'address_line1')
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'addressLine1',
                            'address_line1'
                        ),
                        'addressLine1',
                        300
                    )
                else client.address_line1
            end,
            address_line2 = case
                when sales_configurator.json_has_alias(v_payload, 'addressLine2', 'address_line2')
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'addressLine2',
                            'address_line2'
                        ),
                        'addressLine2',
                        300
                    )
                else client.address_line2
            end,
            postal_code = case
                when sales_configurator.json_has_alias(v_payload, 'postalCode', 'postal_code')
                    then sales_configurator.optional_bounded_text(
                        sales_configurator.json_alias_text(
                            v_payload,
                            'postalCode',
                            'postal_code'
                        ),
                        'postalCode',
                        40
                    )
                else client.postal_code
            end,
            city = case when v_payload ? 'city'
                then sales_configurator.optional_bounded_text(v_payload ->> 'city', 'city', 200)
                else client.city
            end,
            country = case when v_payload ? 'country'
                then sales_configurator.optional_bounded_text(v_payload ->> 'country', 'country', 100)
                else client.country
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
          and client.partner_account_id = p_partner_account_id
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
            'companyRegistrationNumber', v_client.company_registration_number,
            'contactName', v_client.contact_name,
            'contactJobTitle', v_client.contact_job_title,
            'contactEmail', v_client.contact_email,
            'contactPhone', v_client.contact_phone,
            'addressLine1', v_client.address_line1,
            'addressLine2', v_client.address_line2,
            'postalCode', v_client.postal_code,
            'city', v_client.city,
            'country', v_client.country,
            'notes', v_client.notes,
            'createdAt', v_client.created_at,
            'updatedAt', v_client.updated_at
        )
    );
end;
$$;
