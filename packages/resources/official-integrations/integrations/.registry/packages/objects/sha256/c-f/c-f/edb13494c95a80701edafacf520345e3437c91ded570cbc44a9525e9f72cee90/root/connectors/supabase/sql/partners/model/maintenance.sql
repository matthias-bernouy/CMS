
create index if not exists clients_partner_updated_idx
    on sales_configurator.clients(partner_account_id, updated_at desc, id desc);

drop trigger if exists partner_accounts_set_updated_at on sales_configurator.partner_accounts;
create trigger partner_accounts_set_updated_at
before update on sales_configurator.partner_accounts
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists clients_set_updated_at on sales_configurator.clients;
create trigger clients_set_updated_at
before update on sales_configurator.clients
for each row execute function sales_configurator.set_updated_at();
