\set ON_ERROR_STOP on
begin;

delete from commerce.custom_field_definitions
where entity_type = 'product'
  and key in ('aString', 'bNumber', 'cBoolean', 'dEnum', 'eDisabled');

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options,
    self_editable, admin_editable, enabled, position
) values
    ('product', 'aString', 'A string', 'string', '[]', true, true, true, 1),
    ('product', 'bNumber', 'B number', 'number', '[]', false, true, true, 2),
    ('product', 'cBoolean', 'C boolean', 'boolean', '[]', true, false, true, 3),
    ('product', 'dEnum', 'D enum', 'enum', '["red","blue"]', true, true, true, 4),
    ('product', 'eDisabled', 'E disabled', 'string', '[]', true, true, false, 5);

set local role service_role;

create function pg_temp.expect_custom_field_patch_error(
    p_entity_type text,
    p_values jsonb,
    p_actor_kind text,
    p_expected text
) returns void language plpgsql as $$
begin
    perform commerce.assert_custom_field_patch(p_entity_type, p_values, p_actor_kind);
    raise exception 'custom-field contract: expected error %', p_expected;
exception when others then
    if sqlerrm like 'custom-field contract: expected error %'
        or sqlerrm is distinct from p_expected then
        raise;
    end if;
end;
$$;
