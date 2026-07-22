

alter table user_account.accounts enable row level security;
alter table user_account.accounts force row level security;
alter table user_account.extra_fields enable row level security;
alter table user_account.extra_fields force row level security;

comment on table user_account.extra_fields is
    'Dashboard-managed personal information metadata field definitions.';

revoke all on all tables in schema user_account from public;
revoke all on all tables in schema user_account from anon;
revoke all on all tables in schema user_account from authenticated;
revoke all on all functions in schema user_account from public;
revoke all on all functions in schema user_account from anon;
revoke all on all functions in schema user_account from authenticated;

grant usage on schema user_account to service_role;
grant select, insert, update, delete on all tables in schema user_account to service_role;
grant execute on all functions in schema user_account to service_role;

alter default privileges in schema user_account
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema user_account
grant execute on functions to service_role;

comment on schema user_account is
    'Private user personal information schema owned by Supabase Edge Functions.';
comment on table user_account.accounts is
    'Minimal CMS user personal information data keyed by the trusted x-user-id header.';
comment on column user_account.accounts.cms_user_id is
    'Stable user id computed by the CMS and forwarded as x-user-id.';
comment on column user_account.accounts.display_name is
    'Deprecated legacy display name retained for existing installations.';
comment on column user_account.accounts.given_name is
    'Optional private given name.';
comment on column user_account.accounts.surname is
    'Optional private family name.';
comment on column user_account.accounts.birth_date is
    'Optional private birth date without a time component.';
comment on column user_account.accounts.country_code is
    'Optional ISO 3166-1 alpha-2 country code.';
comment on column user_account.accounts.avatar_file_id is
    'Private Supabase Storage object path for an uploaded avatar.';