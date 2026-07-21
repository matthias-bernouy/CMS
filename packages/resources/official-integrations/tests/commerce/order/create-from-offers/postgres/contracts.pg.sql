\set ON_ERROR_STOP on

set statement_timeout = '15s';

do $private_helpers$
declare
    v_function oid;
    v_expected_volatility "char";
begin
    for v_function, v_expected_volatility in
        select to_regprocedure(candidate.signature), candidate.volatility
        from (values
            ('commerce.validate_order_creation_lines(text,jsonb,boolean,text)', 's'::"char"),
            ('commerce.insert_order_lines_and_reserve_inventory(bigint,jsonb)', 'v'::"char")
        ) candidate(signature, volatility)
    loop
        if v_function is null then
            continue;
        end if;
        if has_function_privilege('anon', v_function, 'execute')
           or has_function_privilege('authenticated', v_function, 'execute')
           or not has_function_privilege('service_role', v_function, 'execute') then
            raise exception 'order creation: private helper ACL changed: %', v_function::regprocedure;
        end if;
        if exists (
            select 1
            from pg_proc function_row
            where function_row.oid = v_function
              and (function_row.prosecdef
                or function_row.provolatile <> v_expected_volatility
                or not coalesce(function_row.proconfig, '{}'::text[])
                    @> array['search_path=""'])
        ) then
            raise exception 'order creation: private helper configuration changed: %',
                v_function::regprocedure;
        end if;
    end loop;
end;
$private_helpers$;

\ir cleanup.sql

begin;
set local role service_role;
\ir fixture.sql
\ir contracts.sql
\ir boundaries.sql
\ir inventory-idempotence.sql
rollback;

\ir concurrency.sql
\ir cleanup.sql
