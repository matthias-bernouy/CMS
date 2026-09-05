

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists commerce;

revoke all on schema commerce from public;
revoke all on schema commerce from anon;
revoke all on schema commerce from authenticated;