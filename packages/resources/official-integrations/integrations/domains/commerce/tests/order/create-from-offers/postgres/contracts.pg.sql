\set ON_ERROR_STOP on

set statement_timeout = '15s';

do $private_helpers$
declare
    v_contract record;
    v_function oid;
begin
    for v_contract in
        select * from (values
            ('commerce.validate_order_creation_lines(text,jsonb,boolean,text)',
                's', true, 'record'),
            ('commerce.insert_order_lines_and_reserve_inventory(bigint,jsonb)',
                'v', false, 'void')
        ) expected(signature, volatility, returns_set, return_type)
    loop
        v_function := to_regprocedure(v_contract.signature);
        if v_function is null or exists (
            select 1
            from pg_proc function_row
            where function_row.oid = v_function
              and (function_row.prosecdef
                or function_row.provolatile::text <> v_contract.volatility
                or function_row.proretset is distinct from v_contract.returns_set
                or function_row.prorettype <> to_regtype(v_contract.return_type)
                or function_row.proacl is null
                or not coalesce(
                    function_row.proconfig @> array['search_path=""'], false
                )
                or exists (
                    select 1 from aclexplode(function_row.proacl) privilege
                    where privilege.grantee = 0
                      and privilege.privilege_type = 'EXECUTE'
                ))
        ) then
            raise exception 'order creation: unsafe private helper: %', v_contract.signature;
        end if;
        if has_function_privilege('anon', v_function, 'execute')
           or has_function_privilege('authenticated', v_function, 'execute')
           or not has_function_privilege('service_role', v_function, 'execute') then
            raise exception 'order creation: unsafe private helper grants: %',
                v_contract.signature;
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
