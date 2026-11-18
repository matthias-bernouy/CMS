import { scope } from "./records";
import type { Runner } from "@bernouy/http-runner";

/** Correlate this anonymous mount outside its metadata-stripping handler; never forward headers into domain scope. */
export function instrumentPublicBinding(prototype: Pick<Runner, "get">): void {
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
