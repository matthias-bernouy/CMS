import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../evidence";

type RoleObservation = Readonly<{
    name: string;
    login: boolean;
    bypassRls: boolean;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    replication: boolean;
    inherit: boolean;
}>;

export type BehavioralRlsEnvironmentObservation = Readonly<{
    session: Omit<RoleObservation, "name">;
    roles: readonly RoleObservation[];
    memberships: Readonly<{ anon: boolean; authenticated: boolean }>;
    helpers: readonly Readonly<{
        name: string;
        returnType: string;
        securityInvoker: boolean;
        externalOwner: boolean;
        anonExecutable: boolean;
        authenticatedExecutable: boolean;
    }>[];
}>;

export async function inspectBehavioralRlsEnvironment(database: SQL): Promise<
    Readonly<{
        observation: BehavioralRlsEnvironmentObservation;
        findings: readonly PlatformVerificationFindingV1[];
    }>
> {
    const session = await readSessionRole(database);
    const roles = await readDataApiRoles(database);
    const memberships = roles.length === 2 ? await readMemberships(database) : { anon: false, authenticated: false };
    const helpers = roles.length === 2 ? await readHelpers(database, session.name) : [];
    const observation = {
        session: withoutName(session),
        roles,
        memberships,
        helpers,
    };
    return { observation, findings: environmentFindings(observation) };
}

async function readSessionRole(database: SQL): Promise<RoleObservation> {
    const rows = (await database.unsafe(`${roleQuery("role_row.rolname = session_user")} limit 1`)) as RoleRow[];
    if (rows.length !== 1 || !rows[0]) {
        throw new TypeError("PostgreSQL verification session role could not be attested");
    }
    return roleObservation(rows[0]);
}

async function readDataApiRoles(database: SQL): Promise<RoleObservation[]> {
    const rows = (await database.unsafe(
        `${roleQuery("role_row.rolname = any(array['anon', 'authenticated']::text[])")} order by role_row.rolname collate "C"`,
    )) as RoleRow[];
    return rows.map(roleObservation);
}

async function readMemberships(database: SQL): Promise<{ anon: boolean; authenticated: boolean }> {
    const rows = (await database.unsafe(`select
      pg_catalog.pg_has_role(session_user, 'anon', 'SET') as anon,
      pg_catalog.pg_has_role(session_user, 'authenticated', 'SET') as authenticated`)) as Array<{
        anon: boolean;
        authenticated: boolean;
    }>;
    return rows[0] ?? { anon: false, authenticated: false };
}

async function readHelpers(database: SQL, sessionRole: string) {
    const rows = (await database.unsafe(
        `select procedure.proname::text as name,
          pg_catalog.format_type(procedure.prorettype, null)::text as "returnType",
          not procedure.prosecdef as "securityInvoker",
          pg_catalog.pg_get_userbyid(procedure.proowner) <> $1::text as "externalOwner",
          pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as "anonExecutable",
          pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as "authenticatedExecutable"
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'auth' and procedure.pronargs = 0
          and procedure.proname = any(array['jwt', 'uid']::text[])
        order by procedure.proname collate "C"`,
        [sessionRole],
    )) as Array<{
        name: string;
        returnType: string;
        securityInvoker: boolean;
        externalOwner: boolean;
        anonExecutable: boolean;
        authenticatedExecutable: boolean;
    }>;
    return rows.map((row) => ({
        name: row.name,
        returnType: row.returnType,
        securityInvoker: row.securityInvoker,
        externalOwner: row.externalOwner,
        anonExecutable: row.anonExecutable,
        authenticatedExecutable: row.authenticatedExecutable,
    }));
}

function environmentFindings(observation: BehavioralRlsEnvironmentObservation): PlatformVerificationFindingV1[] {
    const findings: PlatformVerificationFindingV1[] = [];
    if (unsafeSession(observation.session)) {
        findings.push(finding("postgres-rls-behavior-privileged-session", "session-role"));
    }
    for (const name of ["anon", "authenticated"] as const) {
        const role = observation.roles.find((entry) => entry.name === name);
        if (
            !role ||
            role.login ||
            role.bypassRls ||
            role.superuser ||
            role.createDatabase ||
            role.createRole ||
            role.replication
        ) {
            findings.push(finding("postgres-rls-behavior-data-api-role-invalid", `roles.${name}`));
        }
        if (!observation.memberships[name]) {
            findings.push(finding("postgres-rls-behavior-role-unavailable", `roles.${name}`));
        }
    }
    for (const [name, returnType] of [
        ["jwt", "jsonb"],
        ["uid", "uuid"],
    ] as const) {
        const helper = observation.helpers.find((entry) => entry.name === name);
        if (
            !helper ||
            helper.returnType !== returnType ||
            !helper.securityInvoker ||
            !helper.externalOwner ||
            !helper.anonExecutable ||
            !helper.authenticatedExecutable
        ) {
            findings.push(finding("postgres-rls-behavior-auth-helper-invalid", `auth.${name}()`));
        }
    }
    return findings;
}

function unsafeSession(role: Omit<RoleObservation, "name">): boolean {
    return (
        !role.login ||
        role.bypassRls ||
        role.superuser ||
        role.createDatabase ||
        role.createRole ||
        role.replication ||
        role.inherit
    );
}

type RoleRow = RoleObservation;

function roleQuery(predicate: string): string {
    return `select role_row.rolname::text as name, role_row.rolcanlogin as login,
      role_row.rolbypassrls as "bypassRls", role_row.rolsuper as superuser,
      role_row.rolcreatedb as "createDatabase", role_row.rolcreaterole as "createRole",
      role_row.rolreplication as replication, role_row.rolinherit as inherit
      from pg_catalog.pg_roles role_row where ${predicate}`;
}

function roleObservation(row: RoleRow): RoleObservation {
    return row;
}

function withoutName({ name: _name, ...role }: RoleObservation): Omit<RoleObservation, "name"> {
    return role;
}
