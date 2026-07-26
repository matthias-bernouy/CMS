import { SQL } from "bun";

export async function installExtensionGuard(database: SQL): Promise<void> {
    await database.unsafe("create schema cms_verifier_guard");
    await database.unsafe("revoke all on schema cms_verifier_guard from public");
    await database.unsafe(`create function cms_verifier_guard.enforce_extension_allowlist()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
    command record;
begin
    if tg_tag = 'ALTER EXTENSION' then
        raise exception 'verification database extensions are immutable';
    end if;
    for command in
        select object_identity
        from pg_event_trigger_ddl_commands()
        where object_type = 'extension'
    loop
        if command.object_identity <> 'pgcrypto' then
            raise exception 'verification database extension is not allowlisted';
        end if;
    end loop;
end
$guard$`);
    await database.unsafe(`create event trigger cms_verifier_extension_allowlist
on ddl_command_end
when tag in ('CREATE EXTENSION', 'ALTER EXTENSION')
execute function cms_verifier_guard.enforce_extension_allowlist()`);
}
