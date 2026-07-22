\set ON_ERROR_STOP on

do $$
declare
    v_volatile "char";
    v_security_definer boolean;
    v_config text[];
begin
    select procedure.provolatile, procedure.prosecdef, procedure.proconfig
    into v_volatile, v_security_definer, v_config
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'commerce'
      and procedure.proname = 'assert_custom_field_patch'
      and pg_get_function_identity_arguments(procedure.oid) = 'p_entity_type text, p_values jsonb, p_actor_kind text';

    if v_volatile is distinct from 'v'
        or v_security_definer is distinct from false
        or v_config is distinct from array['search_path=""'] then
        raise exception 'custom-field security: function metadata changed';
    end if;
    if has_function_privilege(
        'anon', 'commerce.assert_custom_field_patch(text,jsonb,text)', 'execute'
    ) or has_function_privilege(
        'authenticated', 'commerce.assert_custom_field_patch(text,jsonb,text)', 'execute'
    ) or not has_function_privilege(
        'service_role', 'commerce.assert_custom_field_patch(text,jsonb,text)', 'execute'
    ) then
        raise exception 'custom-field security: function privileges changed';
    end if;
end;
$$;
