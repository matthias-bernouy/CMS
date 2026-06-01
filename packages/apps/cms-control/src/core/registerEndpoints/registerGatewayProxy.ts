import type { Runner } from "@bernouy/core";
import type { GatewayRepository } from "@bernouy/cms-gateway";
import { handleGatewayRequest } from "@bernouy/cms-gateway";

/** Methods the gateway proxy answers for (mirrors delivery's proxy group). */
const PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Mounts control's data-gateway proxy at `<basePath>/.cms/gateway/*`, delegating
 * to the shared `handleGatewayRequest`. Mirrors delivery's `registerDeliveryEndpoints`
 * proxy group, but wires `resolveSecret` so `secret`-sourced headers resolve (delivery's
 * stays unwired). The editor preview's `<cms-fetch>` blocs hit this same-origin route
 * (`{{BASE_PATH}}/.cms/gateway/<provider>/<endpoint>`) to render live gateway data.
 *
 * ADMIN-GUARDED: unlike delivery's public proxy, control's preview is admin-only —
 * the caller passes the admin `authGuard` as `middlewares`. The editor runs in the
 * admin's authenticated same-origin session, so its preview fetches carry it and pass.
 *
 * `gateway` is the nullable repo field (NOT the throwing `get gateway()`), so an
 * unconfigured instance yields a clean 501 instead of an unhandled throw.
 */
export function registerGatewayProxy(opts: {
    runner: Runner;
    basePath: string;
    gateway: GatewayRepository | null | undefined;
    resolveSecret: (ref: string) => Promise<string | undefined>;
    middlewares?: Parameters<Runner["group"]>[2];
}): void {
    const { runner, basePath, gateway, resolveSecret, middlewares } = opts;
    const prefix = `${basePath}/.cms/gateway/`;

    runner.group("/.cms/gateway", (proxyRunner) => {
        for (const method of PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (req) =>
                handleGatewayRequest(gateway, req, { prefix, deps: { resolveSecret } }),
            );
        }
    }, middlewares);
}
