import type { SQL } from "bun";
import { postgresAdministrativeDatabaseIdentifier, postgresIdentifier } from "../configuration";

const SHARED_ROLES = Object.freeze([
    { name: "anon", bypassRls: false },
    { name: "authenticated", bypassRls: false },
    { name: "service_role", bypassRls: true },
]);

export async function ensureSharedRoles(admin: SQL): Promise<void> {
    const databases = (await admin.unsafe(
        "select datname::text as name from pg_catalog.pg_database where datallowconn order by datname",
    )) as Array<{ name: string }>;
    for (const { name } of databases) {
        await admin.unsafe(
            `revoke connect, temporary on database ${postgresAdministrativeDatabaseIdentifier(name)} from public`,
        );
    }
    await admin.unsafe(`do $$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
        create role authenticated nologin nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
        create role service_role nologin nosuperuser nocreatedb nocreaterole inherit noreplication bypassrls;
    end if;
end
$$`);
    await assertSharedRoles(admin);
}

export async function assertSharedRoles(admin: SQL): Promise<void> {
    const rows = (await admin.unsafe(`select rolname::text as name, rolcanlogin as login,
      rolbypassrls as "bypassRls", rolsuper, rolcreatedb, rolcreaterole, rolinherit,
      rolreplication, rolconnlimit::int as "connectionLimit"
      from pg_catalog.pg_roles where rolname = any(array['anon', 'authenticated', 'service_role']::text[])
      order by rolname collate "C"`)) as Array<{
        name: string;
        login: boolean;
        bypassRls: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolreplication: boolean;
        connectionLimit: number;
    }>;
    const memberships = (await admin.unsafe(`select child.rolname::text as member, parent.rolname::text as role
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles child on child.oid = membership.member
      join pg_catalog.pg_roles parent on parent.oid = membership.roleid
      where child.rolname = any(array['anon', 'authenticated', 'service_role']::text[])
      order by child.rolname collate "C", parent.rolname collate "C"`)) as Array<{ member: string; role: string }>;
    if (
        rows.length !== SHARED_ROLES.length ||
        rows.some((row, index) => {
            const expected = [...SHARED_ROLES].toSorted((left, right) => left.name.localeCompare(right.name, "en"))[
                index
            ];
            return (
                row.name !== expected?.name ||
                row.bypassRls !== expected.bypassRls ||
                row.login ||
                row.rolsuper ||
                row.rolcreatedb ||
                row.rolcreaterole ||
                !row.rolinherit ||
                row.rolreplication ||
                row.connectionLimit !== -1
            );
        }) ||
        memberships.length !== 0
    ) {
        throw new Error("Disposable PostgreSQL shared roles do not match the verification contract");
    }
}

export async function grantSandboxActorMemberships(admin: SQL, role: string): Promise<void> {
    await admin.unsafe(`grant anon, authenticated to ${postgresIdentifier(role)} with inherit false, set true`);
    await assertSandboxActorMemberships(admin, role);
}

export async function assertSandboxActorMemberships(admin: SQL, role: string): Promise<void> {
    const rows = (await admin.unsafe(
        `select parent.rolname::text as role, membership.admin_option as "adminOption",
           membership.inherit_option as "inheritOption", membership.set_option as "setOption"
         from pg_catalog.pg_auth_members membership
         join pg_catalog.pg_roles child on child.oid = membership.member
         join pg_catalog.pg_roles parent on parent.oid = membership.roleid
         where child.rolname = $1
         order by parent.rolname collate "C"`,
        [role],
    )) as Array<{ role: string; adminOption: boolean; inheritOption: boolean; setOption: boolean }>;
    const effectiveBypass = (await admin.unsafe(
        `with recursive inherited(role_oid) as (
           select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = $1
           union
           select membership.roleid from pg_catalog.pg_auth_members membership
           join inherited on inherited.role_oid = membership.member
         )
         select coalesce(bool_or(role_row.rolsuper or role_row.rolbypassrls), false) as privileged
         from inherited join pg_catalog.pg_roles role_row on role_row.oid = inherited.role_oid`,
        [role],
    )) as Array<{ privileged: boolean }>;
    if (
        rows.length !== 2 ||
        rows[0]?.role !== "anon" ||
        rows[1]?.role !== "authenticated" ||
        rows.some((entry) => entry.adminOption || entry.inheritOption || !entry.setOption) ||
        effectiveBypass[0]?.privileged !== false
    ) {
        throw new Error("Disposable PostgreSQL sandbox actor memberships changed outside the provider contract");
    }
}
