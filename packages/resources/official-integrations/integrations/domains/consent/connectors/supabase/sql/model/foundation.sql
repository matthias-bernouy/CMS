create schema if not exists consent;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

comment on schema consent is
    'Versioned consent configuration and immutable acceptance evidence.';

revoke all on schema consent from public;
revoke all on schema consent from anon;
revoke all on schema consent from authenticated;
grant usage on schema consent to service_role;
grant usage on schema extensions to service_role;
