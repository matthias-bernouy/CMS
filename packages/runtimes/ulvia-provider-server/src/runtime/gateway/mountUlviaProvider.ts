import { maintenancePaused } from "../recovery/maintenance";
import { EDGE_LEASE_PREFIX } from "@bernouy/hosting/routing";
import type { RoutingAuthority } from "@bernouy/hosting/routing";
import type { UlviaProviderOptions, ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import { BunRunner } from "@bernouy/http-runner";
import {
    ProviderOperatorApi,
    UlviaProvider,
    mountPublicCapabilities,
    mountOperatorCapabilities,
    type ProviderInstanceLifecycle,
} from "@bernouy/ulvia-provider";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { ProviderInstanceAuthenticator } from "../authentication/ProviderInstanceAuthenticator";
import type { ProviderInstanceHost } from "../instances/composition/ProviderInstanceHost";
import type { Logger } from "@bernouy/logging";

export type UlviaProviderServerHandle = Readonly<{
    stop(): Promise<void>;
}>;

/** Mounts one Provider host that resolves every request to an isolated instance runtime. */
export function mountUlviaProvider(options: {
    env: ProviderRuntimeEnv;
    authenticator: ProviderInstanceAuthenticator;
    host: ProviderInstanceHost;
    lifecycle: ProviderInstanceLifecycle;
    logger: Logger;
    tls?: UlviaProviderInstanceRuntime;
    clusterLogs?: UlviaProviderInstanceRuntime;
    readiness?: () => Promise<boolean>;
    routing: {
        authority: RoutingAuthority;
        instances: ProviderInstanceRegistry;
        authenticate: UlviaProviderOptions["authenticateInvocationToken"];
    };
}): UlviaProviderServerHandle {
    const { env, authenticator, host, lifecycle, logger, routing } = options;
    const controlInstance = async (token: string) => {
        if (!token.startsWith(EDGE_LEASE_PREFIX)) {
            return authenticator.authenticateControlToken(token);
        }
        const route = await routing.authority.authorizeControlToken(token);
        if (!route) {
            return null;
        }
        const instance = await routing.instances.get(route.instanceId);
        return instance?.status === "ready" && instance.revision === route.instanceRevision ? instance : null;
    };
    const runner = new BunRunner({ hostname: env.ULVIA_PROVIDER_HOST, logger, idleTimeoutSeconds: 60 });
    runner.use(async (request, next) => {
        const path = new URL(request.url).pathname;
        const readinessRouting = request.method === "QUERY" && path === "/hosting/routing/resolve";
        if (maintenancePaused() && !readinessRouting && !["/healthz", "/readyz"].includes(path)) {
            return new Response("Installation maintenance", { status: 503, headers: { "retry-after": "1" } });
        }
        return next();
    });
    runner.get("/healthz", () => new Response(null, { status: 204 }));
    runner.get("/readyz", async () => {
        try {
            return new Response(null, {
                status: !options.readiness || (await options.readiness()) ? 204 : 503,
                headers: { "ulvia-maintenance": maintenancePaused() ? "paused" : "active" },
            });
        } catch {
            return new Response(null, { status: 503 });
        }
    });
    new ProviderOperatorApi(runner, env.ULVIA_PROVIDER_OPERATOR_TOKEN, lifecycle);
    const operatorReport = options.clusterLogs
        ? mountOperatorCapabilities(runner, options.clusterLogs, env.ULVIA_PROVIDER_OPERATOR_TOKEN)
        : undefined;
    if (options.tls) {
        mountPublicCapabilities(runner, options.tls, logger);
    }
    new UlviaProvider(runner, {
        logger,
        authenticateReportToken: async (token) => {
            const operator = operatorReport?.(token);
            if (operator) {
                return operator;
            }
            const instance = token.startsWith(EDGE_LEASE_PREFIX)
                ? await controlInstance(token)
                : await authenticator.authenticateReportToken(token);
            return instance ? host.runtime(instance) : null;
        },
        authenticateControlToken: async (token) => {
            const startedAt = performance.now();
            const instance = await controlInstance(token);
            reportAuthentication(logger, "control", performance.now() - startedAt, Boolean(instance));
            return instance ? host.runtime(instance) : null;
        },
        authenticateInvocationToken: async (token) => {
            const machine = await routing.authenticate(token);
            if (machine) {
                return machine;
            }
            const startedAt = performance.now();
            const authentication = await authenticator.authenticateInvocationToken(token);
            reportAuthentication(logger, "invocation", performance.now() - startedAt, Boolean(authentication));
            if (!authentication) {
                return null;
            }
            return { lease: await host.runtime(authentication.instance), claims: authentication.claims };
        },
    });
    runner.start({ port: env.ULVIA_PROVIDER_PORT });
    return { stop: () => runner.stopGracefully() };
}

function reportAuthentication(logger: Logger, kind: string, durationMs: number, accepted: boolean): void {
    const attributes = { kind, accepted, durationMs: Math.round(durationMs * 100) / 100 };
    if (durationMs >= 50) {
        logger.info("provider.authentication.completed", attributes);
        return;
    }
    logger.debug("provider.authentication.completed", attributes);
}
