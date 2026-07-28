import type { SQL } from "bun";
import { postgresOwnedObjectComment, type PostgresOwnershipMarker } from "./contract";

export type PostgresOwnedDatabase = Readonly<{
    name: string;
    oid: number;
    owner: string;
    currentUser: string;
    comment: string | null;
    template: boolean;
}>;

export type PostgresOwnedRole = Readonly<{
    name: string;
    oid: number;
    comment: string | null;
    login: boolean;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    inherit: boolean;
    replication: boolean;
    bypassRls: boolean;
    connectionLimit: number;
}>;

export async function readPostgresOwnedObjects(admin: SQL): Promise<{
    databases: PostgresOwnedDatabase[];
    roles: PostgresOwnedRole[];
}> {
    const databases = (await admin.unsafe(`select datname::text as name, oid::int as oid,
      pg_catalog.pg_get_userbyid(datdba)::text as owner, current_user::text as "currentUser",
      pg_catalog.shobj_description(oid, 'pg_database')::text as comment, datistemplate as template
      from pg_catalog.pg_database where datname ~ '^cmscore_contracts_[a-f0-9]{24}$'
      order by datname collate "C"`)) as PostgresOwnedDatabase[];
    const roles = (await admin.unsafe(`select rolname::text as name, oid::int as oid,
      pg_catalog.shobj_description(oid, 'pg_authid')::text as comment, rolcanlogin as login,
      rolsuper as superuser, rolcreatedb as "createDatabase", rolcreaterole as "createRole",
      rolinherit as inherit, rolreplication as replication, rolbypassrls as "bypassRls",
      rolconnlimit::int as "connectionLimit"
      from pg_catalog.pg_roles where rolname ~ '^cmsv_[a-f0-9]{24}$'
      order by rolname collate "C"`)) as PostgresOwnedRole[];
    return { databases, roles };
}

export function assertPostgresObjectOwnership(
    markers: readonly PostgresOwnershipMarker[],
    objects: Readonly<{ databases: PostgresOwnedDatabase[]; roles: PostgresOwnedRole[] }>,
): void {
    if (
        objects.databases.some((object) => !markers.some((marker) => marker.database === object.name)) ||
        objects.roles.some((object) => !markers.some((marker) => marker.role === object.name))
    ) {
        throw new Error("Disposable PostgreSQL recovery found an unmarked destructive target");
    }
    for (const marker of markers) {
        assertMarkerObjects(marker, objects);
    }
}

export function assertPostgresRoleSecurity(role: PostgresOwnedRole): void {
    if (
        !role.login ||
        role.superuser ||
        role.createDatabase ||
        role.createRole ||
        role.inherit ||
        role.replication ||
        role.bypassRls ||
        role.connectionLimit !== 4
    ) {
        throw new Error("Disposable PostgreSQL role security attributes changed");
    }
}

function assertMarkerObjects(
    marker: PostgresOwnershipMarker,
    objects: Readonly<{ databases: PostgresOwnedDatabase[]; roles: PostgresOwnedRole[] }>,
): void {
    const database = objects.databases.find((entry) => entry.name === marker.database);
    const role = objects.roles.find((entry) => entry.name === marker.role);
    if (marker.state === "reserved") {
        if (database || role || marker.databaseOid !== null || marker.roleOid !== null) {
            throw new Error("Reserved PostgreSQL ownership journal has unexpected objects");
        }
        return;
    }
    if (marker.state === "releasing") {
        if (role) {
            assertBoundRole(marker, role);
        }
        if (database) {
            assertBoundDatabase(marker, database);
        }
        return;
    }
    assertBoundRole(marker, role);
    if (marker.state === "role-created") {
        if (marker.databaseOid !== null) {
            throw new Error("Role-created PostgreSQL ownership journal has a bound database");
        }
        if (database && (database.owner !== database.currentUser || database.template || database.comment !== null)) {
            throw new Error("Unbound disposable PostgreSQL database is not a recoverable create boundary");
        }
        return;
    }
    assertBoundDatabase(marker, database);
}

function assertBoundRole(marker: PostgresOwnershipMarker, role: PostgresOwnedRole | undefined): void {
    if (!role || marker.roleOid !== role.oid || role.comment !== postgresOwnedObjectComment(marker)) {
        throw new Error("Disposable PostgreSQL role identity is not bound to its ownership journal");
    }
}

function assertBoundDatabase(marker: PostgresOwnershipMarker, database: PostgresOwnedDatabase | undefined): void {
    if (
        !database ||
        marker.databaseOid !== database.oid ||
        database.owner !== database.currentUser ||
        database.template ||
        database.comment !== postgresOwnedObjectComment(marker)
    ) {
        throw new Error("Disposable PostgreSQL database identity is not bound to its ownership journal");
    }
}
