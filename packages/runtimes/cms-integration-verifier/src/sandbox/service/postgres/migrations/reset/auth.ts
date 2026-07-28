import type { SQL } from "bun";
import { sha256Hex } from "@bernouy/cms-integration-packages";

export type AuthBootstrapObservation = Readonly<{
    externalOwner: boolean;
    providerOwned: boolean;
    publicUsage: boolean;
    publicCreate: boolean;
    usageRoles: readonly string[];
    createRoles: readonly string[];
    helpers: readonly Readonly<{
        name: string;
        returnType: string;
        securityInvoker: boolean;
        externalOwner: boolean;
        providerOwned: boolean;
        volatility: string;
        configuration: readonly string[];
        executeRoles: readonly string[];
        sourceDigest: string;
    }>[];
}>;

export type ActorMembershipObservation = Readonly<{
    actor: "candidate";
    role: string;
    adminOption: boolean;
    inheritOption: boolean;
    setOption: boolean;
}>;

export async function observeAuthBootstrap(database: SQL): Promise<AuthBootstrapObservation> {
    const schemas = (await database.unsafe(`select namespace.nspowner <> session_user::regrole as "externalOwner",
      namespace.nspowner = (select datdba from pg_catalog.pg_database where datname = current_database())
        as "providerOwned",
      array(select case acl.grantee when 0 then 'PUBLIC'
          when namespace.nspowner then 'external-owner'
          when session_user::regrole::oid then 'candidate'
          else pg_catalog.pg_get_userbyid(acl.grantee) end
        from pg_catalog.aclexplode(coalesce(
          namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
        )) acl where acl.privilege_type = 'USAGE' order by 1) as "usageRoles",
      array(select case acl.grantee when 0 then 'PUBLIC'
          when namespace.nspowner then 'external-owner'
          when session_user::regrole::oid then 'candidate'
          else pg_catalog.pg_get_userbyid(acl.grantee) end
        from pg_catalog.aclexplode(coalesce(
          namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
        )) acl where acl.privilege_type = 'CREATE' order by 1) as "createRoles"
      from pg_catalog.pg_namespace namespace where namespace.nspname = 'auth'`)) as Array<{
        externalOwner: boolean;
        providerOwned: boolean;
        usageRoles: string[];
        createRoles: string[];
    }>;
    const schema = schemas[0];
    if (schemas.length !== 1 || !schema) {
        return missingAuth();
    }
    const helpers = (await database.unsafe(`select procedure.proname::text as name,
      pg_catalog.format_type(procedure.prorettype, null)::text as "returnType",
      not procedure.prosecdef as "securityInvoker", procedure.proowner <> session_user::regrole as "externalOwner",
      procedure.proowner = (select datdba from pg_catalog.pg_database where datname = current_database())
        as "providerOwned",
      case procedure.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end as volatility,
      coalesce(procedure.proconfig, array[]::text[]) as configuration, procedure.prosrc::text as source,
      array(select case acl.grantee when 0 then 'PUBLIC'
          when procedure.proowner then 'external-owner'
          when session_user::regrole::oid then 'candidate'
          else pg_catalog.pg_get_userbyid(acl.grantee) end
        from pg_catalog.aclexplode(coalesce(
          procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
        )) acl where acl.privilege_type = 'EXECUTE' order by 1) as "executeRoles"
      from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'auth' and procedure.pronargs = 0
        and procedure.proname = any(array['jwt', 'uid']::text[])
      order by procedure.proname collate "C"`)) as Array<{
        name: string;
        returnType: string;
        securityInvoker: boolean;
        externalOwner: boolean;
        providerOwned: boolean;
        volatility: string;
        configuration: string[];
        source: string;
        executeRoles: string[];
    }>;
    return {
        ...schema,
        publicUsage: schema.usageRoles.includes("PUBLIC"),
        publicCreate: schema.createRoles.includes("PUBLIC"),
        helpers: await Promise.all(
            helpers.map(async ({ source, ...helper }) => ({
                ...helper,
                configuration: [...helper.configuration],
                executeRoles: [...helper.executeRoles],
                sourceDigest: await sha256Hex(new TextEncoder().encode(source)),
            })),
        ),
    };
}

export async function observeActorMemberships(database: SQL): Promise<ActorMembershipObservation[]> {
    const rows = (await database.unsafe(`select 'candidate'::text as actor, parent.rolname::text as role,
      membership.admin_option as "adminOption", membership.inherit_option as "inheritOption",
      membership.set_option as "setOption"
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles parent on parent.oid = membership.roleid
      where membership.member = session_user::regrole
      order by parent.rolname collate "C"`)) as ActorMembershipObservation[];
    return rows.map((row) => ({ ...row }));
}

function missingAuth(): AuthBootstrapObservation {
    return {
        externalOwner: false,
        providerOwned: false,
        publicUsage: false,
        publicCreate: false,
        usageRoles: [],
        createRoles: [],
        helpers: [],
    };
}
