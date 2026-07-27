import type { SQL } from "bun";
import { postgresIdentifier } from "../configuration";

export async function installSupabaseAuthEnvironment(database: SQL, candidateRole: string): Promise<void> {
    const candidate = postgresIdentifier(candidateRole);
    await database.unsafe(`create schema auth;
      revoke all on schema auth from public;
      create function auth.uid() returns uuid language sql stable security invoker as $auth_uid$
        select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
      $auth_uid$;
      create function auth.jwt() returns jsonb language sql stable security invoker as $auth_jwt$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $auth_jwt$;
      revoke all on function auth.uid() from public;
      revoke all on function auth.jwt() from public;
      grant usage on schema auth to anon, authenticated, service_role, ${candidate};
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role, ${candidate}`);
}

export async function assertSupabaseAuthEnvironment(database: SQL): Promise<void> {
    const rows = (await database.unsafe(`select procedure.proname::text as name,
      pg_catalog.format_type(procedure.prorettype, null)::text as "returnType",
      pg_catalog.pg_get_userbyid(procedure.proowner)::text as owner,
      procedure.prosecdef as "securityDefiner", procedure.provolatile::text as volatility,
      coalesce(procedure.proconfig, array[]::text[]) as configuration,
      exists(select from pg_catalog.aclexplode(coalesce(
        procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
      )) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as "publicExecute",
      pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as "anonExecute",
      pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as "authenticatedExecute",
      pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as "serviceExecute",
      pg_catalog.has_function_privilege(session_user, procedure.oid, 'EXECUTE') as "candidateExecute",
      pg_catalog.pg_get_userbyid(procedure.proowner) <> session_user as "externalOwner"
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'auth' and procedure.pronargs = 0
        and procedure.proname = any(array['jwt', 'uid']::text[])
      order by procedure.proname collate "C"`)) as Array<{
        name: string;
        returnType: string;
        owner: string;
        securityDefiner: boolean;
        volatility: string;
        configuration: string[];
        publicExecute: boolean;
        anonExecute: boolean;
        authenticatedExecute: boolean;
        serviceExecute: boolean;
        candidateExecute: boolean;
        externalOwner: boolean;
    }>;
    const schemas = (await database.unsafe(`select pg_catalog.pg_get_userbyid(namespace.nspowner)::text as owner,
      exists(select from pg_catalog.aclexplode(coalesce(
        namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
      )) acl where acl.grantee = 0 and acl.privilege_type = 'USAGE') as "publicUsage",
      exists(select from pg_catalog.aclexplode(coalesce(
        namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
      )) acl where acl.grantee = 0 and acl.privilege_type = 'CREATE') as "publicCreate",
      pg_catalog.has_schema_privilege('anon', namespace.oid, 'USAGE') as "anonUsage",
      pg_catalog.has_schema_privilege('authenticated', namespace.oid, 'USAGE') as "authenticatedUsage",
      pg_catalog.has_schema_privilege('service_role', namespace.oid, 'USAGE') as "serviceUsage",
      pg_catalog.has_schema_privilege(session_user, namespace.oid, 'USAGE') as "candidateUsage"
      from pg_catalog.pg_namespace namespace where namespace.nspname = 'auth'`)) as Array<{
        owner: string;
        publicUsage: boolean;
        publicCreate: boolean;
        anonUsage: boolean;
        authenticatedUsage: boolean;
        serviceUsage: boolean;
        candidateUsage: boolean;
    }>;
    const schema = schemas[0];
    if (
        rows.length !== 2 ||
        rows.some(
            (row) =>
                !(["jwt", "uid"] as const).includes(row.name as "jwt" | "uid") ||
                row.returnType !== (row.name === "jwt" ? "jsonb" : "uuid") ||
                !row.externalOwner ||
                row.securityDefiner ||
                row.volatility !== "s" ||
                row.configuration.length !== 0 ||
                row.publicExecute ||
                !row.anonExecute ||
                !row.authenticatedExecute ||
                !row.serviceExecute ||
                !row.candidateExecute,
        ) ||
        !schema ||
        schema.publicUsage ||
        schema.publicCreate ||
        !schema.anonUsage ||
        !schema.authenticatedUsage ||
        !schema.serviceUsage ||
        !schema.candidateUsage
    ) {
        throw new Error("Disposable PostgreSQL auth helpers do not match the Supabase verification contract");
    }
}
