do $security$
declare
    signature text;
    target oid;
begin
    foreach signature in array array[
        'commerce.get_order_fulfillment_seller_context(bigint,text)',
        'commerce.get_order_label_seller_context(bigint,text)'
    ] loop
        target := to_regprocedure(signature);
        if target is null then
            raise exception 'seller fulfillment context: missing RPC: %',
                signature;
        end if;
        if exists (
            select 1 from pg_catalog.pg_proc
            where oid = target
              and (
                  prosecdef
                  or provolatile <> 's'
                  or proacl is null
                  or not coalesce(
                      proconfig @> array['search_path=""'], false
                  )
                  or exists (
                      select 1 from pg_catalog.aclexplode(proacl)
                      where grantee = 0 and privilege_type = 'EXECUTE'
                  )
              )
        ) then
            raise exception 'seller fulfillment context: unsafe RPC: %',
                signature;
        end if;
        if has_function_privilege('anon', target, 'execute')
           or has_function_privilege('authenticated', target, 'execute')
           or not has_function_privilege('service_role', target, 'execute') then
            raise exception 'seller fulfillment context: invalid grants: %',
                signature;
        end if;
    end loop;
end;
$security$;
