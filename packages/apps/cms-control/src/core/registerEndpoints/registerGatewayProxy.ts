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
 * UNGUARDED — same as delivery: the gateway proxy is a public data-fetch surface.
 * Applying the admin guard would force a session on every proxied data call, which
 * contradicts the delivery mirror and the preview intent; it is registered before
 * control's guarded groups (first-match-wins) so the guard never intercepts it.
 *
 * `gateway` is the nullable repo field (NOT the throwing `get gateway()`), so an
 * unconfigured instance yields a clean 501 instead of an unhandled throw.
 */
export function registerGatewayProxy(opts: {
    runner: Runner;
    basePath: string;
    gateway: GatewayRepository | null | undefined;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}): void {
    const { runner, basePath, gateway, resolveSecret } = opts;
    const prefix = `${basePath}/.cms/gateway/`;

    runner.group("/.cms/gateway", (proxyRunner) => {
        for (const method of PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (req) =>
                handleGatewayRequest(gateway, req, { prefix, deps: { resolveSecret } }),
            );
        }
    });
}
