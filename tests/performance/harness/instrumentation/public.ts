import { scope } from "./records";
import type { Runner } from "@bernouy/http-runner";

/** Correlate native infrastructure mounts outside metadata-stripping handlers; never forward identity headers. */
export function instrumentPublicBinding(prototype: Pick<Runner, "get"> & Partial<Pick<Runner, "addEndpoint">>): void {
    const addEndpoint = prototype.addEndpoint;
    if (addEndpoint) {
        prototype.addEndpoint = function (method, path, handler, middleware) {
            if (method !== "QUERY" || !path.startsWith("/ulvia/operator/logs/")) {
                return addEndpoint.call(this, method, path, handler, middleware);
            }
            return addEndpoint.call(
                this,
                method,
                path,
                (request) => {
                    const traceId = request.headers.get("x-request-id");
                    return traceId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(traceId)
                        ? scope.run({ traceId, publicBinding: "ulvia/cluster.logs" }, () => handler(request))
                        : handler(request);
                },
                middleware,
            );
        };
    }
    const get = prototype.get;
    prototype.get = function (path, handler, middleware) {
        if (path !== "/hosting/tls/permission") {
            return get.call(this, path, handler, middleware);
        }
        return get.call(
            this,
            path,
            (request, ...args) => {
                const traceId = request.headers.get("x-request-id");
                return traceId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(traceId)
                    ? scope.run({ traceId, publicBinding: "ulvia/provider.tls" }, () => handler(request, ...args))
                    : handler(request, ...args);
            },
            middleware,
        );
    };
}
