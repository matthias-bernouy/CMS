set role service_role;

insert into sales_configurator_test.results (name, body)
values
    (
        'partner_a',
        sales_configurator.upsert_partner_account(
            null,
            'partner-a',
            '{"display_name":"Partner A","contact_email":"a@example.test","status":"active"}'
        )
    ),
    (
        'partner_b',
        sales_configurator.upsert_partner_account(
            null,
            'partner-b',
            '{"display_name":"Partner B","contact_email":"b@example.test","status":"active"}'
        )
    );

select sales_configurator.set_partner_capability(
    sales_configurator_test.id(partner.name, array['partner', 'id']),
    capability.name,
    true
)
from (values ('partner_a'), ('partner_b')) partner(name)
cross join (
    values
        ('clients.manage'),
        ('proposals.manage'),
        ('proposals.publish'),
        ('proposals.share')
) capability(name);

insert into sales_configurator_test.results (name, body)
values
    (
        'module_booking',
        sales_configurator.upsert_catalog_module(
            null,
            '{"code":"booking","name":"Restaurant booking","status":"published"}'
        )
    ),
    (
        'module_payment',
        sales_configurator.upsert_catalog_module(
            null,
            '{"code":"payment","name":"Online payment","status":"published"}'
        )
    ),
    (
        'feature_tables',
        sales_configurator.upsert_catalog_feature(
            null,
            '{"code":"tables","name":"Table tracking","status":"published"}'
        )
    ),
    (
        'feature_payment',
        sales_configurator.upsert_catalog_feature(
            null,
            '{"code":"online-payment","name":"Online payment","status":"published"}'
        )
    );

insert into sales_configurator_test.results (name, body)
values
    (
        'variant_restaurant',
        sales_configurator.upsert_catalog_variant(
            null,
            pg_catalog.jsonb_build_object(
                'module_item_id',
                sales_configurator_test.id('module_booking', array['module', 'id']),
                'code',
                'restaurant-standard',
                'name',
                'Restaurant standard',
                'status',
                'published',
                'pricing_mode',
                'fixed',
                'unit_amount_cents',
                50000
            )
        )
    ),
    (
        'variant_payment',
        sales_configurator.upsert_catalog_variant(
            null,
            pg_catalog.jsonb_build_object(
                'module_item_id',
                sales_configurator_test.id('module_payment', array['module', 'id']),
                'code',
                'payment-standard',
                'name',
                'Payment standard',
                'status',
                'published',
                'pricing_mode',
                'fixed',
                'unit_amount_cents',
                0
            )
        )
    );

select sales_configurator.upsert_variant_feature(
    sales_configurator_test.id('variant_restaurant', array['variant', 'id']),
    sales_configurator_test.id('feature_tables', array['feature', 'id']),
    '{"availability":"included","pricing_mode":"included","sort_order":0}'
);
select sales_configurator.upsert_variant_feature(
    sales_configurator_test.id('variant_restaurant', array['variant', 'id']),
    sales_configurator_test.id('feature_payment', array['feature', 'id']),
    '{"availability":"optional","pricing_mode":"fixed","unit_amount_cents":15000,"sort_order":1}'
);
select sales_configurator.upsert_catalog_requirement(
    sales_configurator_test.id('feature_payment', array['feature', 'id']),
    sales_configurator_test.id('module_payment', array['module', 'id'])
);

insert into sales_configurator_test.results (name, body)
values
    (
        'client_a',
        sales_configurator.save_partner_client(
            sales_configurator_test.id('partner_a', array['partner', 'id']),
            null,
            '{
                "company_name":"Bistro A",
                "company_registration_number":"FR-A-123",
                "contact_name":"Alice",
                "contact_job_title":"Owner",
                "contact_email":"alice@example.test",
                "contact_phone":"+33 1 23 45 67 89",
                "address_line1":"12 rue du Test",
                "postal_code":"75001",
                "city":"Paris",
                "country":"France"
            }'
        )
    ),
    (
        'client_b',
        sales_configurator.save_partner_client(
            sales_configurator_test.id('partner_b', array['partner', 'id']),
            null,
            '{"company_name":"Bistro B","contact_name":"Bob","contact_email":"bob@example.test"}'
        )
    );

reset role;
