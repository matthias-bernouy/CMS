// Hub bootstrap. Single-process, single-port: a `BunRunner` exposes the
// hub's REST API behind a Keycloak bearer guard. No nginx in this image —
// the hub is private (only the central UI / ops scripts call it), behind
// whatever reverse proxy the deployer puts in front.
//
// Required env:
//   MAIN_DOMAIN                       e.g. "hub.bernouy.com" — used by the JWT issuer check
//   PORT                              default 3000
//
//   KEYCLOAK_BASE_URL                 e.g. "https://auth.bernouy.com"
//   KEYCLOAK_ADMIN_REALM              typically "master"
//   KEYCLOAK_ADMIN_CLIENT_ID          typically "hub-orchestrator"
//   KEYCLOAK_ADMIN_CLIENT_SECRET      service-account secret
//   KEYCLOAK_API_AUTH_REALM           realm whose JWTs are accepted on `/api/*` (typically same as admin realm)
//   KEYCLOAK_API_AUTH_ROLE            realm role required to call the hub (default "superadmin")
//
//   CMS_BASE_URL                      e.g. "https://cms.bernouy.com"
//   CDN_BASE_URL                      e.g. "https://cdn-origin.bernouy.com"
//   CDN_PUBLIC_HOST                   e.g. "https://cdn.bernouy.com"
//
//   SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_DISPLAY (optional)

import type { Subject } from "@bernouy/core";
import { BunRunner } from "@bernouy/runner-bun";
import { KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { Hub, mountHubApi } from "@bernouy/hub-api";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};
const env = (k: string, d: string): string => process.env[k] ?? d;

const PORT                         = Number(process.env.PORT ?? 3000);

const KEYCLOAK_BASE_URL            = required("KEYCLOAK_BASE_URL");
const KEYCLOAK_ADMIN_REALM         = env("KEYCLOAK_ADMIN_REALM", "master");
const KEYCLOAK_ADMIN_CLIENT_ID     = required("KEYCLOAK_ADMIN_CLIENT_ID");
const KEYCLOAK_ADMIN_CLIENT_SECRET = required("KEYCLOAK_ADMIN_CLIENT_SECRET");
const KEYCLOAK_API_AUTH_REALM      = env("KEYCLOAK_API_AUTH_REALM", KEYCLOAK_ADMIN_REALM);
const KEYCLOAK_API_AUTH_ROLE       = env("KEYCLOAK_API_AUTH_ROLE", "superadmin");

const CMS_BASE_URL    = required("CMS_BASE_URL");
const CDN_BASE_URL    = required("CDN_BASE_URL");
const CDN_PUBLIC_HOST = required("CDN_PUBLIC_HOST");

const SMTP_HOST         = required("SMTP_HOST");
const SMTP_PORT         = Number(env("SMTP_PORT", "587"));
const SMTP_FROM         = required("SMTP_FROM");
const SMTP_USER         = process.env.SMTP_USER;
const SMTP_PASSWORD     = process.env.SMTP_PASSWORD;
const SMTP_FROM_DISPLAY = process.env.SMTP_FROM_DISPLAY;

type Role = "superadmin" | "user";

const hub = new Hub({
    keycloak: {
        baseUrl:           KEYCLOAK_BASE_URL,
        adminRealm:        KEYCLOAK_ADMIN_REALM,
        adminClientId:     KEYCLOAK_ADMIN_CLIENT_ID,
        adminClientSecret: KEYCLOAK_ADMIN_CLIENT_SECRET,
    },
    cms: { baseUrl: CMS_BASE_URL },
    cdn: { baseUrl: CDN_BASE_URL, publicHost: CDN_PUBLIC_HOST },
    smtp: {
        host:     SMTP_HOST,
        port:     SMTP_PORT,
        from:     SMTP_FROM,
        ...(SMTP_FROM_DISPLAY ? { fromDisplayName: SMTP_FROM_DISPLAY } : {}),
        ...(SMTP_USER         ? { user:            SMTP_USER         } : {}),
        ...(SMTP_PASSWORD     ? { password:        SMTP_PASSWORD     } : {}),
        auth:     SMTP_USER !== undefined && SMTP_PASSWORD !== undefined,
        starttls: true,
    },
});

const runner = new BunRunner();

// API auth: any caller with a JWT issued by `KEYCLOAK_API_AUTH_REALM` and
// the `KEYCLOAK_API_AUTH_ROLE` realm role can hit `/api/*`. The same realm
// hosts the `hub-orchestrator` SA, so a single Keycloak setup covers both
// "hub authenticates to downstream" AND "callers authenticate to hub".
const apiAuth = new KeycloakBearerConsumer<Role>({
    issuer: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_API_AUTH_REALM}`,
    claimsToSubject: (claims) => {
        const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
        const role: Role = realmRoles.includes(KEYCLOAK_API_AUTH_ROLE) ? "superadmin" : "user";
        return {
            identifier:  String(claims.sub ?? ""),
            displayName: String(claims.preferred_username ?? claims.email ?? "service-account"),
            role,
        } satisfies Subject<Role>;
    },
});

mountHubApi({ runner, hub, auth: apiAuth, requiredRole: "superadmin" });

// Pre-flight at boot — fail fast if Keycloak / cms / cdn aren't reachable.
// Logs the actionable HubError code so the operator knows where to look.
try {
    await hub.init();
    console.log("✅ hub-api preflight OK (Keycloak + cms-mt + cdn-origin all reachable)");
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`⚠️  hub-api preflight FAILED: ${message}`);
    console.error("   The server will still start so /health probes succeed and the operator can fix the underlying service.");
}

runner.start(PORT);
console.log(`🚀 hub-api listening on :${PORT}`);
console.log(`   admin realm: ${KEYCLOAK_ADMIN_REALM}, api auth realm: ${KEYCLOAK_API_AUTH_REALM}, required role: ${KEYCLOAK_API_AUTH_ROLE}`);
