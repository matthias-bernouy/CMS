\set ON_ERROR_STOP on

do $checkout_function_contracts$
declare
    v_contract record;
    v_function oid;
begin
    for v_contract in
        select * from (values
            ('commerce.checkout_cart(text,text,integer,jsonb,jsonb,jsonb)',
                'v', false, 'jsonb', true),
            ('commerce.checkout_group_result(uuid,boolean)',
                's', false, 'jsonb', true),
            ('commerce.validate_order_creation_batches(text,jsonb,boolean,text,boolean)',
                's', true, 'record', false),
            ('commerce.insert_order_batch_lines_and_reserve_inventory(jsonb,jsonb)',
                'v', false, 'void', false),
            ('commerce.create_checkout_orders(uuid,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
                'v', false, 'void', false)
        ) expected(signature, volatility, returns_set, return_type, required)
    loop
        v_function := to_regprocedure(v_contract.signature);
        if v_function is null and v_contract.required then
            raise exception 'checkout contract: missing function %', v_contract.signature;
        end if;
        if v_function is null then continue; end if;
        if exists (
            select 1 from pg_proc function_row
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
            raise exception 'checkout contract: unsafe function %', v_contract.signature;
        end if;
        if has_function_privilege('anon', v_function, 'execute')
           or has_function_privilege('authenticated', v_function, 'execute')
           or not has_function_privilege('service_role', v_function, 'execute') then
            raise exception 'checkout contract: unsafe grants %', v_contract.signature;
        end if;
    end loop;
end;
$checkout_function_contracts$;
