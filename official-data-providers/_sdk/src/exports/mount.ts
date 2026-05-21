import { join } from "node:path";
import { serveApi, type Runner, type Middleware } from "@bernouy/core";
import { sdkPackageRoot } from "src/constants";
import type { ProviderConfig } from "src/interfaces/ProviderConfig";
import type { ProviderDomain } from "src/types/ProviderDomain";
import type { SdkContext } from "src/types/SdkContext";
import type { RegistryIssuerTrust } from "src/core/tenant/issuerTrust";
import type { createVerifier } from "src/core/auth/verifyToken";
import type { Recorder } from "src/interfaces/Recorder";
import { assertActive } from "src/core/tenant/suspend";
import { assertPlaneAllowed, planForPath } from "src/core/authz/planGuard";
import { setRequestAuth } from "src/core/http/requestAuth";
import { setRequestRecorder } from "src/core/http/requestRecorder";
import { problemResponse } from "src/core/http/problem";
import { buildAdminSpec } from "src/core/http/buildAdminSpec";
import { buildTenantConfigSpec } from "src/core/tenantConfig/buildTenantConfigSpec";
import { PlaneError, SuspendedError } from "src/core/errors";
import type { AllowlistRole } from "src/interfaces/ProviderConfig";
import type { TenantConfigSchema } from "src/interfaces/TenantConfigSchema";

const PUBLIC = new Set([
    "/health", "/openapi.json", "/openapi.tenant.json",
    "/.well-known/data-provider-info",
    // RFC 8414 metadoc + JWKS — when the provider also mounts an issuer
    // (`@bernouy/issuer-kit::mountIssuer`), these MUST stay public so the
    // hub can complete discovery before it can mint a CP token.
    "/.well-known/oauth-authorization-server",
    "/jwks.json",
]);
/** Both admin specs are control-plane gated; mapped to a synthetic /admin
 *  path so planGuard treats them like §1.1 admin operations. */
const ADMIN_SPECS = new Set(["/openapi.admin.json", "/openapi.tenant-config.json"]);

export interface MountDeps {
    runner:  Runner;
    config:  ProviderConfig;
    verify:  ReturnType<typeof createVerifier>;
    rit:      RegistryIssuerTrust;
    sdkCtx:   SdkContext;
    domain:   ProviderDomain;
    recorder: Recorder;
    tenantConfig?: TenantConfigSchema;
}

/**
 * Imposed middleware order (base.md §4.5 → §4.7, RFC 7807 outermost):
 *   RFC7807 wrap → verify → resolve+freshness → suspend → plane authz.
 * Public: `/health`, `/openapi.{json,tenant.json}`. `/openapi.admin.json`
 * is control-plane-only (base.md §2 — not advertised to tenants).
 */
export async function mountProvider(d: MountDeps): Promise<void> {
    const guard: Middleware = async (req, next) => {
        const path = new URL(req.url).pathname;
        // Hoisted so the catch can attach context to plane.denied /
        // tenant.suspended security records (base.md §10).
        let role: AllowlistRole | undefined;
        let tenantId: string | null = null;
        try {
            if (PUBLIC.has(path)) return await next();
            const auth = await d.verify(req.headers.get("Authorization"));
            role = auth.role;
            const resolved = await d.rit.resolve(auth.claims.iss);
            tenantId = resolved?.tenant?.tenantId ?? null;
            assertActive(resolved?.tenant ?? null);
            // /openapi.admin.json + /openapi.tenant-config.json → control-plane only
            assertPlaneAllowed(auth.role, ADMIN_SPECS.has(path) ? "/admin/_spec" : path);
            const tenant = resolved?.tenant ?? null;
            setRequestAuth(req, { ...auth, tenant });
            setRequestRecorder(req, d.recorder);
            const t0  = performance.now();
            const res = await next();
            // §10: one `request.served` access-log per authorized (non-public)
            // request — populates the request stream + `/tenant/logs`, and
            // carries timing/size for analytics. Public infra probes never
            // reach here (PUBLIC bypass above). Body sizes are best-effort via
            // Content-Length (we never buffer the body — would break streaming).
            const isCP = auth.role === "control-plane";
            const reqLen = req.headers.get("content-length");
            const resLen = res.headers.get("content-length");
            void d.recorder.record({
                kind: "request", level: "info", event: "request.served",
                tenantId: tenant?.tenantId ?? null,
                actor:      isCP ? "control-plane" : "tenant",
                visibility: isCP ? "control-plane" : "both",
                outcome: res.ok ? "ok" : "error",
                ...(auth.claims.sub ? { sub: auth.claims.sub } : {}),
                ctx: {
                    method: req.method, path, status: res.status,
                    durationMs: Math.round(performance.now() - t0),
                    ...(reqLen ? { reqBytes: Number(reqLen) } : {}),
                    ...(resLen ? { resBytes: Number(resLen) } : {}),
                },
            });
            return res;
        } catch (e) {
            if (e instanceof PlaneError) {
                void d.recorder.record({
                    kind: "security", level: "warn", event: "plane.denied",
                    tenantId,
                    actor:      role === "control-plane" ? "control-plane" : "tenant",
                    visibility: "control-plane", outcome: "deny",
                    ctx:        { method: req.method, path, role },
                });
            } else if (e instanceof SuspendedError) {
                void d.recorder.record({
                    kind: "security", level: "warn", event: "tenant.suspended",
                    tenantId, actor: "tenant",
                    visibility: "control-plane", outcome: "deny",
                    ctx:        { method: req.method, path },
                });
            }
            return problemResponse(e, { instance: path });
        }
    };
    d.runner.use(guard);

    d.runner.get("/health", () => Response.json({ status: "ok" }));
    d.runner.get("/openapi.json", () => Response.json(d.domain.openapiConsumption));
    d.runner.get("/openapi.tenant.json", () => Response.json(d.domain.openapiTenant));
    d.runner.get("/openapi.admin.json", () => Response.json(buildAdminSpec(d.config)));

    // base.md §2.0 — public discovery shim so the hub can pick up
    // `providerId` / `providerKind` BEFORE it can mint a CP token.
    d.runner.get("/.well-known/data-provider-info", () => Response.json({
        providerId:               d.config.providerId,
        ...(d.config.providerKind ? { providerKind: d.config.providerKind } : {}),
        contractVersion:          d.config.supportedContractVersion,
        defaultDeprovisionPolicy: d.config.defaultDeprovisionPolicy,
    }));

    // base.md §11.2 — served only if the provider declared a tenantConfig schema.
    if (d.tenantConfig) {
        const spec = buildTenantConfigSpec(d.tenantConfig);
        d.runner.get("/openapi.tenant-config.json", () => Response.json(spec));
    }

    // Plane 1 (/admin/*) + the SDK-owned /tenant/logs — file-routed.
    await serveApi(d.runner, join(sdkPackageRoot, "src/api"), d.sdkCtx);

    // Planes 2 & 3 — provider-owned, already behind `guard`.
    d.domain.mount(d.runner);
}
