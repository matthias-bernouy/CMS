import type { Db } from "mongodb";
import type { Runner, Subject } from "@bernouy/core";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import { Cms as ControlCms, MongoCmsRepository } from "@bernouy/cms";
import { StorageTokenBroker, StorageBrowser, BucketProxyPublisher } from "@bernouy/cdn-buckets";
import type { Tenant } from "src/interfaces/Tenant";

export type TenantRole = "admin" | "user";

/** Live mount handle stored by `MtControlCms` so a later `unmountTenant`
 *  can drop the right routes + close any per-tenant resources. */
export type MountedTenant = {
    id:          string;
    pathPrefix:  string;
    /** Public origin (https://platform.com) used to build callback URLs. */
    appBaseUrl:  string;
};

export type MountTenantArgs = {
    runner:     Runner;
    db:         Db;
    tenant:     Tenant;
    appBaseUrl: string;
};

/**
 * Wires a full per-tenant CMS Control surface onto the shared runner:
 * - Keycloak cookie + bearer auth scoped to the tenant's realm
 * - StorageTokenBroker pointed at the tenant's CDN bucket
 * - ControlCms with a Mongo repo prefixed by `tenant_<id>__`
 * - BucketProxyPublisher pointed at the same bucket — pushes data
 *   provider proxy rules through the broker's `bucketCredential`, no
 *   service-account JWT needed at this layer
 *
 * All routes land under `/cms/<id>/`. Subsequent calls to `unmountTenant`
 * remove this whole subtree without restarting the bun process.
 */
export async function mountTenant(args: MountTenantArgs): Promise<MountedTenant> {
    const { runner, db, tenant, appBaseUrl } = args;
    const pathPrefix = `/cms/${tenant.id}`;

    const cookieAuth = new KeycloakConsumer<TenantRole>(runner, {
        issuer:        tenant.keycloak.issuer,
        clientId:      tenant.keycloak.clientId,
        clientSecret:  tenant.keycloak.clientSecret,
        appBaseUrl,
        sessionSecret: tenant.keycloak.sessionSecret,
        cookieName:    `cms-${tenant.id}-session`,
        basePath:      `${pathPrefix}/auth`,
        claimsToSubject: (claims) => mapClaimsToSubject(claims, tenant.keycloak.adminRole),
    });

    const bearerAuth = new KeycloakBearerConsumer<TenantRole>({
        issuer:          tenant.keycloak.issuer,
        claimsToSubject: (claims) => mapClaimsToSubject(claims, tenant.keycloak.adminRole),
    });

    const auth = new CompositeAuthentication<TenantRole>(runner, {
        children: [
            { auth: bearerAuth },
            { auth: cookieAuth, displayName: "Keycloak" },
        ],
        basePath: `${pathPrefix}/auth`,
    });

    const repo = new MongoCmsRepository(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await repo.init();

    const adminGuard = createTenantAdminGuard(auth);

    const broker = new StorageTokenBroker({
        runner,
        providerOrigin:  tenant.assetsCdn.url,
        credentialToken: tenant.assetsCdn.bucketCredential,
        mountPath:       `${pathPrefix}/_storage`,
        middlewares:     [adminGuard],
    });

    const bucket = await broker.getBucketInfo();
    const cdn = new StorageBrowser({
        apiBaseUrl: `${pathPrefix}/_storage`,
        bucket:     { limits: bucket.limits, quotas: bucket.quotas, cacheControl: bucket.cacheControl },
        // Presigned upload URLs resolve to the upstream assetsCdn origin —
        // the admin CSP needs to whitelist it.
        origins:    safeOriginList(tenant.assetsCdn.url),
    });

    const proxyPublisher = new BucketProxyPublisher({
        brokerBaseUrl:    tenant.assetsCdn.url,
        bucketCredential: tenant.assetsCdn.bucketCredential,
    });

    runner.group(pathPrefix, (sub) => {
        sub.get("/api/auth/discovery", () => Response.json({
            issuer:   tenant.keycloak.issuer,
            clientId: tenant.keycloak.cliClientId ?? `${tenant.keycloak.clientId}-cli`,
            grant:    "urn:ietf:params:oauth:grant-type:device_code",
        }));
        new ControlCms(sub, repo, auth, cdn, {
            tokensUrl: `${tenant.keycloak.issuer}/account/`,
        }, undefined, undefined, proxyPublisher);
    });

    return { id: tenant.id, pathPrefix, appBaseUrl };
}

function mapClaimsToSubject(
    claims: Record<string, unknown>,
    adminRole: string,
): Subject<TenantRole> {
    const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
    const role: TenantRole = realmRoles.includes(adminRole) ? "admin" : "user";
    return {
        identifier:  String(claims.sub ?? ""),
        displayName: String(claims.preferred_username ?? claims.email ?? "user"),
        role,
    };
}

function createTenantAdminGuard(auth: CompositeAuthentication<TenantRole>) {
    return async (req: Request, next: () => Promise<Response>): Promise<Response> => {
        const subject = await auth.getSubject(req);
        if (!subject || subject.role !== "admin") {
            return new Response("forbidden", { status: 403 });
        }
        return next();
    };
}

function safeOriginList(url: string): string[] {
    try { return [new URL(url).origin]; }
    catch { return []; }
}
