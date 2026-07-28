
do $client_snapshot_constraints$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_registration_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_registration_bounded check (
                client_company_registration_number is null
                or pg_catalog.length(client_company_registration_number) <= 100
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_job_title_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_job_title_bounded check (
                client_contact_job_title is null
                or pg_catalog.length(client_contact_job_title) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_address_line1_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_address_line1_bounded check (
                client_address_line1 is null
                or pg_catalog.length(client_address_line1) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_address_line2_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_address_line2_bounded check (
                client_address_line2 is null
                or pg_catalog.length(client_address_line2) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_postal_code_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_postal_code_bounded check (
                client_postal_code is null
                or pg_catalog.length(client_postal_code) <= 40
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_city_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_city_bounded check (
                client_city is null or pg_catalog.length(client_city) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_country_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_country_bounded check (
                client_country is null or pg_catalog.length(client_country) <= 100
            );
    end if;
end;
$client_snapshot_constraints$;
