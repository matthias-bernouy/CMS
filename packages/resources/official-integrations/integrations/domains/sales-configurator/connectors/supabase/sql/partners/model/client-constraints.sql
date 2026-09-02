
do $client_profile_constraints$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_registration_number_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_registration_number_bounded check (
                company_registration_number is null
                or pg_catalog.length(company_registration_number) <= 100
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_contact_job_title_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_contact_job_title_bounded check (
                contact_job_title is null
                or pg_catalog.length(contact_job_title) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_address_line1_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_address_line1_bounded check (
                address_line1 is null or pg_catalog.length(address_line1) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_address_line2_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_address_line2_bounded check (
                address_line2 is null or pg_catalog.length(address_line2) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_postal_code_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_postal_code_bounded check (
                postal_code is null or pg_catalog.length(postal_code) <= 40
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_city_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_city_bounded check (
                city is null or pg_catalog.length(city) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_country_bounded'
    ) then
        alter table sales_configurator.clients
            add constraint clients_country_bounded check (
                country is null or pg_catalog.length(country) <= 100
            );
    end if;
end;
$client_profile_constraints$;
