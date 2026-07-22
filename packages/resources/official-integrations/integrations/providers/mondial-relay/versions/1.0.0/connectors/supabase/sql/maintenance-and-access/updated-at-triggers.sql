

drop trigger if exists shipments_set_updated_at on delivery.shipments;
create trigger shipments_set_updated_at
before update on delivery.shipments
for each row execute function delivery.set_updated_at();

drop trigger if exists relay_selections_set_updated_at on delivery.relay_selections;
create trigger relay_selections_set_updated_at
before update on delivery.relay_selections
for each row execute function delivery.set_updated_at();

drop trigger if exists settings_set_updated_at on delivery.settings;
create trigger settings_set_updated_at
before update on delivery.settings
for each row execute function delivery.set_updated_at();