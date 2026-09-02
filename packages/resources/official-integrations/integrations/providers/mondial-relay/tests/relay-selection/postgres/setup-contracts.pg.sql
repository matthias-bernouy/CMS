do $setup_metadata$
declare
    target regprocedure := pg_catalog.to_regprocedure(
        'delivery.read_relay_selection_setup_context(text,boolean)'
    );
    procedure record;
    definition text;
begin
    if target is null then
        raise exception 'relay selection: setup context RPC is missing';
    end if;
    select p.prosecdef, p.provolatile, p.proconfig, l.lanname
    into strict procedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = target;
    if procedure.prosecdef
       or procedure.provolatile <> 'v'
       or procedure.lanname <> 'plpgsql'
       or not coalesce(procedure.proconfig @> array['search_path=""'], false) then
        raise exception 'relay selection: setup RPC must be private VOLATILE PL/pgSQL invoker code';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'relay selection: setup RPC execute ACL changed';
    end if;
    definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(target));
    if pg_catalog.strpos(definition, 'from delivery.shipments') = 0
       or pg_catalog.strpos(definition, 'from delivery.settings') = 0
       or pg_catalog.strpos(definition, 'from delivery.shipments')
            > pg_catalog.strpos(definition, 'from delivery.settings') then
        raise exception 'relay selection: setup must read shipment before settings';
    end if;
end;
$setup_metadata$;

insert into delivery.shipments (
    id, external_order_id, status, recipient_name, recipient_postal_code,
    recipient_city, recipient_country, weight_grams
) values (
    'relay-selection-setup-shipment', 'relay-selection-setup-existing', 'created',
    'RECIPIENT', '75001', 'PARIS', 'FR', 500
);

do $setup_behavior$
declare
    context jsonb;
begin
    context := delivery.read_relay_selection_setup_context(
        'relay-selection-setup-existing', true
    );
    if context <> '{"outcome":"shipment_exists","settings":null}'::jsonb then
        raise exception 'relay selection: existing shipment setup changed: %', context;
    end if;
    context := delivery.read_relay_selection_setup_context(
        'relay-selection-setup-ready', true
    );
    if context #>> '{outcome}' <> 'ready'
       or context #>> '{settings,id}' <> 'default'
       or context #>> '{settings,default_weight_grams}' <> '500' then
        raise exception 'relay selection: ready setup changed: %', context;
    end if;
    context := delivery.read_relay_selection_setup_context(
        'relay-selection-setup-skipped', false
    );
    if context <> '{"outcome":"ready","settings":null}'::jsonb then
        raise exception 'relay selection: skipped settings setup changed: %', context;
    end if;
end;
$setup_behavior$;

revoke select on delivery.settings from service_role;
set local role service_role;
do $setup_conditional$
declare
    context jsonb;
begin
    context := delivery.read_relay_selection_setup_context(
        'relay-selection-setup-existing', true
    );
    if context #>> '{outcome}' <> 'shipment_exists' then
        raise exception 'relay selection: existing shipment consulted settings';
    end if;
    context := delivery.read_relay_selection_setup_context(
        'relay-selection-setup-skipped', false
    );
    if context <> '{"outcome":"ready","settings":null}'::jsonb then
        raise exception 'relay selection: disabled settings read changed';
    end if;
    begin
        perform delivery.read_relay_selection_setup_context(
            'relay-selection-setup-ready', true
        );
        raise exception 'relay selection: ready setup did not consult settings';
    exception
        when insufficient_privilege then null;
    end;
end;
$setup_conditional$;
reset role;
