import type { Runner, Middleware } from "@bernouy/http-runner";
import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { ExecutorDeps } from "../core/executeEndpoint";
import { handleGatewayRequest } from "./handleGatewayRequest";

/** Methods the gateway proxy answers for. */
const PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Mount the data-gateway proxy at `<basePath>/.cms/gateway/*` on `runner`,
 * delegating every method to the shared `handleGatewayRequest`. Called identically
 * by Delivery (public, no `deps`) and Control (admin-guarded preview, pass
 * `deps.resolveSecret` so `secret`-sourced headers resolve + `middlewares:[authGuard]`).
 * The strip-prefix is derived from `runner.basePath`, so tenant scoping is automatic.
 *
 * `gateway` is the nullable repo, so an unconfigured instance yields a clean 501.
 */
export function registerGatewayEndpoint(opts: {
    runner:       Runner;
    gateway:      GatewayRepository | null | undefined;
    deps?:        ExecutorDeps;
    middlewares?: Middleware[];
}): void {
    const base   = opts.runner.basePath === "/" ? "" : opts.runner.basePath;
    const prefix = `${base}/.cms/gateway/`;
    opts.runner.group("/.cms/gateway", (proxyRunner) => {
        for (const method of PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (req) =>
                handleGatewayRequest(opts.gateway, req, { prefix, deps: opts.deps }));
        }
    }, opts.middlewares);
}
