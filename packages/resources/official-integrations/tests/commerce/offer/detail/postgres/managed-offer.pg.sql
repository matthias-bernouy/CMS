\set ON_ERROR_STOP on

-- Run with psql -f so the relative includes resolve from this directory.

begin;

do $security$
declare
    target oid := to_regprocedure(
        'commerce.get_managed_offer_read_model(text,bigint,text,text)'
    );
begin
    if target is null then
        raise exception 'managed offer detail: RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 's'
              or not coalesce(proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'managed offer detail: RPC security attributes are invalid';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'managed offer detail: RPC privileges are invalid';
    end if;
end;
$security$;

set local role service_role;
\ir managed-offer.fixture.sql
\ir managed-offer.contracts.sql
\ir managed-offer.boundaries.sql

rollback;
