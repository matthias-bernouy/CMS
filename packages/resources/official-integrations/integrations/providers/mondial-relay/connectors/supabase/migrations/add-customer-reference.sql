alter table delivery.settings
    add column if not exists customer_reference text not null default 'COURTSIDE';

alter table delivery.settings
    alter column customer_reference set default 'COURTSIDE';

alter table delivery.settings
    alter column mode_collection set default 'REL';

alter table delivery.settings
    drop constraint if exists settings_mode_collection_24r;

alter table delivery.settings
    add constraint settings_mode_collection_24r check (mode_collection in ('REL', 'CCC'));

alter table delivery.settings
    drop constraint if exists settings_customer_reference_format;

alter table delivery.settings
    add constraint settings_customer_reference_format check (customer_reference ~ '^[A-Z0-9]{1,9}$');
