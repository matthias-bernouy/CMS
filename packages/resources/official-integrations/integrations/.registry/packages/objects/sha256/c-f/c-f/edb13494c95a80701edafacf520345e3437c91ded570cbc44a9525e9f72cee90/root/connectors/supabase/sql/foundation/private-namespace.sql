create schema if not exists sales_configurator;

revoke all on schema sales_configurator from public;
revoke all on schema sales_configurator from anon;
revoke all on schema sales_configurator from authenticated;

comment on schema sales_configurator is
    'Private catalogue and proposal schema owned by the Sales Configurator connector.';
