import type { SQL } from "bun";
import type { MigrationVerificationEnvironmentV1 } from "@bernouy/cms-integration-verification";

type GrantRow = Readonly<{
    grantee: string;
    objectType: MigrationVerificationEnvironmentV1["grants"][number]["objectType"];
    object: string;
    privilege: string;
}>;

export async function observeGrants(database: SQL): Promise<MigrationVerificationEnvironmentV1["grants"]> {
    const rows = (await database.unsafe(`select case acl.grantee when 0 then 'PUBLIC'
        when session_user::regrole::oid then 'candidate' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
      'database'::text as "objectType", 'current_database'::text as object,
      lower(acl.privilege_type)::text as privilege
      from pg_catalog.pg_database database_row
      cross join lateral pg_catalog.aclexplode(coalesce(
        database_row.datacl, pg_catalog.acldefault('d', database_row.datdba)
      )) acl
      where database_row.datname = current_database() and acl.grantee <> database_row.datdba
      union all
      select case acl.grantee when 0 then 'PUBLIC'
        when session_user::regrole::oid then 'candidate' else pg_catalog.pg_get_userbyid(acl.grantee) end,
      'schema', namespace.nspname::text, lower(acl.privilege_type)::text
      from pg_catalog.pg_namespace namespace
      cross join lateral pg_catalog.aclexplode(coalesce(
        namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
      )) acl
      where namespace.nspname = any(array['auth', 'extensions']::text[]) and acl.grantee <> namespace.nspowner
      union all
      select case acl.grantee when 0 then 'PUBLIC'
        when session_user::regrole::oid then 'candidate' else pg_catalog.pg_get_userbyid(acl.grantee) end,
      'function', concat('auth.', procedure.proname, '()'), lower(acl.privilege_type)::text
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      cross join lateral pg_catalog.aclexplode(coalesce(
        procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
      )) acl
      where namespace.nspname = 'auth' and procedure.pronargs = 0
        and procedure.proname = any(array['jwt', 'uid']::text[]) and acl.grantee <> procedure.proowner
      order by grantee, "objectType", object, privilege`)) as GrantRow[];
    const grouped = new Map<string, MigrationVerificationEnvironmentV1["grants"][number]>();
    for (const row of rows) {
        const key = `${row.grantee}\0${row.objectType}\0${row.object}`;
        const current = grouped.get(key);
        grouped.set(key, {
            grantee: row.grantee,
            objectType: row.objectType,
            object: row.object,
            privileges: [...new Set([...(current?.privileges ?? []), row.privilege])].toSorted(compareText),
        });
    }
    return [...grouped.values()].toSorted((left, right) =>
        compareText(
            `${left.grantee}\0${left.objectType}\0${left.object}`,
            `${right.grantee}\0${right.objectType}\0${right.object}`,
        ),
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
